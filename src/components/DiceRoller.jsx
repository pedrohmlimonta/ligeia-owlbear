import { useState, useEffect } from "react";
import { rollLigeia, formatRoll, formatRollForViewer } from "../lib/dice.js";
import {
  broadcastRoll,
  onRemoteRoll,
  onRoleChange,
  getMyPlayerId,
} from "../lib/obr.js";
import { DiceTray } from "./Die3D.jsx";

const ATTRIBUTE_PRESETS = [
  { key: "forca", label: "Força" },
  { key: "agilidade", label: "Agilidade" },
  { key: "vigor", label: "Vigor" },
  { key: "mente", label: "Mente" },
  { key: "percepcao", label: "Percepção" },
  { key: "conjuracao", label: "Conjuração" },
  { key: "esquiva", label: "Esquiva" },
  { key: "bloqueio", label: "Bloqueio" },
  { key: "iniciativa", label: "Iniciativa" },
];

const DIFFICULTY_PRESETS = [
  { value: 6, label: "Muito fácil" },
  { value: 8, label: "Fácil" },
  { value: 10, label: "Normal" },
  { value: 12, label: "Difícil" },
  { value: 14, label: "Muito difícil" },
  { value: 17, label: "Épica" },
  { value: 20, label: "Extrema" },
];

export function DiceRoller() {
  const [label, setLabel] = useState("Rolagem");
  const [attribute, setAttribute] = useState(3);
  const [improvement, setImprovement] = useState(0);
  const [bonus, setBonus] = useState(0);
  const [difficulty, setDifficulty] = useState(10);
  const [useDifficulty, setUseDifficulty] = useState(false);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [role, setRole] = useState("GM");
  const [myId, setMyId] = useState(null);

  useEffect(() => onRoleChange(setRole), []);
  useEffect(() => {
    getMyPlayerId().then(setMyId);
  }, []);

  useEffect(() => {
    const unsub = onRemoteRoll((roll) => {
      setHistory((prev) =>
        [{ ...roll, remote: true }, ...prev].slice(0, 20),
      );
    });
    return unsub;
  }, []);

  const [hidden, setHidden] = useState(false);

  const handleRoll = (overrides = {}) => {
    const r = rollLigeia({
      label,
      attribute: Number(attribute) || 0,
      improvement: Number(improvement) || 0,
      bonus: Number(bonus) || 0,
      difficulty: useDifficulty ? Number(difficulty) : null,
      ...overrides,
    });
    setResult(r);
    setHistory((prev) =>
      [{ ...r, hidden: hidden && role === "GM" }, ...prev].slice(0, 20),
    );
    broadcastRoll(r, "Mesa", { hidden: hidden && role === "GM" });
  };

  const handleQuickRoll = (preset) => {
    setLabel(preset.label);
    // Use o callback de overrides para garantir que pegue os valores atuais
    handleRoll({ label: preset.label });
  };

  // Cor de feedback do resultado
  const resultColor = result
    ? result.isCritSuccess
      ? "var(--crit-success)"
      : result.isCritFail
      ? "var(--crit-fail)"
      : result.outcome === "success"
      ? "var(--success)"
      : result.outcome === "fail"
      ? "var(--rubi-bright)"
      : "var(--gold)"
    : "var(--gold)";

  return (
    <div style={{ padding: "1rem", minHeight: "100vh" }}>
      <header className="brand-header" style={{ paddingTop: 0 }}>
        <div className="brand-mark" style={{ fontSize: "1.2rem" }}>
          ROLADOR
        </div>
        <div className="brand-divider" />
      </header>

      {/* Bandeja de dados 3D */}
      <div style={{ margin: "1rem 0" }}>
        <DiceTray result={result} size={56} />
      </div>

      {/* Resultado */}
      {result && (
        <div
          style={{
            textAlign: "center",
            padding: "0.75rem",
            margin: "0.5rem 0 1rem",
            background: "var(--bg-deep)",
            border: `1px solid ${resultColor}`,
            borderRadius: "4px",
          }}
        >
          <div className="tiny muted">{result.label}</div>
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "2.4rem",
              fontWeight: 700,
              color: resultColor,
              lineHeight: 1,
              margin: "0.25rem 0",
            }}
          >
            {result.total}
          </div>
          <div className="tiny muted">
            [{result.kept.join(" + ")}] dados
            {result.attribute ? ` + ${result.attribute} atr.` : ""}
            {result.bonus ? ` ${result.bonus >= 0 ? "+" : ""}${result.bonus} bônus` : ""}
          </div>
          {result.isCritSuccess && (
            <div style={{ color: "var(--crit-success)", fontFamily: "var(--font-display)", fontWeight: 700, marginTop: "0.4rem" }}>
              ✦ SUCESSO CRÍTICO ✦
            </div>
          )}
          {result.isCritFail && (
            <div style={{ color: "var(--crit-fail)", fontFamily: "var(--font-display)", fontWeight: 700, marginTop: "0.4rem" }}>
              ✗ FALHA CRÍTICA ✗
            </div>
          )}
          {!result.isCritSuccess && !result.isCritFail && result.difficulty != null && (
            <div
              style={{
                color: result.outcome === "success" ? "var(--success)" : "var(--rubi-bright)",
                fontFamily: "var(--font-display)",
                fontWeight: 700,
                marginTop: "0.4rem",
                fontSize: "0.85rem",
              }}
            >
              {result.outcome === "success" ? "✓ SUCESSO" : "✗ FALHA"} (vs {result.difficulty})
            </div>
          )}
        </div>
      )}

      {/* Configuração da rolagem */}
      <div className="panel">
        <div className="panel-title">Configuração</div>

        <label>Rótulo</label>
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Ex.: Ataque com espada longa"
        />

        <div className="row gap-2 mt-1">
          <div className="flex-1">
            <label>Atributo</label>
            <input
              type="number"
              value={attribute}
              onChange={(e) => setAttribute(e.target.value)}
              min="0"
              max="10"
            />
          </div>
          <div className="flex-1">
            <label>Dados de melhoria</label>
            <input
              type="number"
              value={improvement}
              onChange={(e) => setImprovement(e.target.value)}
              min="0"
              max="10"
            />
          </div>
          <div className="flex-1">
            <label>Bônus</label>
            <input
              type="number"
              value={bonus}
              onChange={(e) => setBonus(e.target.value)}
            />
          </div>
        </div>

        <div style={{ marginTop: "0.75rem" }}>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={useDifficulty}
              onChange={(e) => setUseDifficulty(e.target.checked)}
              style={{ width: "auto" }}
            />
            <span>Comparar contra dificuldade</span>
          </label>
          {useDifficulty && (
            <select
              value={difficulty}
              onChange={(e) => setDifficulty(Number(e.target.value))}
              style={{ marginTop: "0.4rem" }}
            >
              {DIFFICULTY_PRESETS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label} — Dificuldade {p.value}
                </option>
              ))}
            </select>
          )}

          {role === "GM" && (
            <label className="hidden-roll-toggle">
              <input
                type="checkbox"
                checked={hidden}
                onChange={(e) => setHidden(e.target.checked)}
                style={{ width: "auto" }}
              />
              <span>
                🕶 Rolagem oculta
                <div className="tiny muted">
                  Resultado fica só para você — nada é compartilhado com a mesa.
                </div>
              </span>
            </label>
          )}
        </div>

        <button
          className={"primary " + (hidden && role === "GM" ? "hidden-roll-btn" : "")}
          onClick={() => handleRoll()}
          style={{ width: "100%", marginTop: "1rem", fontSize: "0.95rem", padding: "0.75rem" }}
        >
          {hidden && role === "GM" ? "🕶 Rolar oculto" : "🎲 Rolar"}
        </button>
      </div>

      {/* Atalhos */}
      <div className="panel mt-2">
        <div className="panel-title">Atalhos comuns</div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: "0.4rem",
          }}
        >
          {ATTRIBUTE_PRESETS.map((p) => (
            <button
              key={p.key}
              onClick={() => handleQuickRoll(p)}
              style={{ padding: "0.4rem", fontSize: "0.7rem" }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Histórico */}
      {history.length > 0 && (
        <div className="panel mt-2">
          <div className="panel-title">Histórico</div>
          <ul
            style={{
              listStyle: "none",
              display: "flex",
              flexDirection: "column",
              gap: "0.35rem",
              maxHeight: "200px",
              overflowY: "auto",
            }}
          >
            {history.map((r, i) => (
              <li
                key={i}
                className="tiny"
                style={{
                  fontFamily: "var(--font-mono)",
                  color: r.isCritSuccess
                    ? "var(--crit-success)"
                    : r.isCritFail
                    ? "var(--crit-fail)"
                    : "var(--text-soft)",
                  padding: "0.25rem 0.4rem",
                  background: r.remote ? "rgba(139, 42, 42, 0.1)" : "transparent",
                  borderLeft: r.remote
                    ? "2px solid var(--rubi)"
                    : "2px solid var(--gold-dark)",
                }}
              >
                {r.remote && <strong style={{ color: "var(--gold)" }}>{r.characterName} </strong>}
                {r.hidden && <span title="Rolagem oculta">🕶 </span>}
                {formatRollForViewer(r, { role, id: myId })}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
