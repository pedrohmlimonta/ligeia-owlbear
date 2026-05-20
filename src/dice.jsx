import React from "react";
import ReactDOM from "react-dom/client";
import { DiceRoller } from "./components/DiceRoller.jsx";
import "./styles/global.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <DiceRoller />
  </React.StrictMode>,
);
