// ===========================================================================
// Background page — sempre rodando enquanto a extensão está ativa.
//
// Função: escutar broadcasts de rolagens e abrir um popover central de
// overlay que aparece sobre toda a UI do Owlbear, mesmo quando o popover
// principal da Ligeia está fechado.
//
// O popover criado aqui aponta para roll-overlay.html, que renderiza a
// animação dos dados e o resultado, depois fecha automaticamente.
// ===========================================================================

import OBR from "@owlbear-rodeo/sdk";
import { buildRollOverlayUrl } from "./lib/rollPayload.js";

const CHANNEL_ROLLS = "ligeia.rolls";
const POPOVER_ID = "ligeia.rollOverlay";
const POPOVER_DURATION_MS = 5500;

let dismissTimer = null;

OBR.onReady(() => {
  // Escuta rolagens vindas da mesa (REMOTE) — o broadcast já filtra
  // pra não bater no autor, mas vamos garantir abrindo a janela.
  OBR.broadcast.onMessage(CHANNEL_ROLLS, async (event) => {
    try {
      await showOverlay(event.data);
    } catch (e) {
      console.warn("Ligeia background: falha ao abrir overlay", e);
    }
  });

  // Também escutamos as rolagens do PRÓPRIO autor via canal local.
  // Isso é usado pelo popover/sheet/dice rolling para acionar o overlay
  // ao autor também, sem ter que duplicar lógica.
  OBR.broadcast.onMessage("ligeia.rolls.local", async (event) => {
    try {
      await showOverlay(event.data);
    } catch (e) {
      console.warn(e);
    }
  });
});

async function showOverlay(roll) {
  if (!roll) return;

  // Fecha overlay anterior se ainda estiver aberto (rolagens em sequência)
  if (dismissTimer) {
    clearTimeout(dismissTimer);
    dismissTimer = null;
    try {
      await OBR.popover.close(POPOVER_ID);
    } catch {}
  }

  const url = buildRollOverlayUrl(roll);

  await OBR.popover.open({
    id: POPOVER_ID,
    url,
    width: 380,
    height: 360,
    anchorOrigin: { vertical: "CENTER", horizontal: "CENTER" },
    transformOrigin: { vertical: "CENTER", horizontal: "CENTER" },
    disableClickAway: false,
  });

  // Auto-dismiss
  dismissTimer = setTimeout(async () => {
    dismissTimer = null;
    try {
      await OBR.popover.close(POPOVER_ID);
    } catch {}
  }, POPOVER_DURATION_MS);
}
