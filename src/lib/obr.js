// ===========================================================================
// Ligeia RPG — Integração com Owlbear Rodeo
//
// Esta camada centraliza o uso da SDK do OBR. Tudo é envolto em try/catch
// porque a extensão também precisa rodar fora do OBR (modo "standalone")
// para desenvolvimento e testes diretos no navegador.
// ===========================================================================

import OBR from "@owlbear-rodeo/sdk";

const CHANNEL_ROLLS = "ligeia.rolls";
const STORAGE_CHARACTERS = "ligeia.characters";

let _ready = null;

/**
 * Garante que a extensão só rode depois que o OBR estiver disponível.
 * Retorna `true` se estiver rodando dentro do OBR; `false` caso contrário.
 */
export function isInsideOBR() {
  try {
    return OBR && typeof OBR.isReady !== "undefined";
  } catch {
    return false;
  }
}

export async function whenOBRReady() {
  if (!isInsideOBR()) return false;
  if (_ready) return _ready;

  _ready = new Promise((resolve) => {
    if (OBR.isReady) {
      resolve(true);
    } else {
      OBR.onReady(() => resolve(true));
    }
  });
  return _ready;
}

/**
 * Envia uma rolagem para o canal compartilhado, para que todos os jogadores
 * na sala vejam o resultado.
 */
export async function broadcastRoll(rollResult, characterName = "—") {
  if (!isInsideOBR()) return;
  await whenOBRReady();
  try {
    await OBR.broadcast.sendMessage(
      CHANNEL_ROLLS,
      { ...rollResult, characterName },
      { destination: "REMOTE" }, // os outros recebem; o autor processa local
    );
  } catch (e) {
    console.warn("Falha ao transmitir rolagem:", e);
  }
}

/**
 * Inscreve um callback que dispara quando outros jogadores rolam dados.
 * Retorna função para cancelar a inscrição.
 */
export function onRemoteRoll(callback) {
  if (!isInsideOBR()) return () => {};
  let unsub = () => {};
  whenOBRReady().then(() => {
    unsub = OBR.broadcast.onMessage(CHANNEL_ROLLS, (event) => {
      callback(event.data);
    });
  });
  return () => unsub();
}

/**
 * Salva um personagem na sala (metadata da room). Compartilhado entre
 * narrador e jogadores que tenham permissão de leitura.
 */
export async function saveCharacterToRoom(character) {
  if (!isInsideOBR()) {
    // Fallback: localStorage
    const all = loadCharactersFromLocal();
    all[character.id] = character;
    localStorage.setItem(STORAGE_CHARACTERS, JSON.stringify(all));
    return;
  }
  await whenOBRReady();
  try {
    const current = (await OBR.room.getMetadata())[STORAGE_CHARACTERS] || {};
    current[character.id] = character;
    await OBR.room.setMetadata({ [STORAGE_CHARACTERS]: current });
  } catch (e) {
    console.warn("Falha ao salvar na sala, usando localStorage:", e);
    const all = loadCharactersFromLocal();
    all[character.id] = character;
    localStorage.setItem(STORAGE_CHARACTERS, JSON.stringify(all));
  }
}

/**
 * Lê todos os personagens conhecidos (room metadata + fallback local).
 */
export async function loadCharacters() {
  if (!isInsideOBR()) return loadCharactersFromLocal();
  await whenOBRReady();
  try {
    const data = await OBR.room.getMetadata();
    return data[STORAGE_CHARACTERS] || {};
  } catch (e) {
    console.warn("Falha ao ler da sala, usando localStorage:", e);
    return loadCharactersFromLocal();
  }
}

export async function deleteCharacter(id) {
  if (!isInsideOBR()) {
    const all = loadCharactersFromLocal();
    delete all[id];
    localStorage.setItem(STORAGE_CHARACTERS, JSON.stringify(all));
    return;
  }
  await whenOBRReady();
  try {
    const current = (await OBR.room.getMetadata())[STORAGE_CHARACTERS] || {};
    delete current[id];
    await OBR.room.setMetadata({ [STORAGE_CHARACTERS]: current });
  } catch (e) {
    console.warn(e);
  }
}

function loadCharactersFromLocal() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_CHARACTERS) || "{}");
  } catch {
    return {};
  }
}

/**
 * Inscreve-se em mudanças nos personagens da sala. Útil para o popover
 * principal refletir alterações feitas em outras janelas/abas.
 */
export function onCharactersChanged(callback) {
  if (!isInsideOBR()) {
    const handler = () => callback(loadCharactersFromLocal());
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }
  let unsub = () => {};
  whenOBRReady().then(() => {
    unsub = OBR.room.onMetadataChange((meta) => {
      callback(meta[STORAGE_CHARACTERS] || {});
    });
  });
  return () => unsub();
}

/**
 * Abre uma janela modal dentro do OBR para a ficha de personagem.
 * Em modo standalone, abre uma nova aba.
 */
export async function openCharacterSheet(characterId) {
  // Constrói URL absoluta relativa à página atual para evitar
  // problemas de resolução de caminho dentro do iframe do Owlbear.
  const url = new URL(
    `sheet.html?id=${encodeURIComponent(characterId)}`,
    window.location.href
  ).toString();
  if (!isInsideOBR()) {
    window.open(url, "_blank", "width=1000,height=900");
    return;
  }
  await whenOBRReady();
  try {
    await OBR.modal.open({
      id: "ligeia.sheet",
      url,
      width: 1000,
      height: 900,
    });
  } catch (e) {
    console.warn(e);
  }
}

/**
 * Abre o rolador de dados em uma janela popover.
 */
export async function openDiceRoller() {
  const url = new URL("dice.html", window.location.href).toString();
  if (!isInsideOBR()) {
    window.open(url, "_blank", "width=600,height=700");
    return;
  }
  await whenOBRReady();
  try {
    await OBR.popover.open({
      id: "ligeia.dice",
      url,
      width: 560,
      height: 680,
      anchorOrigin: { vertical: "CENTER", horizontal: "CENTER" },
      transformOrigin: { vertical: "CENTER", horizontal: "CENTER" },
    });
  } catch (e) {
    console.warn(e);
  }
}

/* ============================================================================
   Papel do jogador (GM vs PLAYER)
   ============================================================================ */

/** Retorna "GM" ou "PLAYER". Em standalone (fora do OBR) considera GM. */
export async function getPlayerRole() {
  if (!isInsideOBR()) return "GM";
  await whenOBRReady();
  try {
    return await OBR.player.getRole();
  } catch {
    return "PLAYER";
  }
}

/** Assina mudanças no papel do jogador. Retorna unsubscribe. */
export function onRoleChange(callback) {
  if (!isInsideOBR()) {
    callback("GM");
    return () => {};
  }
  let unsub = () => {};
  whenOBRReady().then(() => {
    unsub = OBR.player.onChange((player) => {
      callback(player.role);
    });
    // dispara o estado inicial
    OBR.player.getRole().then(callback).catch(() => {});
  });
  return () => unsub();
}

/* ============================================================================
   Seleção de tokens / vínculo com items da cena
   ============================================================================ */

/** Retorna array de IDs de items atualmente selecionados na cena. */
export async function getSelectedItemIds() {
  if (!isInsideOBR()) return [];
  await whenOBRReady();
  try {
    return (await OBR.player.getSelection()) || [];
  } catch {
    return [];
  }
}

/** Retorna o item (token) com o id informado, ou null. */
export async function getItemById(itemId) {
  if (!isInsideOBR() || !itemId) return null;
  await whenOBRReady();
  try {
    const items = await OBR.scene.items.getItems([itemId]);
    return items?.[0] || null;
  } catch {
    return null;
  }
}

/**
 * Marca/anota o item da cena (token) com o id da ficha vinculada.
 * Isso permite que o context menu apareça apenas em tokens vinculados.
 */
export async function linkCharacterToItem(itemId, characterId) {
  if (!isInsideOBR() || !itemId) return;
  await whenOBRReady();
  try {
    await OBR.scene.items.updateItems([itemId], (items) => {
      items.forEach((it) => {
        it.metadata = it.metadata || {};
        it.metadata["ligeia/characterId"] = characterId;
      });
    });
  } catch (e) {
    console.warn("Falha ao vincular token:", e);
  }
}

/** Remove o vínculo de um item de cena. */
export async function unlinkItem(itemId) {
  if (!isInsideOBR() || !itemId) return;
  await whenOBRReady();
  try {
    await OBR.scene.items.updateItems([itemId], (items) => {
      items.forEach((it) => {
        if (it.metadata) delete it.metadata["ligeia/characterId"];
      });
    });
  } catch (e) {
    console.warn(e);
  }
}

/**
 * Registra um item no menu de contexto da cena: "Abrir Ficha (Ligeia)".
 * Aparece apenas em tokens cujo metadata contém "ligeia/characterId".
 *
 * Deve ser chamado uma vez na inicialização da extensão (popover principal).
 */
export async function registerContextMenu() {
  if (!isInsideOBR()) return;
  await whenOBRReady();
  try {
    await OBR.contextMenu.create({
      id: "ligeia.openSheet",
      icons: [
        {
          icon: "/icon.svg",
          label: "Abrir Ficha (Ligeia)",
          filter: {
            every: [
              { key: ["metadata", "ligeia/characterId"], operator: "!=", value: undefined },
            ],
            permissions: ["UPDATE"],
          },
        },
      ],
      onClick: async (context) => {
        const item = context.items?.[0];
        const charId = item?.metadata?.["ligeia/characterId"];
        if (charId) {
          openCharacterSheet(charId);
        }
      },
    });
  } catch (e) {
    console.warn("Falha ao registrar context menu:", e);
  }
}
