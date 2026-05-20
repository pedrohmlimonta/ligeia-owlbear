import React from "react";
import ReactDOM from "react-dom/client";
import { Popover } from "./components/Popover.jsx";
import { registerContextMenu, whenOBRReady } from "./lib/obr.js";
import "./styles/global.css";

// Registra o menu de contexto "Abrir Ficha" assim que o OBR estiver pronto.
whenOBRReady().then(() => {
  registerContextMenu();
});

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Popover />
  </React.StrictMode>,
);
