import React from "react";
import ReactDOM from "react-dom/client";
import { CharacterSheet } from "./components/CharacterSheet.jsx";
import "./styles/global.css";
import "./styles/sheet.css";

const params = new URLSearchParams(window.location.search);
const characterId = params.get("id");

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <CharacterSheet characterId={characterId} />
  </React.StrictMode>,
);
