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
  onRoleChange,
  unlinkItem,
  removeTokenBars,
} from "../lib/obr.js";
import { createBlankCharacter } from "../lib/character.js";
import { formatRoll } from "../lib/dice.js";

export function Popover() {
  const [characters, setCharacters] = useState({});
  const [recentRolls, setRecentRolls] = useState([]);
  const [role, setRole] = useState("GM");

  useEffect(() => {
    loadCharacters().then(setCharacters);
    const unsub = onCharactersChanged(setCharacters);
    return unsub;
  }, []);

  useEffect(() => {
    return onRoleChange(setRole);
  }, []);

  useEffect(() => {
    const unsub = onRemoteRoll((roll) => {
      setRecentRolls((prev) => [roll, ...prev].slice(0, 5));
    });
    return unsub;
  }, []);

  const isGM = role === "GM";

  const handleCreate = async (npc = false) => {
    const name = prompt(npc ? "Nome do NPC:" : "Nome do personagem:");
    if (!name) return;
    const c = createBlankCharacter(name);
    c.npc = npc;
    await saveCharacterToRoom(c);
    openCharacterSheet(c.id);
  };

  const handleDelete = async (id, name) => {
    if (!confirm(`Excluir "${name}"? Isso não pode ser desfeito.`)) return;
    const ch = characters[id];
    if (ch?.tokenId) {
      await removeTokenBars(id);
      await unlinkItem(ch.tokenId);
    }
    await deleteCharacter(id);
  };

  // Filtra fichas: jogadores não veem NPCs
  const all = Object.values(characters).sort((a, b) =>
    (a.name || "").localeCompare(b.name || ""),
  );
  const playerChars = all.filter((c) => !c.npc);
  const npcChars = all.filter((c) => c.npc);

  return (
    <div style={{ padding: "0.75rem", minHeight: "100vh" }}>
      <header className="brand-header">
        <div className="brand-mark">LIGEIA</div>
        <div className="brand-sub">RPG</div>
        <div className="brand-divider" />
      </header>

      <div className="role-bar">
        <span className={"role-pill " + (isGM ? "role-gm" : "role-player")}>
          {isGM ? "🎲 Narrador" : "🛡 Jogador"}
        </span>
        {!isGM && (
          <span className="tiny muted">
            Visão somente leitura. Apenas o Narrador edita fichas.
          </span>
        )}
      </div>

      <div className="row gap-2 mt-2" style={{ marginBottom: "0.75rem" }}>
        {isGM && (
          <button className="primary flex-1" onClick={() => handleCreate(false)}>
            + Personagem
          </button>
        )}
        <button className="flex-1" onClick={openDiceRoller}>
          🎲 Dados
        </button>
      </div>

      <CharSection
        title="Personagens"
        items={playerChars}
        canEdit={isGM}
        onOpen={openCharacterSheet}
        onDelete={handleDelete}
        emptyText={
          isGM
            ? 'Nenhum personagem ainda. Clique em "+ Personagem".'
            : "Nenhum personagem na sala ainda."
        }
      />

      {isGM && (
        <div style={{ marginTop: "0.75rem" }}>
          <div className="row gap-2" style={{ marginBottom: "0.4rem" }}>
            <button
              onClick={() => handleCreate(true)}
              className="npc-create-btn flex-1"
            >
              + NPC (privado do Narrador)
            </button>
          </div>
          <CharSection
            title="NPCs (somente Narrador)"
            items={npcChars}
            canEdit={true}
            isNpc
            onOpen={openCharacterSheet}
            onDelete={handleDelete}
            emptyText='Nenhum NPC. Clique em "+ NPC" para criar.'
          />
        </div>
      )}

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

function CharSection({ title, items, canEdit, onOpen, onDelete, emptyText, isNpc }) {
  return (
    <div className={"panel " + (isNpc ? "panel-npc" : "")}>
      <div className="panel-title">{title}</div>
      {items.length === 0 ? (
        <div className="muted tiny" style={{ padding: "1rem 0", textAlign: "center" }}>
          {emptyText}
        </div>
      ) : (
        <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
          {items.map((c) => (
            <li
              key={c.id}
              className={"char-row " + (isNpc ? "char-row-npc" : "")}
            >
              <div style={{ flex: 1, overflow: "hidden" }}>
                <div className="char-row-name">
                  {isNpc && <span className="npc-badge">NPC</span>}
                  {c.name}
                  {c.tokenId && <span className="token-link-badge" title="Vinculada a um token">⛓</span>}
                </div>
                <div className="muted tiny">
                  {[c.race, c.vocation, c.level ? `Nv. ${c.level}` : null]
                    .filter(Boolean)
                    .join(" · ") || "Sem detalhes"}
                </div>
              </div>
              <button
                onClick={() => onOpen(c.id)}
                style={{ padding: "0.35rem 0.6rem" }}
              >
                {canEdit ? "Abrir" : "Ver"}
              </button>
              {canEdit && (
                <button
                  className="danger"
                  onClick={() => onDelete(c.id, c.name)}
                  style={{ padding: "0.35rem 0.5rem" }}
                  title="Excluir"
                >
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
