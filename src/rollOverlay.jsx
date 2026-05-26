import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { LiveRollOverlay } from "./components/LiveRollOverlay.jsx";
import {
  onRemoteRoll,
  whenOBRReady,
  isInsideOBR,
  closeRollOverlay,
  getMyPlayerId,
} from "./lib/obr.js";
import { initialRollFromUrl } from "./lib/rollPayload.js";
import "./styles/global.css";

function RollOverlayRoot() {
  // 1. Lê a rolagem disparada via URL (instância recém-aberta pelo broadcast)
  const [roll, setRoll] = useState(() => initialRollFromUrl());
  const [role, setRole] = useState("PLAYER");
  const [myId, setMyId] = useState(null);

  useEffect(() => {
    whenOBRReady().then(async () => {
      try {
        const OBR = (await import("@owlbear-rodeo/sdk")).default;
        setRole(await OBR.player.getRole().catch(() => "PLAYER"));
      } catch {}
      getMyPlayerId().then(setMyId);
    });
  }, []);

  // 2. Também escuta novas rolagens vindas pelo broadcast, caso esta janela
  //    fique aberta por tempo suficiente para receber outra.
  useEffect(() => {
    const unsub = onRemoteRoll((r) => setRoll(r));
    return unsub;
  }, []);

  const handleDismiss = () => {
    setRoll(null);
    // Fecha a própria janela popover via OBR
    closeRollOverlay();
  };

  return (
    <LiveRollOverlay
      roll={roll}
      viewer={{ role, id: myId }}
      durationMs={5500}
      onDismiss={handleDismiss}
    />
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <RollOverlayRoot />
  </React.StrictMode>,
);
