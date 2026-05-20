// ===========================================================================
// Modelo de personagem para Ligeia RPG.
//
// Reflete exatamente os campos da ficha oficial (Ficha_de_Personagem.pdf):
// - Cabeçalho: nome, conceito, raça, herança, vocação, modelo, carreiras
// - Atributos primários (com dados de melhoria)
// - Atributos secundários (derivados)
// - PV, PM, Pontos Heróicos, Corrupção, XP, Nível
// - Lista de habilidades (B/A/E - Básico, Avançado, Especial)
// - Equipamentos
// - Dois espaços de ataques (arma + bônus + propriedades)
// - Mapa de magias (palavras arcanas aprendidas)
// - Magias menores (truques)
// - Grimório (6 magias base, cada com até 2 metamagias)
// ===========================================================================

export function createBlankCharacter(name = "Novo Personagem") {
  return {
    id: crypto.randomUUID(),
    version: 1,

    // Tipo
    npc: false,        // se true, fica oculto dos jogadores (só GM vê)
    tokenId: null,     // id do item da cena (token) vinculado

    // Identidade
    name,
    concept: "",
    race: "",
    heritage: "—",
    vocation: "",
    template: "",
    careers: "",
    nation: "",

    // Progressão
    level: 1,
    xpSpent: 0,
    xpRemaining: 60, // pontos de antecedentes iniciais
    corruption: 5,
    personality: "",
    heroicPoints: 1,

    // Atributos primários (entre 2 e 5, total inicial = 15)
    attributes: {
      forca: { value: 3, dice: 0 },
      agilidade: { value: 3, dice: 0 },
      vigor: { value: 3, dice: 0 },
      mente: { value: 3, dice: 0 },
      percepcao: { value: 3, dice: 0 },
    },

    // Atributos secundários — geralmente derivados, mas com override manual
    secondary: {
      bloqueio: { override: null }, // padrão = força
      carga: { override: null },
      esquiva: { override: null }, // padrão = agilidade
      deslocamento: { override: null, raceBonus: 0 },
      sonoFomeSed: { override: null }, // padrão = vigor
      conjuracao: { override: null }, // padrão = mente
      iniciativa: { override: null }, // padrão = max(per, agi)
      percepcaoPassiva: { override: null }, // padrão = percepcao
    },

    // Recursos
    hp: { current: 0, max: 0, vocationBonus: 0 },
    mp: { current: 0, max: 0, vocationBonus: 0 },

    // Habilidades (cada uma com nível B/A/E + modo/efeitos)
    skills: [], // [{ name, level, attribute, mode, active, effects: [...] }]

    // Equipamentos (lista de itens com efeitos)
    equipment: [], // [{ name, qty, weight, notes, mode, active, effects: [...] }]

    // Ataques (lista dinâmica)
    attacks: [], // [{ weapon, attribute, bonus, dice, properties }]

    // Magias
    magic: {
      knownWords: [],
      minorSpells: "",
      grimoire: [], // [{ base, metamagics: [...], mode, active, effects: [...] }]
    },

    // Anotações livres
    notes: "",
  };
}

/**
 * Calcula os atributos secundários conforme as regras (Sessão 2).
 */
export function deriveSecondary(char) {
  const a = char.attributes;
  const s = char.secondary;
  const f = a.forca.value;
  const ag = a.agilidade.value;
  const v = a.vigor.value;
  const m = a.mente.value;
  const p = a.percepcao.value;

  // Iniciativa = max(Percepção, Agilidade)
  const iniBase = Math.max(p, ag);
  const iniDice = p >= ag ? a.percepcao.dice : a.agilidade.dice;

  return {
    bloqueio: { value: s.bloqueio.override ?? f, dice: a.forca.dice },
    carga: { value: s.carga.override ?? f, unit: "kg" },
    esquiva: { value: s.esquiva.override ?? ag, dice: a.agilidade.dice },
    deslocamento: {
      value: (s.deslocamento.override ?? ag) + (s.deslocamento.raceBonus || 0),
      unit: "m",
    },
    sonoFomeSed: { value: s.sonoFomeSed.override ?? v },
    conjuracao: { value: s.conjuracao.override ?? m, dice: a.mente.dice },
    iniciativa: { value: s.iniciativa.override ?? iniBase, dice: iniDice },
    percepcaoPassiva: { value: s.percepcaoPassiva.override ?? p, dice: a.percepcao.dice },
  };
}

/**
 * Calcula PV e PM máximos conforme regras:
 *   PV máx = Vigor + Nível + dado de melhoria de Vigor + bônus de vocação
 *   PM máx = Mente + Nível + dado de melhoria de Mente + bônus de vocação
 */
export function deriveResources(char) {
  const v = char.attributes.vigor.value;
  const m = char.attributes.mente.value;
  const vDice = char.attributes.vigor.dice;
  const mDice = char.attributes.mente.dice;
  const level = char.level || 1;
  return {
    hpMax: v + level + vDice + (char.hp.vocationBonus || 0),
    mpMax: m + level + mDice + (char.mp.vocationBonus || 0),
  };
}

/**
 * Normaliza fichas antigas para o formato atual.
 */
export function migrateCharacter(char) {
  if (!char) return char;
  const c = { ...char };

  // Novos campos com defaults
  if (typeof c.npc !== "boolean") c.npc = false;
  if (typeof c.tokenId === "undefined") c.tokenId = null;

  // Helper para adicionar campos de efeitos a um item
  const withEffects = (item) => ({
    mode: item.mode === "active" ? "active" : "passive",
    active: !!item.active,
    effects: Array.isArray(item.effects) ? item.effects : [],
    ...item,
    // re-aplica após o spread para garantir defaults nas chaves ausentes
  });
  const normalizeEffects = (item) => ({
    ...item,
    mode: item.mode === "active" ? "active" : "passive",
    active: !!item.active,
    effects: Array.isArray(item.effects)
      ? item.effects.map((e) => ({
          type: e.type || "bonus",
          target: e.target || "all",
          value: typeof e.value === "number" ? e.value : Number(e.value) || 0,
          label: typeof e.label === "string" ? e.label : "",
        }))
      : [],
  });

  // Habilidades
  if (Array.isArray(c.skills)) {
    c.skills = c.skills.map(normalizeEffects);
  } else {
    c.skills = [];
  }

  // Equipamento: string → array
  if (typeof c.equipment === "string") {
    const lines = c.equipment
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    c.equipment = lines.map((line) =>
      normalizeEffects({ name: line, qty: 1, weight: 0, notes: "" })
    );
  } else if (Array.isArray(c.equipment)) {
    c.equipment = c.equipment.map(normalizeEffects);
  } else {
    c.equipment = [];
  }

  // Ataques
  if (!Array.isArray(c.attacks)) {
    c.attacks = [];
  } else {
    c.attacks = c.attacks.filter(
      (a) =>
        (a.weapon && a.weapon.trim()) ||
        a.bonus ||
        a.dice ||
        (a.properties && a.properties.trim())
    );
  }

  // Magia
  if (!c.magic) {
    c.magic = { knownWords: [], minorSpells: "", grimoire: [] };
  } else {
    if (!Array.isArray(c.magic.knownWords)) c.magic.knownWords = [];
    if (typeof c.magic.minorSpells !== "string") c.magic.minorSpells = "";
    if (!Array.isArray(c.magic.grimoire)) {
      c.magic.grimoire = [];
    } else {
      c.magic.grimoire = c.magic.grimoire
        .map((entry) => ({
          ...entry,
          base: entry.base || "",
          metamagics: Array.isArray(entry.metamagics)
            ? entry.metamagics.filter((m) => typeof m === "string")
            : [],
        }))
        .filter(
          (entry) =>
            (entry.base && entry.base.trim()) ||
            entry.metamagics.some((m) => m && m.trim())
        )
        .map(normalizeEffects);
    }
  }

  return c;
}
