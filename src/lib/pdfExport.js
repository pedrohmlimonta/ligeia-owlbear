// ===========================================================================
// Export PDF da ficha
//
// Estratégia: gera HTML estilizado em janela nova e dispara o diálogo de
// impressão. O usuário escolhe "Salvar como PDF" no destino. Resultado:
// PDF nativo do navegador, com fontes do sistema, sem dependências extras.
// ===========================================================================

import { ARCANE_WORDS } from "../data/magicWords.js";
import { deriveSecondary, deriveResources } from "./character.js";
import { collectActiveEffects, isItemActive, isEffectEnabled } from "./effects.js";

const ESC = (s) => {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
};

function attr(c, key) {
  return c.attributes?.[key] || { value: 0, dice: 0 };
}

function safeName(s) {
  return (s || "ficha")
    .toLowerCase()
    .replace(/[^a-z0-9\u00C0-\u017F]+/gi, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

// Lista de atributos para a grade principal
const ATTR_LABELS = {
  forca: "Força",
  agilidade: "Agilidade",
  vigor: "Vigor",
  mente: "Mente",
  percepcao: "Percepção",
};

const EFFECT_TYPE_LABELS = {
  dice: "Dado de Melhoria",
  bonus: "Bônus",
  stat: "Valor",
  damage: "Dano",
  rd: "Redução de Dano",
  info: "Condição",
};

const EFFECT_TARGET_LABELS = {
  all: "Qualquer rolagem",
  forca: "Força",
  agilidade: "Agilidade",
  vigor: "Vigor",
  mente: "Mente",
  percepcao: "Percepção",
  attack: "Ataques",
  defense: "Defesa",
  initiative: "Iniciativa",
  max_hp: "PV máx",
  max_mp: "PM máx",
  max_heroic: "PH máx",
  deslocamento: "Deslocamento",
};

function formatEffect(e) {
  if (!e) return "";
  const t = EFFECT_TYPE_LABELS[e.type] || e.type;
  const tg = EFFECT_TARGET_LABELS[e.target] || e.target || "";
  const sign = (Number(e.value) || 0) >= 0 ? "+" : "";
  let main;
  if (e.type === "info") {
    main = e.label || "—";
  } else if (e.type === "dice") {
    main = `${sign}${e.value}D em ${tg}`;
  } else if (e.type === "bonus") {
    main = `${sign}${e.value} em ${tg}`;
  } else if (e.type === "stat") {
    main = `${sign}${e.value} em ${tg}`;
  } else if (e.type === "damage") {
    main = `${sign}${e.value} de dano`;
  } else if (e.type === "rd") {
    main = `${sign}${e.value} RD`;
  } else {
    main = `${t}: ${e.value || ""}`;
  }
  const enabled = isEffectEnabled(e) ? "" : ' <span class="off">(desligado)</span>';
  const note = e.label && e.type !== "info" ? ` — ${ESC(e.label)}` : "";
  return main + note + enabled;
}

function renderEffects(effects) {
  if (!effects || effects.length === 0) return "";
  return `<ul class="effects">${effects
    .map((e) => `<li>${formatEffect({ ...e, label: e.label || "" })}</li>`)
    .join("")}</ul>`;
}

const COST_RESOURCE_LABELS = {
  mp: "PM",
  hp: "PV",
  hpTemp: "PV temp",
  heroic: "Pt. Heroico",
};

function renderCosts(costs) {
  if (!costs || costs.length === 0) return "";
  return `<div class="costs-box"><strong>Custo:</strong> ${costs
    .map((c) => {
      const lbl = COST_RESOURCE_LABELS[c.resource] || c.resource;
      const note = c.label ? ` <small>(${ESC(c.label)})</small>` : "";
      return `<span class="cost-chip">${c.value} ${lbl}${note}</span>`;
    })
    .join(" ")}</div>`;
}

function renderSlots(item, kind) {
  const slots = [];
  if (kind === "spell" && item.casting) slots.push(["Conjurar", item.casting]);
  if (kind === "skill" && item.activation) slots.push(["Ativação", item.activation]);
  if (item.target) slots.push(["Alvo", item.target]);
  if (item.area) slots.push(["Área", item.area]);
  if (item.range) slots.push(["Alcance", item.range]);
  if (item.duration) slots.push(["Duração", item.duration]);
  if (slots.length === 0) return "";
  return `<div class="slots-box">${slots
    .map(
      ([l, v]) =>
        `<span class="slot-chip"><em>${ESC(l)}:</em> ${ESC(v)}</span>`,
    )
    .join(" ")}</div>`;
}

function renderDescriptionBlock(text, label) {
  if (!text || !text.trim()) return "";
  return `<div class="desc-box"><div class="desc-label">${ESC(label)}</div><div class="desc-text">${ESC(text).replace(/\n/g, "<br>")}</div></div>`;
}

function renderAttribute(c, key) {
  const a = attr(c, key);
  return `
    <div class="attr-card">
      <div class="attr-label">${ATTR_LABELS[key]}</div>
      <div class="attr-value">${a.value}</div>
      <div class="attr-dice">${a.dice ? `+${a.dice}D` : "—"}</div>
    </div>
  `;
}

function renderSecondaries(c) {
  const s = deriveSecondary(c, collectActiveEffects(c));
  const items = [
    ["Bloqueio", s.bloqueio.value],
    ["Carga", `${s.carga.value} ${s.carga.unit || ""}`],
    ["Esquiva", s.esquiva.value],
    ["Deslocamento", `${s.deslocamento.value} ${s.deslocamento.unit || ""}`],
    ["Sono / Fome / Sede", s.sonoFomeSed.value],
    ["Conjuração", s.conjuracao.value],
    ["Iniciativa", s.iniciativa.value],
    ["Percepção Passiva", s.percepcaoPassiva.value],
  ];
  return `
    <div class="secondaries">
      ${items
        .map(
          ([label, value]) => `
        <div class="sec-pill">
          <div class="sec-label">${ESC(label)}</div>
          <div class="sec-value">${ESC(value)}</div>
        </div>`,
        )
        .join("")}
    </div>
  `;
}

function renderResources(c) {
  const r = deriveResources(c, collectActiveEffects(c));
  const tempBadge =
    c.hp?.temp && c.hp.temp > 0
      ? ` <small style="opacity:.85">(+${c.hp.temp} temp)</small>`
      : "";
  return `
    <div class="resources">
      <div class="resource hp">
        <div class="r-label">Pontos de Vida</div>
        <div class="r-value">${c.hp?.current || 0} / ${r.hpMax}${tempBadge}</div>
      </div>
      <div class="resource mp">
        <div class="r-label">Pontos de Magia</div>
        <div class="r-value">${c.mp?.current || 0} / ${r.mpMax}</div>
      </div>
      <div class="resource heroic">
        <div class="r-label">Pontos Heroicos</div>
        <div class="r-value">${c.heroicPoints || 0} / ${r.heroicMax}</div>
      </div>
      <div class="resource corr">
        <div class="r-label">Corrupção</div>
        <div class="r-value">${c.corruption ?? 0}</div>
      </div>
    </div>
  `;
}

function renderAttacks(c) {
  const list = c.attacks || [];
  if (list.length === 0) return `<p class="empty">Sem ataques cadastrados.</p>`;
  return `
    <table class="data-table">
      <thead>
        <tr>
          <th>Arma</th>
          <th>Atributo</th>
          <th>Bônus</th>
          <th>Dados</th>
          <th>Propriedades</th>
        </tr>
      </thead>
      <tbody>
        ${list
          .map(
            (a) => `
          <tr>
            <td><strong>${ESC(a.weapon)}</strong></td>
            <td>${ESC(ATTR_LABELS[a.attribute] || a.attribute)}</td>
            <td>${a.bonus ? `+${a.bonus}` : "—"}</td>
            <td>${a.dice ? `+${a.dice}D` : "—"}</td>
            <td>
              ${ESC(a.properties)}
              ${renderDescriptionBlock(a.description, "Descrição")}
            </td>
          </tr>
        `,
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function renderSkills(c) {
  const list = c.skills || [];
  if (list.length === 0) return `<p class="empty">Sem habilidades.</p>`;
  return `
    <ul class="skill-list">
      ${list
        .map((s) => {
          const lvl =
            s.level === "E"
              ? '<span class="lvl-E">Especial</span>'
              : s.level === "A"
              ? '<span class="lvl-A">Avançado</span>'
              : '<span class="lvl-B">Básico</span>';
          const mode = s.mode === "active"
            ? `<span class="mode active">Ativável${s.active ? " (ligada)" : ""}</span>`
            : `<span class="mode passive">Passiva</span>`;
          return `
            <li>
              <div class="skill-head">
                <strong>${ESC(s.name) || "—"}</strong>
                ${lvl}
                ${mode}
              </div>
              ${renderSlots(s, "skill")}
              ${renderCosts(s.costs)}
              ${renderDescriptionBlock(s.descBasic, "Descrição — Básico")}
              ${renderDescriptionBlock(s.descAdvanced, "Descrição — Avançado")}
              ${renderDescriptionBlock(s.descSpecial, "Descrição — Especial")}
              ${renderEffects(s.effects)}
            </li>
          `;
        })
        .join("")}
    </ul>
  `;
}

function renderEquipment(c) {
  const list = c.equipment || [];
  if (list.length === 0) return `<p class="empty">Sem equipamentos.</p>`;
  const totalWeight = list.reduce(
    (acc, it) => acc + (Number(it.weight) || 0) * (Number(it.qty) || 1),
    0,
  );
  return `
    <table class="data-table">
      <thead>
        <tr>
          <th>Item</th>
          <th>Qtd</th>
          <th>Peso</th>
          <th>Notas / Efeitos</th>
        </tr>
      </thead>
      <tbody>
        ${list
          .map(
            (it) => `
          <tr>
            <td>
              <strong>${ESC(it.name)}</strong>
              ${it.mode === "active"
                ? `<br><small class="muted">Ativável${it.active ? " (em uso)" : ""}</small>`
                : ""}
            </td>
            <td>${it.qty || 1}</td>
            <td>${it.weight || 0}</td>
            <td>
              ${ESC(it.notes || "")}
              ${renderDescriptionBlock(it.description, "Descrição")}
              ${renderCosts(it.costs)}
              ${renderEffects(it.effects)}
            </td>
          </tr>
        `,
          )
          .join("")}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="2"></td>
          <td><strong>${totalWeight.toFixed(1)}</strong></td>
          <td>Carga total</td>
        </tr>
      </tfoot>
    </table>
  `;
}

function renderArcaneWords(c) {
  const known = new Set(c.magic?.knownWords || []);
  if (known.size === 0)
    return `<p class="empty">Nenhuma palavra arcana aprendida.</p>`;
  return `
    <div class="arcane-grid">
      ${ARCANE_WORDS.filter((w) => known.has(w.id))
        .map(
          (w) => `
        <div class="arcane-chip">
          <strong>${ESC(w.name)}</strong>
          ${w.damage ? `<small>(${ESC(w.damage)})</small>` : ""}
        </div>
      `,
        )
        .join("")}
    </div>
  `;
}

function renderGrimoire(c) {
  const list = c.magic?.grimoire || [];
  if (list.length === 0) return `<p class="empty">Grimório vazio.</p>`;
  // Helper para encontrar a palavra pelo id
  const wordName = (id) => {
    if (!id) return "";
    const w = ARCANE_WORDS.find((x) => x.id === id);
    return w ? w.name : id;
  };
  return `
    <ul class="grimoire-list">
      ${list
        .map(
          (g, i) => `
        <li>
          <div class="g-head">
            <strong>${ESC(g.base) || `Magia ${i + 1}`}</strong>
            ${
              g.wordId
                ? `<span class="word-pill">${ESC(wordName(g.wordId))}</span>`
                : ""
            }
            ${
              g.mode === "active"
                ? `<span class="mode active">Ativável${g.active ? " (em uso)" : ""}</span>`
                : `<span class="mode passive">Passiva</span>`
            }
          </div>
          ${
            g.metamagics && g.metamagics.length
              ? `<div class="metamagics">Metamagias: ${g.metamagics
                  .map((m) => {
                    if (typeof m === "string") {
                      if (!m.trim()) return "";
                      return `<span class="meta-tag">${ESC(m)}</span>`;
                    }
                    const name = m.name || "";
                    const word = m.wordId ? wordName(m.wordId) : "";
                    if (!name.trim() && !word && !(m.description || "").trim()) return "";
                    const wordPart = word
                      ? ` <em class="meta-word">[${ESC(word)}]</em>`
                      : "";
                    const descPart = (m.description || "").trim()
                      ? `<div class="meta-desc">${ESC(m.description).replace(/\n/g, "<br>")}</div>`
                      : "";
                    return `<div class="meta-block"><span class="meta-tag">${ESC(name) || "—"}${wordPart}</span>${descPart}</div>`;
                  })
                  .filter(Boolean)
                  .join(" ")}</div>`
              : ""
          }
          ${renderSlots(g, "spell")}
          ${renderCosts(g.costs)}
          ${renderDescriptionBlock(g.description, "Descrição")}
          ${renderDescriptionBlock(g.peculiarities, "Peculiaridades")}
          ${renderEffects(g.effects)}
        </li>
      `,
        )
        .join("")}
    </ul>
  `;
}

function renderMinorSpells(c) {
  const t = c.magic?.minorSpells;
  if (!t || !t.trim()) return "";
  return `
    <div class="prose-block">
      <h3>Magias Menores e Truques</h3>
      <p>${ESC(t).replace(/\n/g, "<br>")}</p>
    </div>
  `;
}

function renderLore(c) {
  const blocks = [
    ["Personalidade", c.personality],
    ["Conceito", c.concept],
  ].filter(([_, v]) => v && v.trim());
  if (blocks.length === 0) return "";
  return blocks
    .map(
      ([label, text]) => `
    <div class="prose-block">
      <h3>${ESC(label)}</h3>
      <p>${ESC(text).replace(/\n/g, "<br>")}</p>
    </div>
  `,
    )
    .join("");
}

/**
 * Gera o HTML completo da ficha estilizada para impressão.
 */
export function characterToPrintableHtml(character) {
  const c = character;
  const careers = c.careers || "";
  const nation = c.nation || "";
  const template = c.template || "";
  const heritage = c.heritage || "";

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>Ficha — ${ESC(c.name || "Ligeia")}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=EB+Garamond:ital,wght@0,400;0,500;0,600;1,400&display=swap" rel="stylesheet">
<style>
  :root {
    --gold: #b8870a;
    --gold-soft: #8a6611;
    --bg: #fbf7ee;
    --ink: #2b2218;
    --ink-soft: #5a4a36;
    --rubi: #8b2a2a;
    --line: #c9b58a;
    --line-soft: #e2d6b6;
    --green: #2f6b3a;
    --blue: #2d5b8f;
  }
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    background: #fff;
    color: var(--ink);
    font-family: "EB Garamond", Georgia, serif;
    font-size: 11pt;
    line-height: 1.35;
  }
  body { padding: 14mm 12mm 14mm 12mm; }
  h1, h2, h3, h4 {
    font-family: "Cinzel", "Trajan Pro", serif;
    color: var(--gold-soft);
    margin: 0 0 0.4em;
    letter-spacing: 0.04em;
  }
  h1 { font-size: 22pt; color: var(--gold); }
  h2 {
    font-size: 13pt;
    border-bottom: 2px solid var(--line);
    padding-bottom: 0.15em;
    margin-top: 1.1em;
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }
  h3 { font-size: 11pt; color: var(--ink-soft); text-transform: uppercase; letter-spacing: 0.08em; }
  small, .muted { color: var(--ink-soft); }
  .empty { color: var(--ink-soft); font-style: italic; }
  .off { color: var(--rubi); font-size: 0.85em; }

  header.cover {
    border-bottom: 3px double var(--gold);
    padding-bottom: 0.6em;
    margin-bottom: 0.8em;
  }
  .brand {
    font-family: "Cinzel", serif;
    letter-spacing: 0.35em;
    color: var(--gold);
    font-size: 9pt;
    text-align: center;
    margin-bottom: 0.2em;
  }
  .char-name {
    font-family: "Cinzel", serif;
    font-weight: 700;
    font-size: 26pt;
    color: var(--gold);
    text-align: center;
    line-height: 1;
  }
  .char-meta {
    text-align: center;
    color: var(--ink-soft);
    font-style: italic;
    margin-top: 0.3em;
  }
  .identity-line {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.4em;
    margin-top: 0.6em;
    font-size: 9.5pt;
  }
  .identity-line div { background: var(--line-soft); padding: 0.25em 0.5em; border-radius: 2px; }
  .identity-line strong { color: var(--gold-soft); font-family: "Cinzel", serif; font-size: 8pt; letter-spacing: 0.08em; text-transform: uppercase; display: block; }

  .attr-grid {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 0.4em;
    margin-top: 0.4em;
  }
  .attr-card {
    border: 1.5px solid var(--gold);
    border-radius: 4px;
    background: linear-gradient(180deg, #fdf7e8, #f5ebd0);
    text-align: center;
    padding: 0.45em 0.2em;
  }
  .attr-label {
    font-family: "Cinzel", serif;
    font-size: 8.5pt;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--gold-soft);
  }
  .attr-value {
    font-size: 22pt;
    font-weight: 700;
    color: var(--gold);
    line-height: 1;
    font-family: "Cinzel", serif;
  }
  .attr-dice { font-size: 9pt; color: var(--rubi); font-style: italic; }

  .secondaries {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.3em;
    margin-top: 0.4em;
  }
  .sec-pill {
    border: 1px solid var(--line);
    border-radius: 2px;
    padding: 0.25em 0.4em;
    background: #fff;
  }
  .sec-label {
    font-family: "Cinzel", serif;
    font-size: 7.5pt;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--ink-soft);
  }
  .sec-value { font-size: 12pt; font-weight: 600; color: var(--ink); }

  .resources {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.4em;
    margin-top: 0.6em;
  }
  .resource {
    border-radius: 4px;
    padding: 0.4em 0.5em;
    color: #fff;
    text-align: center;
  }
  .resource .r-label {
    font-family: "Cinzel", serif;
    font-size: 8.5pt;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    opacity: 0.9;
  }
  .resource .r-value {
    font-size: 16pt;
    font-weight: 700;
    margin-top: 0.1em;
    font-family: "Cinzel", serif;
  }
  .resource.hp { background: linear-gradient(135deg, #8b2a2a, #5a1010); }
  .resource.mp { background: linear-gradient(135deg, #4d7bb6, #2d5b8f); }
  .resource.heroic { background: linear-gradient(135deg, #4a8754, #2f6b3a); }
  .resource.corr { background: linear-gradient(135deg, #5a4a36, #3a2e1f); }

  .data-table {
    width: 100%;
    border-collapse: collapse;
    margin: 0.5em 0;
    font-size: 10pt;
  }
  .data-table th {
    background: var(--gold);
    color: #fff;
    font-family: "Cinzel", serif;
    font-size: 8.5pt;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    padding: 0.3em 0.5em;
    text-align: left;
  }
  .data-table td {
    border-bottom: 1px solid var(--line-soft);
    padding: 0.35em 0.5em;
    vertical-align: top;
  }
  .data-table tfoot td {
    background: var(--line-soft);
    font-size: 9pt;
    font-style: italic;
  }
  .data-table tbody tr:nth-child(even) { background: #faf4e3; }

  .skill-list, .grimoire-list { list-style: none; padding: 0; margin: 0.4em 0; }
  .skill-list li, .grimoire-list li {
    padding: 0.4em 0.5em;
    border-bottom: 1px dashed var(--line-soft);
  }
  .skill-list li:last-child, .grimoire-list li:last-child { border-bottom: none; }
  .skill-head, .g-head { display: flex; gap: 0.5em; align-items: baseline; }
  .skill-head strong, .g-head strong { color: var(--gold-soft); font-family: "Cinzel", serif; font-size: 10.5pt; }
  .lvl-B, .lvl-A, .lvl-E {
    font-size: 7.5pt;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    padding: 0.1em 0.4em;
    border-radius: 8px;
    font-family: "Cinzel", serif;
  }
  .lvl-B { background: #e8d39a; color: #5a4316; }
  .lvl-A { background: #b8870a; color: #fff; }
  .lvl-E { background: #6b2c91; color: #fff; }
  .mode {
    font-size: 7.5pt;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    padding: 0.1em 0.4em;
    border-radius: 8px;
    border: 1px solid var(--line);
    color: var(--ink-soft);
  }
  .mode.active { background: #fbeed0; color: var(--gold-soft); border-color: var(--gold); }
  .mode.passive { background: #f0eadb; }

  .effects {
    list-style: "→ ";
    margin: 0.2em 0 0 1em;
    padding: 0;
    font-size: 9.5pt;
    color: var(--ink-soft);
  }
  .effects li { padding: 0.05em 0; }

  .arcane-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.3em;
    margin-top: 0.4em;
  }
  .arcane-chip {
    background: #faf4e3;
    border: 1px solid var(--gold);
    border-radius: 12px;
    padding: 0.3em 0.5em;
    text-align: center;
    font-size: 9.5pt;
  }
  .arcane-chip strong { color: var(--gold-soft); font-family: "Cinzel", serif; }

  .metamagics { margin-top: 0.2em; font-size: 9.5pt; }
  .meta-tag {
    display: inline-block;
    background: #efe6d0;
    padding: 0.05em 0.4em;
    border-radius: 6px;
    margin-right: 0.2em;
    font-size: 9pt;
  }
  .meta-word {
    color: var(--gold-soft);
    font-style: italic;
    font-size: 8.5pt;
  }
  .meta-block {
    display: inline-block;
    margin: 0.15em 0;
    vertical-align: top;
  }
  .meta-desc {
    margin: 0.15em 0 0.3em 0.4em;
    padding-left: 0.5em;
    border-left: 1.5px solid var(--line);
    font-size: 9pt;
    color: var(--ink-soft);
  }
  .word-pill {
    display: inline-block;
    margin-left: 0.4em;
    background: linear-gradient(135deg, #faf4e3, #f0e3c3);
    border: 1px solid var(--gold);
    color: var(--gold-soft);
    padding: 0.05em 0.5em;
    border-radius: 9px;
    font-family: "Cinzel", serif;
    font-size: 8.5pt;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .prose-block {
    margin-top: 0.5em;
    padding: 0.4em 0.6em;
    border-left: 3px solid var(--gold);
    background: #faf4e3;
  }
  .prose-block p { margin: 0.2em 0 0; }

  .two-col {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.8em;
  }

  /* Quebra de página */
  .page-break { page-break-before: always; }

  @page { size: A4; margin: 12mm; }
  @media print {
    body { padding: 0; }
    h2 { break-after: avoid; }
    .skill-list li, .grimoire-list li, tr { page-break-inside: avoid; }
    .attr-grid, .resources, .secondaries { page-break-inside: avoid; }
  }

  .print-bar {
    position: fixed;
    bottom: 14px;
    right: 14px;
    background: var(--gold);
    color: #fff;
    padding: 0.6em 1em;
    border-radius: 4px;
    font-family: "Cinzel", serif;
    cursor: pointer;
    box-shadow: 0 2px 6px rgba(0,0,0,0.2);
    border: none;
    font-size: 11pt;
    z-index: 1000;
  }
  @media print { .print-bar { display: none; } }

  /* Retrato no cabeçalho */
  .cover-row { display: flex; gap: 0.8em; align-items: center; justify-content: center; }
  .cover-portrait {
    width: 110px;
    height: 110px;
    object-fit: cover;
    border: 2px solid var(--gold);
    border-radius: 4px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.25);
  }
  .cover-text { flex: 0 1 auto; text-align: center; }

  /* Slots (alvo/área/alcance/duração/conjurar) */
  .slots-box {
    margin: 0.3em 0;
    font-size: 9.5pt;
  }
  .slot-chip {
    display: inline-block;
    background: #faf4e3;
    border: 1px solid var(--line);
    padding: 0.1em 0.4em;
    margin: 0 0.15em 0.15em 0;
    border-radius: 3px;
  }
  .slot-chip em { font-style: normal; color: var(--gold-soft); font-family: "Cinzel", serif; font-size: 8pt; text-transform: uppercase; letter-spacing: 0.04em; }

  /* Custos */
  .costs-box {
    margin: 0.3em 0;
    font-size: 9.5pt;
  }
  .costs-box strong { color: var(--rubi); margin-right: 0.4em; }
  .cost-chip {
    display: inline-block;
    background: #fbe6e6;
    border: 1px solid #c98080;
    padding: 0.1em 0.4em;
    margin: 0 0.15em 0.15em 0;
    border-radius: 9px;
    font-weight: 600;
    color: #6b2020;
  }

  /* Descrições com label */
  .desc-box { margin: 0.3em 0 0.4em; padding-left: 0.5em; border-left: 2px solid var(--line); }
  .desc-label {
    font-family: "Cinzel", serif;
    font-size: 8pt;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--gold-soft);
  }
  .desc-text { margin-top: 0.1em; }
</style>
</head>
<body>

<header class="cover">
  <div class="brand">L · I · G · E · I · A &nbsp; · &nbsp; R P G</div>
  <div class="cover-row">
    ${
      c.image
        ? `<img src="${ESC(c.image)}" alt="Retrato" class="cover-portrait" />`
        : ""
    }
    <div class="cover-text">
      <div class="char-name">${ESC(c.name || "—")}</div>
      ${
        c.concept
          ? `<div class="char-meta">${ESC(c.concept)}</div>`
          : ""
      }
    </div>
  </div>
  <div class="identity-line">
    <div><strong>Raça</strong>${ESC(c.race) || "—"}</div>
    <div><strong>Vocação</strong>${ESC(c.vocation) || "—"}</div>
    <div><strong>Nível</strong>${ESC(c.level) || "1"}</div>
    <div><strong>XP</strong>${ESC(c.xp) || "0"}</div>
    ${heritage ? `<div><strong>Herança</strong>${ESC(heritage)}</div>` : ""}
    ${template ? `<div><strong>Modelo</strong>${ESC(template)}</div>` : ""}
    ${nation ? `<div><strong>Nação</strong>${ESC(nation)}</div>` : ""}
    ${careers ? `<div><strong>Carreiras</strong>${ESC(careers)}</div>` : ""}
  </div>
</header>

<h2>Atributos</h2>
<div class="attr-grid">
  ${["forca", "agilidade", "vigor", "mente", "percepcao"]
    .map((k) => renderAttribute(c, k))
    .join("")}
</div>

<h2>Recursos</h2>
${renderResources(c)}

<h2>Atributos Secundários</h2>
${renderSecondaries(c)}

<h2>Ataques</h2>
${renderAttacks(c)}

<h2>Habilidades</h2>
${renderSkills(c)}

<h2>Equipamentos</h2>
${renderEquipment(c)}

<h2>Palavras Arcanas Conhecidas</h2>
${renderArcaneWords(c)}

<h2>Grimório</h2>
${renderGrimoire(c)}

${renderMinorSpells(c)}

${renderLore(c)}

<button class="print-bar" onclick="window.print()">🖨 Imprimir / Salvar PDF</button>

<script>
  // Auto-abre o diálogo de impressão após carregar fontes
  window.addEventListener("load", () => {
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => setTimeout(() => window.print(), 300));
    } else {
      setTimeout(() => window.print(), 500);
    }
  });
</script>

</body>
</html>`;
}

/**
 * Abre uma nova janela com a ficha pronta para imprimir/salvar como PDF.
 */
export function openPrintableSheet(character) {
  const html = characterToPrintableHtml(character);
  const w = window.open("", "_blank", "width=900,height=1000");
  if (!w) {
    alert(
      "Não foi possível abrir a janela de impressão. " +
        "Verifique se o navegador está bloqueando popups.",
    );
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}

export { safeName };
