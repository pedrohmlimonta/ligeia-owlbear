// ===========================================================================
// Sistema de efeitos / modificadores
//
// Cada habilidade, equipamento e magia base pode declarar uma lista de
// efeitos. Cada efeito está "em uso" quando:
//   - O item que o contém está ativo (passive sempre, ou active && active=true)
//   - E o próprio efeito não está desligado pelo jogador (enabled !== false)
//
// Modelo de efeito:
//   { type, target, value, label, enabled }
//
//   type:    "dice"   — +N dados de melhoria na rolagem alvo
//            "bonus"  — +N ao valor da rolagem alvo
//            "damage" — +N ao dano (informativo + somado no painel)
//            "rd"     — redução de dano (informativo + somado no painel)
//            "stat"   — modifica um valor derivado (max_hp, max_mp, etc.)
//            "info"   — texto livre / condição (exibido)
//
//   target:  Para "dice" e "bonus":
//              "all", "forca", "agilidade", "vigor", "mente", "percepcao",
//              "attack", "defense", "initiative", "skill:<nome>"
//            Para "stat":
//              "max_hp", "max_mp", "max_heroic", "initiative",
//              "defense", "deslocamento"
//            Outros tipos ignoram target.
//
//   value:   número (ignorado para "info")
//   label:   texto livre/condição (opcional)
//   enabled: undefined → tratado como true. Quando false, o jogador
//            desligou esse efeito específico, mesmo com o item ativo.
// ===========================================================================

/** Lista de targets para efeitos de ROLAGEM (dice/bonus) */
export const EFFECT_ROLL_TARGETS = [
  { id: "all", label: "Qualquer rolagem" },
  { id: "forca", label: "Rolagens de Força" },
  { id: "agilidade", label: "Rolagens de Agilidade" },
  { id: "vigor", label: "Rolagens de Vigor" },
  { id: "mente", label: "Rolagens de Mente" },
  { id: "percepcao", label: "Rolagens de Percepção" },
  { id: "attack", label: "Ataques (todos)" },
  { id: "defense", label: "Defesa (Bloqueio/Esquiva)" },
  { id: "initiative", label: "Rolagem de Iniciativa" },
];

/** Lista de targets para STAT (valores derivados) */
export const EFFECT_STAT_TARGETS = [
  { id: "max_hp", label: "PV máximo" },
  { id: "max_mp", label: "PM máximo" },
  { id: "max_heroic", label: "Pontos Heroicos máx" },
  { id: "initiative", label: "Iniciativa (valor)" },
  { id: "defense", label: "Defesa (valor)" },
  { id: "deslocamento", label: "Deslocamento" },
];

/** Lista de targets para SET (define um valor fixo enquanto ativo) */
export const EFFECT_SET_TARGETS = [
  { id: "forca", label: "Força (valor)" },
  { id: "agilidade", label: "Agilidade (valor)" },
  { id: "vigor", label: "Vigor (valor)" },
  { id: "mente", label: "Mente (valor)" },
  { id: "percepcao", label: "Percepção (valor)" },
  { id: "bloqueio", label: "Bloqueio (valor)" },
  { id: "esquiva", label: "Esquiva (valor)" },
  { id: "conjuracao", label: "Conjuração (valor)" },
  { id: "iniciativa", label: "Iniciativa (valor)" },
  { id: "deslocamento", label: "Deslocamento" },
  { id: "percepcao_passiva", label: "Percepção Passiva" },
];

/** Lista de tipos exibida no editor */
export const EFFECT_TYPES = [
  { id: "dice", label: "+Dados de Melhoria (rolagem)" },
  { id: "bonus", label: "+Bônus em Rolagem" },
  { id: "stat", label: "Modificar Valor (PV/PM/...)" },
  { id: "set", label: "Definir Valor (atributo/secundário)" },
  { id: "damage", label: "Bônus de Dano" },
  { id: "rd", label: "Redução de Dano" },
  { id: "info", label: "Condição / Texto" },
];

/** Item está ativo (modo passivo sempre, ativo só se ligado)? */
export function isItemActive(item) {
  if (!item) return false;
  if (item.mode === "active") return !!item.active;
  return true; // passive
}

/** Efeito individual está habilitado pelo jogador? */
export function isEffectEnabled(effect) {
  // Se enabled não existe (efeito antigo), trata como true
  return effect && effect.enabled !== false;
}

/**
 * Coleta TODOS os efeitos atualmente em uso, com info de origem.
 * Considera tanto o estado do item quanto o `enabled` por efeito.
 */
export function collectActiveEffects(character) {
  if (!character) return [];
  const out = [];
  const push = (item, kind, label) => {
    if (!isItemActive(item)) return;
    for (const e of item.effects || []) {
      if (!isEffectEnabled(e)) continue;
      out.push({ ...e, source: item.name || item.base || label, kind });
    }
  };

  for (const s of character.skills || []) push(s, "skill", "Habilidade");
  for (const it of character.equipment || []) push(it, "equipment", "Equipamento");
  for (const sp of (character.magic && character.magic.grimoire) || [])
    push(sp, "spell", "Magia");
  for (const t of character.traits || []) push(t, "trait", "Traço");
  return out;
}

/**
 * Dado um contexto de rolagem, retorna o quanto somar de dados e de bônus.
 */
export function getRollModifiers(activeEffects, ctx = {}) {
  let dice = 0;
  let bonus = 0;
  const sources = [];

  for (const e of activeEffects) {
    if (e.type !== "dice" && e.type !== "bonus") continue;
    if (!matchesRollContext(e.target, ctx)) continue;

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

function matchesRollContext(target, ctx) {
  if (!target || target === "all") return true;
  if (target === "attack" && ctx.isAttack) return true;
  if (target === "initiative" && ctx.isInitiative) return true;
  if (target === "defense" && ctx.isDefense) return true;
  if (ctx.attribute && target === ctx.attribute) return true;
  if (ctx.skillName && target === `skill:${ctx.skillName}`) return true;
  return false;
}

/**
 * Agrega efeitos do tipo "stat" para um determinado valor derivado.
 * statKey: "max_hp" | "max_mp" | "max_heroic" | "initiative" | "defense" | "deslocamento"
 * Retorna { delta, sources: [...] }
 */
export function getStatModifiers(activeEffects, statKey) {
  let delta = 0;
  const sources = [];
  for (const e of activeEffects) {
    if (e.type !== "stat") continue;
    if (e.target !== statKey) continue;
    const v = Number(e.value) || 0;
    delta += v;
    sources.push({ source: e.source, value: v, label: e.label });
  }
  return { delta, sources };
}

/**
 * Verifica se algum efeito do tipo `set` está definindo um valor fixo
 * para o atributo/secundário informado. Se houver mais de um, vence
 * o de maior valor (regra simples e previsível).
 *
 * Retorna `{ value, source }` ou `null` se não houver override.
 */
export function getStatOverride(activeEffects, statKey) {
  let best = null;
  for (const e of activeEffects) {
    if (e.type !== "set") continue;
    if (e.target !== statKey) continue;
    const v = Number(e.value) || 0;
    if (best === null || v > best.value) {
      best = { value: v, source: e.source, label: e.label };
    }
  }
  return best;
}

/**
 * Painel "Modificadores Ativos": agrega tudo para exibição.
 */
export function summarizeEffects(activeEffects) {
  const rollBuckets = {
    all: { label: "Qualquer rolagem", dice: 0, bonus: 0, parts: [] },
    forca: { label: "Força", dice: 0, bonus: 0, parts: [] },
    agilidade: { label: "Agilidade", dice: 0, bonus: 0, parts: [] },
    vigor: { label: "Vigor", dice: 0, bonus: 0, parts: [] },
    mente: { label: "Mente", dice: 0, bonus: 0, parts: [] },
    percepcao: { label: "Percepção", dice: 0, bonus: 0, parts: [] },
    attack: { label: "Ataques", dice: 0, bonus: 0, parts: [] },
    defense: { label: "Defesa", dice: 0, bonus: 0, parts: [] },
    initiative: { label: "Iniciativa", dice: 0, bonus: 0, parts: [] },
  };

  let damageBonus = 0;
  const damageParts = [];
  let damageReduction = 0;
  const rdParts = [];
  const conditions = [];
  const statBuckets = {}; // key -> { label, delta, parts }

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
        const sname = e.target.slice(6);
        rollBuckets.all.parts.push(`${formatPart(e)} em ${sname}`);
      }
    } else if (e.type === "damage") {
      damageBonus += Number(e.value) || 0;
      damageParts.push(formatPart(e));
    } else if (e.type === "rd") {
      damageReduction += Number(e.value) || 0;
      rdParts.push(formatPart(e));
    } else if (e.type === "stat") {
      const key = e.target || "max_hp";
      const lbl = STAT_LABELS[key] || key;
      const bucket = statBuckets[key] || { label: lbl, delta: 0, parts: [] };
      bucket.delta += Number(e.value) || 0;
      bucket.parts.push(formatPart(e));
      statBuckets[key] = bucket;
    } else if (e.type === "info") {
      conditions.push({ text: e.label || "—", source: e.source });
    }
  }

  const buckets = [];
  for (const k of Object.keys(rollBuckets)) {
    const b = rollBuckets[k];
    if (b.dice || b.bonus || b.parts.length) buckets.push(b);
  }
  const stats = Object.values(statBuckets);

  return {
    rollBuckets: buckets,
    damageBonus,
    damageParts,
    damageReduction,
    rdParts,
    conditions,
    stats,
  };
}

const STAT_LABELS = {
  max_hp: "PV máximo",
  max_mp: "PM máximo",
  max_heroic: "Pontos Heroicos máx",
  initiative: "Iniciativa",
  defense: "Defesa",
  deslocamento: "Deslocamento",
};

function formatPart(e) {
  const v = Number(e.value) || 0;
  const sign = v >= 0 ? "+" : "";
  let prefix;
  if (e.type === "dice") prefix = `${sign}${v}D`;
  else if (e.type === "bonus") prefix = `${sign}${v}`;
  else if (e.type === "damage") prefix = `${sign}${v} dano`;
  else if (e.type === "rd") prefix = `${sign}${v} RD`;
  else if (e.type === "stat") prefix = `${sign}${v}`;
  else prefix = e.label || "—";
  const src = e.source ? ` (${e.source})` : "";
  return `${prefix}${src}`;
}
