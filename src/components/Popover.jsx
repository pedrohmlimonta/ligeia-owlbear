import { useEffect, useState, useMemo, useRef } from "react";
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
  getMyPlayerId,
  onPartyChange,
  linkCharacterToItem,
  onSceneItemsChange,
} from "../lib/obr.js";
import { createBlankCharacter, migrateCharacter } from "../lib/character.js";
import { formatRoll, formatRollForViewer } from "../lib/dice.js";
import { parseImportedJson, readFileAsText } from "../lib/importExport.js";
import { LiveRollOverlay } from "./LiveRollOverlay.jsx";

export function Popover() {
  const [characters, setCharacters] = useState({});
  const [recentRolls, setRecentRolls] = useState([]);
  const [liveRoll, setLiveRoll] = useState(null);
  const [role, setRole] = useState("GM");
  const [myId, setMyId] = useState(null);
  const [party, setParty] = useState([]);
  const [sceneItems, setSceneItems] = useState([]);

  // Ref para acessar o estado mais recente dentro de callbacks/effects
  const charactersRef = useRef({});
  charactersRef.current = characters;

  useEffect(() => {
    loadCharacters().then(setCharacters);
    const unsub = onCharactersChanged(setCharacters);
    return unsub;
  }, []);

  useEffect(() => {
    return onRoleChange(setRole);
  }, []);

  useEffect(() => {
    getMyPlayerId().then(setMyId);
  }, []);

  useEffect(() => {
    return onPartyChange(setParty);
  }, []);

  useEffect(() => {
    return onSceneItemsChange(setSceneItems);
  }, []);

  useEffect(() => {
    const unsub = onRemoteRoll((roll) => {
      setRecentRolls((prev) => [roll, ...prev].slice(0, 5));
      setLiveRoll(roll);
    });
    return unsub;
  }, []);

  const isGM = role === "GM";

  // Lista de players conhecidos (party + eu)
  const allPlayers = useMemo(() => {
    const map = new Map();
    for (const p of party) {
      if (p.role === "PLAYER") map.set(p.id, p);
    }
    return Array.from(map.values()).sort((a, b) =>
      (a.name || "").localeCompare(b.name || ""),
    );
  }, [party]);

  // ============================================================
  // AUTO-LINK: quando um token "pertence" a um player que tem ficha,
  // adicionamos o token à lista de tokens dessa ficha automaticamente.
  // "Pertence" significa: o último que modificou (lastModifiedUserId)
  // foi o player, ou ele foi o criador (createdUserId).
  // ============================================================
  useEffect(() => {
    if (!isGM) return;
    if (!sceneItems || sceneItems.length === 0) return;

    const chars = Object.values(charactersRef.current);
    // mapa playerId -> ficha do jogador
    const charByPlayer = {};
    for (const c of chars) {
      if (c.playerId && !c.npc) charByPlayer[c.playerId] = c;
    }
    if (Object.keys(charByPlayer).length === 0) return;

    // Set de ids de items que já estão registrados em alguma ficha
    const alreadyLinked = new Set();
    for (const c of chars) {
      for (const tid of c.tokenIds || []) alreadyLinked.add(tid);
    }

    const updates = {}; // charId -> novos tokenIds[]
    for (const item of sceneItems) {
      // Heurística: pular shapes que são nossas próprias barras
      if (item.metadata?.["ligeia/barOf"]) continue;
      // Considera apenas items "controláveis": layer CHARACTER, MOUNT, PROP
      const layer = item.layer || "";
      if (!["CHARACTER", "MOUNT", "PROP"].includes(layer)) continue;
      // Já vinculado a alguma ficha
      if (alreadyLinked.has(item.id)) continue;

      const ownerId = item.lastModifiedUserId || item.createdUserId;
      if (!ownerId) continue;
      const ch = charByPlayer[ownerId];
      if (!ch) continue;

      // Decisão: "Manter ambos" - adicionamos sem desvincular outros tokens
      const current = updates[ch.id] || [...(ch.tokenIds || [])];
      if (!current.includes(item.id)) current.push(item.id);
      updates[ch.id] = current;
    }

    // Aplica updates
    for (const charId of Object.keys(updates)) {
      const ch = charactersRef.current[charId];
      if (!ch) continue;
      const newIds = updates[charId];
      // marca o item no token (metadata) + salva no character
      (async () => {
        for (const tid of newIds) {
          if (!(ch.tokenIds || []).includes(tid)) {
            await linkCharacterToItem(tid, ch.id);
          }
        }
        await saveCharacterToRoom({ ...ch, tokenIds: newIds });
      })();
    }
  }, [sceneItems, isGM]);

  const handleCreate = async (npc = false) => {
    const name = prompt(npc ? "Nome do NPC:" : "Nome do personagem:");
    if (!name) return;
    const c = createBlankCharacter(name);
    c.npc = npc;
    await saveCharacterToRoom(c);
    openCharacterSheet(c.id);
  };

  const handleImportNewCharacter = async (imported) => {
    // Cria uma ficha NOVA a partir do JSON (id novo, sem token, sem dono)
    const fresh = {
      ...imported,
      id: crypto.randomUUID(),
      playerId: null,
      tokenIds: [],
    };
    await saveCharacterToRoom(fresh);
    openCharacterSheet(fresh.id);
  };

  const handleDelete = async (id, name) => {
    if (!confirm(`Excluir "${name}"? Isso não pode ser desfeito.`)) return;
    const ch = characters[id];
    if (ch?.tokenIds?.length) {
      await removeTokenBars(id);
      for (const tid of ch.tokenIds) {
        await unlinkItem(tid);
      }
    }
    await deleteCharacter(id);
  };

  const handleAssignPlayer = async (charId, playerId) => {
    const ch = characters[charId];
    if (!ch) return;
    const next = { ...ch, playerId: playerId || null };
    await saveCharacterToRoom(next);
  };

  const handleToggleGmAccess = async (charId, value) => {
    const ch = characters[charId];
    if (!ch) return;
    const next = { ...ch, grantPlayerGmAccess: !!value };
    await saveCharacterToRoom(next);
  };

  const all = Object.values(characters).sort((a, b) =>
    (a.name || "").localeCompare(b.name || ""),
  );
  const myChars = !isGM
    ? all.filter((c) => !c.npc && c.playerId === myId)
    : [];
  const playerChars = all.filter((c) => !c.npc);
  const npcChars = all.filter((c) => c.npc);

  return (
    <div style={{ padding: "0.75rem", minHeight: "100vh" }}>
      <LiveRollOverlay
        roll={liveRoll}
        viewer={{ role, id: myId }}
        onDismiss={() => setLiveRoll(null)}
      />

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
            Apenas o Narrador edita fichas. Você pode rolar e ajustar PV/PM.
          </span>
        )}
      </div>

      <div className="row gap-2 mt-2" style={{ marginBottom: "0.75rem" }}>
        {isGM && (
          <>
            <button className="primary flex-1" onClick={() => handleCreate(false)}>
              + Personagem
            </button>
            <PopoverImportButton onImport={handleImportNewCharacter} />
          </>
        )}
        <button className="flex-1" onClick={openDiceRoller}>
          🎲 Dados
        </button>
      </div>

      {isGM ? (
        <>
          <CharSection
            title="Personagens"
            items={playerChars}
            isGM={true}
            allPlayers={allPlayers}
            party={party}
            onOpen={openCharacterSheet}
            onDelete={handleDelete}
            onAssignPlayer={handleAssignPlayer}
            onToggleGmAccess={handleToggleGmAccess}
            emptyText='Nenhum personagem ainda. Clique em "+ Personagem".'
          />

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
              isGM={true}
              isNpc={true}
              allPlayers={allPlayers}
              party={party}
              onOpen={openCharacterSheet}
              onDelete={handleDelete}
              emptyText='Nenhum NPC. Clique em "+ NPC".'
            />
          </div>
        </>
      ) : (
        <CharSection
          title="Meus personagens"
          items={myChars}
          isGM={false}
          party={party}
          onOpen={openCharacterSheet}
          emptyText="Nenhuma ficha foi atribuída a você ainda. Avise o Narrador."
        />
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
                <strong style={{ color: "var(--gold)" }}>{r.characterName}</strong>{" "}
                — {formatRollForViewer(r, { role, id: myId })}
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

function CharSection({
  title,
  items,
  isGM,
  isNpc,
  allPlayers,
  party,
  onOpen,
  onDelete,
  onAssignPlayer,
  onToggleGmAccess,
  emptyText,
}) {
  return (
    <div className={"panel " + (isNpc ? "panel-npc" : "")}>
      <div className="panel-title">{title}</div>
      {items.length === 0 ? (
        <div className="muted tiny" style={{ padding: "1rem 0", textAlign: "center" }}>
          {emptyText}
        </div>
      ) : (
        <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
          {items.map((c) => {
            const assignedPlayer =
              c.playerId && (party || []).find((p) => p.id === c.playerId);
            const tokenCount = (c.tokenIds || []).length;
            return (
              <li
                key={c.id}
                className={"char-row " + (isNpc ? "char-row-npc" : "")}
              >
                <div style={{ flex: 1, overflow: "hidden" }}>
                  <div className="char-row-name">
                    {isNpc && <span className="npc-badge">NPC</span>}
                    {c.name}
                    {tokenCount > 0 && (
                      <span className="token-link-badge" title={`${tokenCount} token(s) vinculado(s)`}>
                        ⛓{tokenCount > 1 ? ` ×${tokenCount}` : ""}
                      </span>
                    )}
                    {assignedPlayer && (
                      <span
                        className="player-link-badge"
                        title={`Atribuída a ${assignedPlayer.name}`}
                      >
                        👤 {assignedPlayer.name}
                      </span>
                    )}
                  </div>
                  <div className="muted tiny">
                    {[c.race, c.vocation, c.level ? `Nv. ${c.level}` : null]
                      .filter(Boolean)
                      .join(" · ") || "Sem detalhes"}
                  </div>
                  {isGM && !isNpc && (
                    <div className="assign-row">
                      <select
                        value={c.playerId || ""}
                        onChange={(e) => onAssignPlayer(c.id, e.target.value)}
                        title="Atribuir esta ficha a um jogador"
                      >
                        <option value="">— sem dono —</option>
                        {(allPlayers || []).map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => onOpen(c.id)}
                  style={{ padding: "0.35rem 0.6rem" }}
                >
                  {isGM ? "Abrir" : "Ver"}
                </button>
                {isGM && !isNpc && c.playerId && (
                  <button
                    className={
                      "key-toggle " + (c.grantPlayerGmAccess ? "is-on" : "")
                    }
                    onClick={() => onToggleGmAccess(c.id, !c.grantPlayerGmAccess)}
                    title={
                      c.grantPlayerGmAccess
                        ? "Jogador tem acesso de Narrador — clique para revogar"
                        : "Dar acesso de Narrador ao jogador desta ficha"
                    }
                  >
                    🗝
                  </button>
                )}
                {isGM && (
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
            );
          })}
        </ul>
      )}
    </div>
  );
}

function PopoverImportButton({ onImport }) {
  const handleChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const text = await readFileAsText(file);
      const imported = parseImportedJson(text, {
        regenerateId: true,
        clearOwner: true,
      });
      await onImport(imported);
    } catch (err) {
      alert("Falha ao importar:\n" + (err?.message || err));
    }
  };

  return (
    <label
      className="popover-import-btn flex-1"
      title="Criar uma nova ficha a partir de um arquivo JSON"
    >
      ⬆ Importar
      <input
        type="file"
        accept="application/json,.json"
        onChange={handleChange}
        style={{ display: "none" }}
      />
    </label>
  );
}
