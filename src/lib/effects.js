// ===========================================================================
// Sistema de efeitos / modificadores
//
// Cada habilidade, equipamento e magia base pode declarar um conjunto de
// efeitos que somam (ou subtraem) algo quando o item está ATIVO:
// - Itens passivos (mode = "passive") estão sempre ativos.
// - Itens ativos (mode = "active") só contam quando active === true.
//
// Modelo de um efeito:
//   { type, target, value, label }
//
//   type:    "dice"  → soma N dados de melhoria na rolagem-alvo
//            "bonus" → soma N ao bônus (valor) da rolagem-alvo
//            "damage"→ soma N ao dano causado (informativo, exibido no painel)
//            "rd"    → redução de dano recebido (informativo, exibido)
//            "info"  → texto livre/condição (apenas exibido)
//
//   target:  "all"           → qualquer rolagem
//            "forca" | "agilidade" | "vigor" | "mente" | "percepcao"
//                             → rolagens cujo atributo é esse
//            "attack"         → todas as rolagens de ataque
//            "defense"        → defesas (bloqueio/esquiva — exibido)
//            "skill:<nome>"   → uma habilidade específica
//
//   value:   número (ignorado para type=info)
//   label:   descrição livre / condição (opcional)
// ===========================================================================

/** Lista de targets exibida no editor */
export const EFFECT_TARGETS = [
  { id: "all", label: "Qualquer rolagem" },
  { id: "forca", label: "Rolagens de Força" },
  { id: "agilidade", label: "Rolagens de Agilidade" },
  { id: "vigor", label: "Rolagens de Vigor" },
  { id: "mente", label: "Rolagens de Mente" },
  { id: "percepcao", label: "Rolagens de Percepção" },
  { id: "attack", label: "Ataques (todos)" },
  { id: "defense", label: "Defesa (Bloqueio/Esquiva)" },
];

/** Lista de tipos exibida no editor */
export const EFFECT_TYPES = [
  { id: "dice", label: "+Dados de Melhoria", suffix: "D" },
  { id: "bonus", label: "+Bônus (valor)", suffix: "" },
  { id: "damage", label: "Bônus de Dano", suffix: "" },
  { id: "rd", label: "Redução de Dano", suffix: "" },
  { id: "info", label: "Condição / Texto", suffix: "" },
];

/** Item está atualmente em efeito? */
export function isItemActive(item) {
  if (!item) return false;
  if (item.mode === "active") return !!item.active;
  return true; // passive (default)
}

/**
 * Coleta TODOS os efeitos ativos do personagem, com info de origem.
 * Retorna array de: { ...effect, source: string, kind: "skill"|"equipment"|"spell" }
 */
export function collectActiveEffects(character) {
  if (!character) return [];
  const out = [];

  for (const s of character.skills || []) {
    if (!isItemActive(s)) continue;
    for (const e of s.effects || []) {
      out.push({ ...e, source: s.name || "Habilidade", kind: "skill" });
    }
  }
  for (const it of character.equipment || []) {
    if (!isItemActive(it)) continue;
    for (const e of it.effects || []) {
      out.push({ ...e, source: it.name || "Equipamento", kind: "equipment" });
    }
  }
  for (const sp of (character.magic && character.magic.grimoire) || []) {
    if (!isItemActive(sp)) continue;
    for (const e of sp.effects || []) {
      out.push({ ...e, source: sp.base || "Magia", kind: "spell" });
    }
  }
  return out;
}

/**
 * Dado um contexto de rolagem, retorna o quanto somar de dados e de bônus.
 *
 * ctx = {
 *   attribute?: "forca" | ...    // se a rolagem usa um atributo
 *   isAttack?: boolean           // se é uma rolagem de ataque
 *   skillName?: string           // se é uma rolagem de habilidade nomeada
 * }
 */
export function getRollModifiers(activeEffects, ctx = {}) {
  let dice = 0;
  let bonus = 0;
  const sources = [];

  for (const e of activeEffects) {
    if (e.type !== "dice" && e.type !== "bonus") continue;
    if (!matchesContext(e.target, ctx)) continue;

    const v = Number(e.value) || 0;
    if (e.type === "dice") dice += v;
    else bonus += v;
    sources.push({
      source: e.source,
      type: e.type,
      value: v,
      label: e.label,
    });
  }

  return { dice, bonus, sources };
}

function matchesContext(target, ctx) {
  if (!target || target === "all") return true;
  if (target === "attack" && ctx.isAttack) return true;
  if (ctx.attribute && target === ctx.attribute) return true;
  if (ctx.skillName && target === `skill:${ctx.skillName}`) return true;
  return false;
}

/**
 * Para o painel de "Modificadores Ativos": agrega efeitos por categoria
 * em buckets de exibição.
 */
export function summarizeEffects(activeEffects) {
  const buckets = []; // [{ label, parts: ["+1D (Espada)", ...] }]

  // Buckets de rolagem
  const rollBuckets = {
    all: { label: "Qualquer rolagem", dice: 0, bonus: 0, parts: [] },
    forca: { label: "Força", dice: 0, bonus: 0, parts: [] },
    agilidade: { label: "Agilidade", dice: 0, bonus: 0, parts: [] },
    vigor: { label: "Vigor", dice: 0, bonus: 0, parts: [] },
    mente: { label: "Mente", dice: 0, bonus: 0, parts: [] },
    percepcao: { label: "Percepção", dice: 0, bonus: 0, parts: [] },
    attack: { label: "Ataques", dice: 0, bonus: 0, parts: [] },
    defense: { label: "Defesa", dice: 0, bonus: 0, parts: [] },
  };

  let damageBonus = 0;
  const damageParts = [];
  let damageReduction = 0;
  const rdParts = [];
  const conditions = [];

  for (const e of activeEffects) {
    if (e.type === "dice" || e.type === "bonus") {
      const target = e.target?.startsWith("skill:")
        ? null
        : rollBuckets[e.target || "all"];
      if (target) {
        const v = Number(e.value) || 0;
        if (e.type === "dice") target.dice += v;
        else target.bonus += v;
        target.parts.push(formatPart(e));
      } else if (e.target?.startsWith("skill:")) {
        // adiciona como parte solta
        const sname = e.target.slice(6);
        rollBuckets.all.parts.push(`${formatPart(e)} em ${sname}`);
      }
    } else if (e.type === "damage") {
      damageBonus += Number(e.value) || 0;
      damageParts.push(formatPart(e));
    } else if (e.type === "rd") {
      damageReduction += Number(e.value) || 0;
      rdParts.push(formatPart(e));
    } else if (e.type === "info") {
      conditions.push({
        text: e.label || "—",
        source: e.source,
      });
    }
  }

  for (const k of Object.keys(rollBuckets)) {
    const b = rollBuckets[k];
    if (b.dice || b.bonus || b.parts.length) buckets.push(b);
  }

  return {
    rollBuckets: buckets,
    damageBonus,
    damageParts,
    damageReduction,
    rdParts,
    conditions,
  };
}

function formatPart(e) {
  const v = Number(e.value) || 0;
  const sign = v >= 0 ? "+" : "";
  let prefix = "";
  if (e.type === "dice") prefix = `${sign}${v}D`;
  else if (e.type === "bonus") prefix = `${sign}${v}`;
  else if (e.type === "damage") prefix = `${sign}${v} dano`;
  else if (e.type === "rd") prefix = `${sign}${v} RD`;
  else prefix = e.label || "—";
  const src = e.source ? ` (${e.source})` : "";
  return `${prefix}${src}`;
}
