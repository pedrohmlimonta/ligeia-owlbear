import { useEffect, useState } from "react";
import {
  loadCharacters,
  saveCharacterToRoom,
  deleteCharacter,
  onCharactersChanged,
  openCharacterSheet,
  openDiceRoller,
  onRemoteRoll,
  isInsideOBR,
} from "../lib/obr.js";
import { createBlankCharacter } from "../lib/character.js";
import { formatRoll } from "../lib/dice.js";

export function Popover() {
  const [characters, setCharacters] = useState({});
  const [recentRolls, setRecentRolls] = useState([]);

  useEffect(() => {
    loadCharacters().then(setCharacters);
    const unsub = onCharactersChanged(setCharacters);
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = onRemoteRoll((roll) => {
      setRecentRolls((prev) => [roll, ...prev].slice(0, 5));
    });
    return unsub;
  }, []);

  const handleCreate = async () => {
    const name = prompt("Nome do personagem:");
    if (!name) return;
    const c = createBlankCharacter(name);
    await saveCharacterToRoom(c);
    openCharacterSheet(c.id);
  };

  const handleDelete = async (id, name) => {
    if (!confirm(`Excluir o personagem "${name}"? Isso não pode ser desfeito.`)) return;
    await deleteCharacter(id);
  };

  const charList = Object.values(characters).sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  return (
    <div style={{ padding: "0.75rem", minHeight: "100vh" }}>
      <header className="brand-header">
        <div className="brand-mark">LIGEIA</div>
        <div className="brand-sub">RPG</div>
        <div className="brand-divider" />
      </header>

      <div className="row gap-2 mt-2" style={{ marginBottom: "0.75rem" }}>
        <button className="primary flex-1" onClick={handleCreate}>
          + Personagem
        </button>
        <button className="flex-1" onClick={openDiceRoller}>
          🎲 Dados
        </button>
      </div>

      <div className="panel">
        <div className="panel-title">Personagens</div>
        {charList.length === 0 ? (
          <div className="muted tiny" style={{ padding: "1rem 0", textAlign: "center" }}>
            Nenhum personagem ainda.
            <br />
            Clique em "+ Personagem" para começar.
          </div>
        ) : (
          <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            {charList.map((c) => (
              <li
                key={c.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  background: "var(--bg-deep)",
                  border: "1px solid var(--border)",
                  padding: "0.5rem 0.6rem",
                  borderRadius: "3px",
                }}
              >
                <div style={{ flex: 1, overflow: "hidden" }}>
                  <div
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: "0.9rem",
                      color: "var(--gold)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {c.name}
                  </div>
                  <div className="muted tiny">
                    {[c.race, c.vocation, `Nv. ${c.level}`].filter(Boolean).join(" · ") ||
                      "Sem detalhes"}
                  </div>
                </div>
                <button
                  onClick={() => openCharacterSheet(c.id)}
                  style={{ padding: "0.35rem 0.6rem" }}
                >
                  Abrir
                </button>
                <button
                  className="danger"
                  onClick={() => handleDelete(c.id, c.name)}
                  style={{ padding: "0.35rem 0.5rem" }}
                  title="Excluir"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {recentRolls.length > 0 && (
        <div className="panel mt-2">
          <div className="panel-title">Rolagens recentes</div>
          <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "0.3rem" }}>
            {recentRolls.map((r, i) => (
              <li
                key={i}
                className="tiny"
                style={{
                  color: r.isCritSuccess
                    ? "var(--crit-success)"
                    : r.isCritFail
                    ? "var(--crit-fail)"
                    : "var(--text-soft)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                <strong style={{ color: "var(--gold)" }}>{r.characterName}</strong> —{" "}
                {formatRoll(r)}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div
        className="tiny muted"
        style={{ textAlign: "center", marginTop: "1rem", opacity: 0.6 }}
      >
        {isInsideOBR() ? "Conectado ao Owlbear Rodeo" : "Modo standalone"}
      </div>
    </div>
  );
}
