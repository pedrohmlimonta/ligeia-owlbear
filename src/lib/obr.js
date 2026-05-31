// ===========================================================================
// Ligeia RPG — Integração com Owlbear Rodeo
//
// Esta camada centraliza o uso da SDK do OBR. Tudo é envolto em try/catch
// porque a extensão também precisa rodar fora do OBR (modo "standalone")
// para desenvolvimento e testes diretos no navegador.
// ===========================================================================

import OBR, { buildShape } from "@owlbear-rodeo/sdk";
import { slimCharacter } from "./character.js";

const CHANNEL_ROLLS = "ligeia.rolls";
const STORAGE_CHARACTERS = "ligeia.characters";
// Prefixo para salvar cada personagem em sua PRÓPRIA chave de metadata.
// O Owlbear limita cada item de metadata a 16 kB; com uma chave por
// personagem, cada um tem seu próprio orçamento em vez de compartilhar
// um único objeto que estoura rápido.
const CHAR_KEY_PREFIX = "ligeia.char.";
const charKey = (id) => `${CHAR_KEY_PREFIX}${id}`;

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

const CHANNEL_ROLLS_LOCAL = "ligeia.rolls.local";
const CHANNEL_REVEAL = "ligeia.rolls.reveal";

/**
 * Envia uma rolagem para o canal compartilhado, para que todos os jogadores
 * na sala vejam o resultado.
 *
 * - Se `options.hidden === true`, a rolagem é marcada como oculta. Players
 *   recebem normalmente, mas verão "???" no lugar do total enquanto não for
 *   revelada pelo Narrador (com `revealRoll`).
 */
export async function broadcastRoll(rollResult, characterName = "—", options = {}) {
  if (!isInsideOBR()) return;
  await whenOBRReady();
  try {
    let fromRole = "GM";
    let fromPlayerId = null;
    try {
      fromRole = await OBR.player.getRole();
    } catch {}
    try {
      fromPlayerId = OBR.player.id;
    } catch {}

    const payload = {
      ...rollResult,
      characterName,
      fromRole,
      fromPlayerId,
      hidden: !!options.hidden,
    };

    // 1) Enviar para todos os outros (mesa). Players com `hidden: true` ainda
    //    veem a rolagem aparecer, mas com valor mascarado.
    await OBR.broadcast.sendMessage(CHANNEL_ROLLS, payload, {
      destination: "REMOTE",
    });

    // 2) Disparar overlay/histórico também localmente para o autor.
    try {
      await OBR.broadcast.sendMessage(CHANNEL_ROLLS_LOCAL, payload, {
        destination: "LOCAL",
      });
    } catch (e) {
      console.warn(e);
    }
  } catch (e) {
    console.warn("Falha ao transmitir rolagem:", e);
  }
}

/**
 * O Narrador revela uma rolagem que estava oculta. Todos os clientes
 * atualizam o histórico/overlay correspondente.
 */
export async function revealRoll(rollId) {
  if (!isInsideOBR() || !rollId) return;
  await whenOBRReady();
  try {
    // Broadcast REMOTO
    await OBR.broadcast.sendMessage(
      CHANNEL_REVEAL,
      { rollId },
      { destination: "REMOTE" },
    );
    // E também LOCAL para que o próprio GM atualize sua UI
    await OBR.broadcast.sendMessage(
      CHANNEL_REVEAL,
      { rollId },
      { destination: "LOCAL" },
    );
  } catch (e) {
    console.warn("Falha ao revelar rolagem:", e);
  }
}

/** Inscreve callback para mensagens de revelação. */
export function onRollReveal(callback) {
  if (!isInsideOBR()) return () => {};
  let unsub = () => {};
  whenOBRReady().then(() => {
    unsub = OBR.broadcast.onMessage(CHANNEL_REVEAL, (event) => {
      callback(event.data);
    });
  });
  return () => unsub();
}

/**
 * Fecha o popover de overlay de rolagem (chamado de dentro da própria
 * janela de overlay quando o usuário clica em fechar).
 */
export async function closeRollOverlay() {
  if (!isInsideOBR()) {
    window.close();
    return;
  }
  await whenOBRReady();
  try {
    await OBR.popover.close("ligeia.rollOverlay");
  } catch {
    window.close();
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
 * Inscreve um callback que recebe TODAS as rolagens — locais (de quem rola)
 * e remotas (de outros). Use isto onde o histórico deve mostrar tudo.
 */
export function onAnyRoll(callback) {
  if (!isInsideOBR()) return () => {};
  const unsubs = [];
  whenOBRReady().then(() => {
    unsubs.push(
      OBR.broadcast.onMessage(CHANNEL_ROLLS, (event) => callback(event.data)),
    );
    unsubs.push(
      OBR.broadcast.onMessage(CHANNEL_ROLLS_LOCAL, (event) =>
        callback(event.data),
      ),
    );
  });
  return () => {
    for (const u of unsubs) {
      try {
        u();
      } catch {}
    }
  };
}

/**
 * Salva um personagem na sala (metadata da room). Cada personagem fica
 * em sua própria chave (ligeia.char.<id>) para respeitar o limite de
 * 16 kB por item de metadata do Owlbear.
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
    // Enxuga o personagem (remove campos vazios) para caber no limite.
    const slim = slimCharacter(character);
    const payload = JSON.stringify(slim);
    const bytes = new Blob([payload]).size;
    if (bytes > 15500) {
      throw new Error(
        `Personagem "${character.name || character.id}" tem ${(bytes / 1024).toFixed(1)} kB, ` +
        `acima do limite de 16 kB do Owlbear. Remova descrições longas ou itens.`,
      );
    }
    await OBR.room.setMetadata({ [charKey(character.id)]: slim });
  } catch (e) {
    console.warn("Falha ao salvar na sala, usando localStorage:", e);
    const all = loadCharactersFromLocal();
    all[character.id] = character;
    localStorage.setItem(STORAGE_CHARACTERS, JSON.stringify(all));
    // Re-lança erros de tamanho para a UI poder avisar o usuário.
    if (e instanceof Error && e.message.includes("limite")) throw e;
  }
}

/**
 * Lê todos os personagens conhecidos. Junta:
 *  - chaves individuais ligeia.char.<id> (novo formato)
 *  - o objeto legado ligeia.characters (formato antigo, migrado em leitura)
 *  - fallback local
 */
export async function loadCharacters() {
  if (!isInsideOBR()) return loadCharactersFromLocal();
  await whenOBRReady();
  try {
    const data = await OBR.room.getMetadata();
    const out = {};

    // Formato legado: tudo num objeto só.
    const legacy = data[STORAGE_CHARACTERS];
    if (legacy && typeof legacy === "object") {
      for (const [id, c] of Object.entries(legacy)) {
        out[id] = c;
      }
    }

    // Formato novo: uma chave por personagem (sobrescreve o legado).
    for (const [key, value] of Object.entries(data)) {
      if (key.startsWith(CHAR_KEY_PREFIX) && value && typeof value === "object") {
        out[value.id || key.slice(CHAR_KEY_PREFIX.length)] = value;
      }
    }

    return out;
  } catch (e) {
    console.warn("Falha ao ler da sala, usando localStorage:", e);
    return loadCharactersFromLocal();
  }
}

/**
 * Migra personagens do formato legado (todos numa chave ligeia.characters)
 * para chaves individuais (ligeia.char.<id>), e esvazia a chave legada.
 * Faz isso em lotes, respeitando o limite de 16 kB por item.
 *
 * Retorna { migrated, failed } com os ids processados.
 */
export async function migrateLegacyCharacters() {
  if (!isInsideOBR()) return { migrated: [], failed: [] };
  await whenOBRReady();
  const migrated = [];
  const failed = [];
  try {
    const data = await OBR.room.getMetadata();
    const legacy = data[STORAGE_CHARACTERS];
    if (!legacy || typeof legacy !== "object" || Object.keys(legacy).length === 0) {
      return { migrated, failed };
    }

    // Move cada personagem para sua própria chave.
    for (const [id, char] of Object.entries(legacy)) {
      try {
        const slim = slimCharacter(char);
        const bytes = new Blob([JSON.stringify(slim)]).size;
        if (bytes > 15500) {
          // Grande demais até sozinho — deixa no legado e marca falha.
          failed.push(id);
          continue;
        }
        await OBR.room.setMetadata({ [charKey(id)]: slim });
        migrated.push(id);
      } catch (e) {
        console.warn(`Falha ao migrar personagem ${id}:`, e);
        failed.push(id);
      }
    }

    // Esvazia a chave legada APENAS dos que migraram com sucesso.
    if (failed.length === 0) {
      // Tudo migrou — remove a chave legada inteira.
      await OBR.room.setMetadata({ [STORAGE_CHARACTERS]: undefined });
    } else {
      // Mantém só os que falharam na chave legada.
      const remaining = {};
      for (const id of failed) remaining[id] = legacy[id];
      await OBR.room.setMetadata({ [STORAGE_CHARACTERS]: remaining });
    }
  } catch (e) {
    console.warn("Falha na migração de personagens:", e);
  }
  return { migrated, failed };
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
    // Remove a chave individual.
    await OBR.room.setMetadata({ [charKey(id)]: undefined });
    // Também remove do objeto legado, se existir lá.
    const data = await OBR.room.getMetadata();
    const legacy = data[STORAGE_CHARACTERS];
    if (legacy && typeof legacy === "object" && legacy[id]) {
      const copy = { ...legacy };
      delete copy[id];
      await OBR.room.setMetadata({ [STORAGE_CHARACTERS]: copy });
    }
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
      const out = {};
      // Legado
      const legacy = meta[STORAGE_CHARACTERS];
      if (legacy && typeof legacy === "object") {
        for (const [id, c] of Object.entries(legacy)) out[id] = c;
      }
      // Chaves individuais
      for (const [key, value] of Object.entries(meta)) {
        if (key.startsWith(CHAR_KEY_PREFIX) && value && typeof value === "object") {
          out[value.id || key.slice(CHAR_KEY_PREFIX.length)] = value;
        }
      }
      callback(out);
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
    window.open(url, "_blank", "width=1000,height=500");
    return;
  }
  await whenOBRReady();
  try {
    // Tamanhos fixos. `window.innerWidth` aqui é o iframe da extensão
    // (estreito), então não serve para dimensionar a ficha — o OBR
    // posiciona o modal sobre toda a tela, e ele se adapta ao espaço
    // disponível automaticamente quando a viewport é menor que esses
    // valores.
    await OBR.modal.open({
      id: "ligeia.sheet",
      url,
      width: 1000,
      height: 500,
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
   Identidade do jogador local + party
   ============================================================================ */

/** ID estável deste jogador (persiste entre reconexões). */
export async function getMyPlayerId() {
  if (!isInsideOBR()) return "standalone";
  await whenOBRReady();
  try {
    return await OBR.player.getId();
  } catch {
    return null;
  }
}

/** Informações completas do player local. */
export async function getMyPlayerInfo() {
  if (!isInsideOBR()) {
    return { id: "standalone", name: "Você", role: "GM", selection: [] };
  }
  await whenOBRReady();
  try {
    const [id, name, role, selection] = await Promise.all([
      OBR.player.getId(),
      OBR.player.getName().catch(() => "Você"),
      OBR.player.getRole(),
      OBR.player.getSelection().catch(() => []),
    ]);
    return { id, name, role, selection: selection || [] };
  } catch {
    return null;
  }
}

/**
 * Assina mudanças na party (outros jogadores na sala).
 * O callback recebe um array de { id, name, role, selection: [tokenIds] }
 */
export function onPartyChange(callback) {
  if (!isInsideOBR()) {
    callback([]);
    return () => {};
  }
  let unsub = () => {};
  whenOBRReady().then(() => {
    unsub = OBR.party.onChange((players) => {
      callback(
        (players || []).map((p) => ({
          id: p.id,
          name: p.name,
          role: p.role,
          selection: p.selection || [],
          color: p.color,
        })),
      );
    });
    // dispara o estado inicial
    OBR.party
      .getPlayers()
      .then((players) =>
        callback(
          (players || []).map((p) => ({
            id: p.id,
            name: p.name,
            role: p.role,
            selection: p.selection || [],
            color: p.color,
          })),
        ),
      )
      .catch(() => {});
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

/* ============================================================================
   Barras de status (HP, MP, Pontos Heroicos) anexadas ao token
   ============================================================================ */

const BAR_HEIGHT = 12;     // altura de cada barra (unidades da cena)
const BAR_GAP = 2;         // espaçamento vertical
const BAR_OFFSET_Y = 4;    // distância entre o token e a primeira barra

const BAR_COLORS = {
  hp:   { fg: "#c0392b", bg: "#2a0d0a" }, // vermelho
  mp:   { fg: "#5dade2", bg: "#102a3a" }, // azul claro
  hero: { fg: "#27ae60", bg: "#0e2a18" }, // verde
};

const BAR_ORDER = ["hp", "mp", "hero"];

/**
 * Atualiza (ou cria) as barras de status do token vinculado.
 * Apaga as antigas e reconstrói com os valores atuais.
 *
 * `stats` é { hp:{current,max}, mp:{current,max}, hero:{current,max} }.
 * `npc` controla visibilidade (true = só GM/dono enxerga).
 *
 * Apenas o GM tem permissão para escrever items na cena, então
 * jogadores ignoram a chamada silenciosamente.
 */
export async function updateTokenBars(tokenId, characterId, stats, npc = false) {
  if (!isInsideOBR() || !tokenId || !characterId || !stats) return;
  await whenOBRReady();
  // Tentamos atualizar mesmo como Jogador: ele tem permissão de
  // escrita em items que possui (seu próprio token). Se falhar, ignoramos.

  try {
    // 1. Confirma que o token ainda existe
    const tokenItems = await OBR.scene.items.getItems([tokenId]);
    if (!tokenItems || tokenItems.length === 0) return;

    // 2. Pega o bounding box (em coordenadas de cena) para posicionar
    const bounds = await OBR.scene.items.getItemBounds([tokenId]);
    if (!bounds) return;
    const left = bounds.min.x;
    const right = bounds.max.x;
    const bottom = bounds.max.y;
    const width = right - left;
    if (width <= 0) return;

    // 3. Remove barras antigas dessa ficha
    await removeTokenBars(characterId);

    // 4. Constrói as novas barras
    const newItems = [];
    BAR_ORDER.forEach((type, idx) => {
      const st = stats[type];
      if (!st || st.max <= 0) return; // não cria barra com max=0
      const ratio = Math.max(0, Math.min(1, st.current / st.max));
      const y = bottom + BAR_OFFSET_Y + idx * (BAR_HEIGHT + BAR_GAP);
      const colors = BAR_COLORS[type];

      // Fundo (sempre largura total)
      const bg = buildShape()
        .shapeType("RECTANGLE")
        .position({ x: left, y })
        .width(width)
        .height(BAR_HEIGHT)
        .fillColor(colors.bg)
        .fillOpacity(0.85)
        .strokeColor("#000000")
        .strokeWidth(1)
        .strokeOpacity(0.8)
        .attachedTo(tokenId)
        .layer("ATTACHMENT")
        .locked(true)
        .disableHit(true)
        .visible(!npc) // NPCs: apenas GM vê
        .metadata({
          "ligeia/barOf": characterId,
          "ligeia/barType": type,
          "ligeia/barRole": "bg",
        })
        .build();
      newItems.push(bg);

      // Preenchimento proporcional
      const fillWidth = Math.max(0.5, width * ratio); // mínimo visível
      if (ratio > 0) {
        const fg = buildShape()
          .shapeType("RECTANGLE")
          .position({ x: left, y })
          .width(fillWidth)
          .height(BAR_HEIGHT)
          .fillColor(colors.fg)
          .fillOpacity(1)
          .strokeColor("#000000")
          .strokeWidth(0)
          .strokeOpacity(0)
          .attachedTo(tokenId)
          .layer("ATTACHMENT")
          .locked(true)
          .disableHit(true)
          .visible(!npc)
          .metadata({
            "ligeia/barOf": characterId,
            "ligeia/barType": type,
            "ligeia/barRole": "fg",
          })
          .build();
        newItems.push(fg);
      }

      // Overlay de PV TEMPORÁRIOS (apenas no PV)
      // Renderizado como uma faixa ciano fina no topo da barra,
      // proporcional ao temp em relação ao max (cap em 1 max).
      if (type === "hp" && st.temp && st.temp > 0 && st.max > 0) {
        const tempRatio = Math.min(1, st.temp / st.max);
        const tempW = Math.max(0.5, width * tempRatio);
        const tempH = Math.max(2, BAR_HEIGHT * 0.45);
        const tempFg = buildShape()
          .shapeType("RECTANGLE")
          .position({ x: left, y })
          .width(tempW)
          .height(tempH)
          .fillColor("#5fd0c8")
          .fillOpacity(1)
          .strokeColor("#000000")
          .strokeWidth(0)
          .strokeOpacity(0)
          .attachedTo(tokenId)
          .layer("ATTACHMENT")
          .locked(true)
          .disableHit(true)
          .visible(!npc)
          .metadata({
            "ligeia/barOf": characterId,
            "ligeia/barType": type,
            "ligeia/barRole": "temp",
          })
          .build();
        newItems.push(tempFg);
      }
    });

    if (newItems.length > 0) {
      await OBR.scene.items.addItems(newItems);
    }
  } catch (e) {
    console.warn("Falha ao atualizar barras do token:", e);
  }
}

/** Remove todas as barras associadas a uma ficha. */
export async function removeTokenBars(characterId) {
  if (!isInsideOBR() || !characterId) return;
  await whenOBRReady();
  try {
    const all = await OBR.scene.items.getItems();
    const toRemove = all
      .filter((it) => it.metadata?.["ligeia/barOf"] === characterId)
      .map((it) => it.id);
    if (toRemove.length > 0) {
      await OBR.scene.items.deleteItems(toRemove);
    }
  } catch (e) {
    console.warn(e);
  }
}

/* ============================================================================
   Observação da cena para auto-vinculação de tokens a players
   ============================================================================ */

/**
 * Assina mudanças nos items da cena. Útil para a extensão reagir quando
 * o GM adiciona um token controlado por um player ao mapa.
 *
 * O callback recebe o array completo de items.
 */
export function onSceneItemsChange(callback) {
  if (!isInsideOBR()) return () => {};
  let unsub = () => {};
  whenOBRReady().then(() => {
    // Estado inicial
    OBR.scene.items.getItems().then((items) => callback(items || [])).catch(() => {});
    unsub = OBR.scene.items.onChange((items) => callback(items || []));
  });
  return () => unsub();
}
