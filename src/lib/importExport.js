// ===========================================================================
// Import / Export de fichas em JSON
// ===========================================================================
import { migrateCharacter } from "./character.js";

const EXPORT_VERSION = 1;
const EXPORT_KIND = "ligeia-character";

/**
 * Exporta a ficha como objeto serializável (puro JSON).
 * Remove ids/refs que dependem da sala atual (tokenIds, ownership)
 * mas mantém TODOS os dados editáveis da ficha.
 */
export function characterToExportObject(character) {
  if (!character) return null;
  // Clone profundo via JSON para garantir serialização
  const data = JSON.parse(JSON.stringify(character));

  // Limpa referências específicas à sala atual
  delete data.tokenIds;
  delete data.playerId;

  return {
    kind: EXPORT_KIND,
    exportVersion: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    character: data,
  };
}

/**
 * Dispara download do arquivo JSON no navegador.
 */
export function downloadCharacterJson(character) {
  const obj = characterToExportObject(character);
  if (!obj) return;
  const blob = new Blob([JSON.stringify(obj, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const safeName = (character.name || "ficha")
    .toLowerCase()
    .replace(/[^a-z0-9\u00C0-\u017F]+/gi, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  a.download = `${safeName || "ficha"}-ligeia.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Importa um arquivo JSON e retorna o objeto character normalizado.
 * Lança Error se o arquivo for inválido.
 *
 * Aceita 3 formatos:
 *  - {kind:"ligeia-character", character: {...}}   (formato oficial)
 *  - {kind:"ligeia-character", ...character}        (sem wrapper, retrocompat)
 *  - {...character}                                 (objeto puro)
 */
export function parseImportedJson(text, options = {}) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    throw new Error("Arquivo JSON inválido: " + e.message);
  }

  let charData;
  if (raw && raw.character && typeof raw.character === "object") {
    if (raw.kind && raw.kind !== EXPORT_KIND) {
      throw new Error(
        `Arquivo não é uma ficha de Ligeia (kind="${raw.kind}").`,
      );
    }
    charData = raw.character;
  } else if (raw && raw.attributes && raw.name !== undefined) {
    // Parece ser ficha "crua"
    charData = raw;
  } else {
    throw new Error(
      "Arquivo não parece uma ficha válida (campos esperados ausentes).",
    );
  }

  // Validação mínima
  if (!charData.attributes || typeof charData.attributes !== "object") {
    throw new Error("Ficha sem 'attributes' — arquivo provavelmente corrompido.");
  }

  // Decide id: se manter ou regenerar
  if (options.regenerateId || !charData.id) {
    charData.id = crypto.randomUUID();
  }

  // Limpa refs específicas (não as importamos)
  delete charData.tokenIds;
  // Apenas o GM define playerId; se não passar regenerateOwner, mantém
  if (options.clearOwner) delete charData.playerId;

  // Normaliza via a migração (preenche campos faltantes, ajusta formato antigo)
  return migrateCharacter(charData);
}

/**
 * Lê um File (input type=file) e retorna texto.
 */
export function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Falha ao ler o arquivo"));
    reader.readAsText(file);
  });
}
