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
    rollHidden: false, // se true, todas as rolagens DESTA ficha vão ocultas
    tokenIds: [],      // ids dos items da cena (tokens) vinculados (múltiplos)
    playerId: null,    // id do OBR.player dono dessa ficha (PC)

    // Identidade
    name,
    image: "",          // data URL da imagem do personagem (retrato)
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
    heroicBonus: 0, // ajuste do Narrador no máximo de pontos heroicos

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
      deslocamento: { override: null, raceBonus: 0, bonus: 0 },
      sonoFomeSed: { override: null }, // padrão = vigor
      conjuracao: { override: null }, // padrão = mente
      iniciativa: { override: null }, // padrão = max(per, agi)
      percepcaoPassiva: { override: null }, // padrão = percepcao
    },

    // Recursos
    // `bonus` é um ajuste manual do Narrador (negativo ou positivo)
    // `temp` (apenas em hp) são pontos de vida temporários (escudo extra)
    hp: { current: 0, max: 0, vocationBonus: 0, bonus: 0, temp: 0 },
    mp: { current: 0, max: 0, vocationBonus: 0, bonus: 0 },

    // Permissões
    // Se true, o jogador dono ganha acesso total de Narrador a esta ficha.
    grantPlayerGmAccess: false,

    // Habilidades (cada uma com nível B/A/E + modo/efeitos)
    skills: [], // [{ name, level, attribute, mode, active, effects: [...] }]

    // Traços (raciais, de herança, ou peculiaridades do personagem)
    // Cada traço tem: { name, source, description, mode, active, effects[], costs[] }
    // source pode ser: "race", "heritage", "background", "other"
    traits: [],

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
export function deriveSecondary(char, activeEffects = []) {
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

  // Soma deltas dos efeitos de stat e procura overrides "set"
  let dIni = 0, dDef = 0, dDesloc = 0;
  const overrides = {};
  for (const e of activeEffects) {
    const val = Number(e.value) || 0;
    if (e.type === "stat") {
      if (e.target === "initiative") dIni += val;
      else if (e.target === "defense") dDef += val;
      else if (e.target === "deslocamento") dDesloc += val;
    } else if (e.type === "set") {
      // Maior valor vence quando há múltiplos overrides do mesmo alvo
      if (overrides[e.target] == null || val > overrides[e.target]) {
        overrides[e.target] = val;
      }
    }
  }

  const pick = (key, fallback) =>
    overrides[key] != null ? overrides[key] : fallback;

  return {
    bloqueio: { value: pick("bloqueio", (s.bloqueio.override ?? f) + dDef), dice: a.forca.dice },
    carga: { value: pick("carga", s.carga.override ?? f), unit: "kg" },
    esquiva: { value: pick("esquiva", (s.esquiva.override ?? ag) + dDef), dice: a.agilidade.dice },
    deslocamento: {
      value: pick(
        "deslocamento",
        (s.deslocamento.override ?? ag) +
          (s.deslocamento.raceBonus || 0) +
          (s.deslocamento.bonus || 0) +
          dDesloc,
      ),
      unit: "m",
    },
    sonoFomeSed: { value: pick("sonoFomeSed", s.sonoFomeSed.override ?? v) },
    conjuracao: { value: pick("conjuracao", s.conjuracao.override ?? m), dice: a.mente.dice },
    iniciativa: {
      value: pick("iniciativa", (s.iniciativa.override ?? iniBase) + dIni),
      dice: iniDice,
    },
    percepcaoPassiva: {
      value: pick("percepcao_passiva", s.percepcaoPassiva.override ?? p),
      dice: a.percepcao.dice,
    },
  };
}

/**
 * Calcula PV e PM máximos:
 *   PV máx = Vigor + Nível + dado de melhoria de Vigor + bônus de vocação
 *            + bônus do Narrador + efeitos de stat (max_hp)
 *   Idem para PM.
 *   Pontos Heroicos máx = max(0, Nível + bônus do Narrador + efeitos)
 *
 * activeEffects é opcional. Quando passado, soma os efeitos "stat" cujos
 * targets sejam max_hp, max_mp ou max_heroic.
 */
export function deriveResources(char, activeEffects = []) {
  const v = char.attributes.vigor.value;
  const m = char.attributes.mente.value;
  const vDice = char.attributes.vigor.dice;
  const mDice = char.attributes.mente.dice;
  const level = char.level || 1;

  let dHp = 0, dMp = 0, dHero = 0;
  for (const e of activeEffects) {
    if (e.type !== "stat") continue;
    const val = Number(e.value) || 0;
    if (e.target === "max_hp") dHp += val;
    else if (e.target === "max_mp") dMp += val;
    else if (e.target === "max_heroic") dHero += val;
  }

  return {
    hpMax: Math.max(
      0,
      v + level + vDice + (char.hp.vocationBonus || 0) + (char.hp.bonus || 0) + dHp,
    ),
    mpMax: Math.max(
      0,
      m + level + mDice + (char.mp.vocationBonus || 0) + (char.mp.bonus || 0) + dMp,
    ),
    heroicMax: Math.max(0, level + (char.heroicBonus || 0) + dHero),
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
  if (typeof c.rollHidden !== "boolean") c.rollHidden = false;
  if (typeof c.playerId === "undefined") c.playerId = null;
  if (typeof c.heroicBonus !== "number") c.heroicBonus = 0;
  if (typeof c.grantPlayerGmAccess !== "boolean") c.grantPlayerGmAccess = false;
  if (c.hp && typeof c.hp.bonus !== "number") c.hp = { ...c.hp, bonus: 0 };
  if (c.hp && typeof c.hp.temp !== "number") c.hp = { ...c.hp, temp: 0 };
  if (c.mp && typeof c.mp.bonus !== "number") c.mp = { ...c.mp, bonus: 0 };
  if (
    c.secondary &&
    c.secondary.deslocamento &&
    typeof c.secondary.deslocamento.bonus !== "number"
  ) {
    c.secondary = {
      ...c.secondary,
      deslocamento: { ...c.secondary.deslocamento, bonus: 0 },
    };
  }

  // tokenId (string única, antigo) → tokenIds (array)
  if (!Array.isArray(c.tokenIds)) {
    if (typeof c.tokenId === "string" && c.tokenId) {
      c.tokenIds = [c.tokenId];
    } else {
      c.tokenIds = [];
    }
  }
  delete c.tokenId; // remove campo antigo

  // Helper para normalizar uma lista de efeitos
  const normalizeEffectList = (effects) =>
    Array.isArray(effects)
      ? effects.map((e) => ({
          type: e.type || "bonus",
          target: e.target || "all",
          value: typeof e.value === "number" ? e.value : Number(e.value) || 0,
          label: typeof e.label === "string" ? e.label : "",
          // Preserva o estado de ligado/desligado entre sessões.
          // Default true para efeitos antigos que não tinham essa flag.
          enabled: e.enabled === false ? false : true,
        }))
      : [];

  // Helper para normalizar custos (mana, vida, ponto heroico, ...)
  const normalizeCostList = (costs) =>
    Array.isArray(costs)
      ? costs.map((c) => ({
          resource: c.resource || "mp", // mp | hp | heroic | hpTemp
          value: Number(c.value) || 0,
          label: typeof c.label === "string" ? c.label : "",
        }))
      : [];

  // Normaliza campos comuns a items ativáveis
  const normalizeEffects = (item) => ({
    ...item,
    mode: item.mode === "active" ? "active" : "passive",
    active: !!item.active,
    effects: normalizeEffectList(item.effects),
    costs: normalizeCostList(item.costs),
    description: typeof item.description === "string" ? item.description : "",
  });

  // Normalizadores específicos por categoria
  const normalizeSkill = (s) => {
    const base = normalizeEffects(s);
    return {
      ...base,
      // Descrições por nível (Básico/Avançado/Especial)
      descBasic: typeof s.descBasic === "string" ? s.descBasic : base.description || "",
      descAdvanced: typeof s.descAdvanced === "string" ? s.descAdvanced : "",
      descSpecial: typeof s.descSpecial === "string" ? s.descSpecial : "",
      // Slots de ficha técnica
      activation: typeof s.activation === "string" ? s.activation : "",
      target: typeof s.target === "string" ? s.target : "",
      area: typeof s.area === "string" ? s.area : "",
      range: typeof s.range === "string" ? s.range : "",
      duration: typeof s.duration === "string" ? s.duration : "",
    };
  };

  const normalizeSpell = (g) => {
    const base = normalizeEffects(g);
    // Metamagias migram de strings → { name, wordId, description }
    const metamagics = Array.isArray(g.metamagics)
      ? g.metamagics
          .map((m) => {
            if (typeof m === "string") return { name: m, wordId: "", description: "" };
            return {
              name: typeof m.name === "string" ? m.name : "",
              wordId: typeof m.wordId === "string" ? m.wordId : "",
              description: typeof m.description === "string" ? m.description : "",
            };
          })
          // Mantém metamagias com nome OU palavra (não filtra vazias que estejam só com word)
      : [];
    return {
      ...base,
      wordId: typeof g.wordId === "string" ? g.wordId : "",
      casting: typeof g.casting === "string" ? g.casting : "",
      target: typeof g.target === "string" ? g.target : "",
      area: typeof g.area === "string" ? g.area : "",
      range: typeof g.range === "string" ? g.range : "",
      duration: typeof g.duration === "string" ? g.duration : "",
      peculiarities: typeof g.peculiarities === "string" ? g.peculiarities : "",
      metamagics,
    };
  };

  const normalizeEquipment = (e) => normalizeEffects(e);

  const normalizeTrait = (t) => {
    const base = normalizeEffects(t);
    return {
      ...base,
      source: typeof t.source === "string" ? t.source : "other",
    };
  };

  const normalizeAttack = (a) => ({
    weapon: a.weapon || "",
    attribute: a.attribute || "forca",
    bonus: Number(a.bonus) || 0,
    dice: Number(a.dice) || 0,
    properties: a.properties || "",
    description: typeof a.description === "string" ? a.description : "",
  });

  // Habilidades
  if (Array.isArray(c.skills)) {
    c.skills = c.skills.map(normalizeSkill);
  } else {
    c.skills = [];
  }

  // Traços
  if (Array.isArray(c.traits)) {
    c.traits = c.traits.map(normalizeTrait);
  } else {
    c.traits = [];
  }

  // Equipamento: string → array
  if (typeof c.equipment === "string") {
    const lines = c.equipment
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    c.equipment = lines.map((line) =>
      normalizeEquipment({ name: line, qty: 1, weight: 0, notes: "" })
    );
  } else if (Array.isArray(c.equipment)) {
    c.equipment = c.equipment.map(normalizeEquipment);
  } else {
    c.equipment = [];
  }

  // Ataques
  if (!Array.isArray(c.attacks)) {
    c.attacks = [];
  } else {
    c.attacks = c.attacks
      .filter(
        (a) =>
          (a.weapon && a.weapon.trim()) ||
          a.bonus ||
          a.dice ||
          (a.properties && a.properties.trim()) ||
          (a.description && a.description.trim())
      )
      .map(normalizeAttack);
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
          // Mantém todas metamagias; o normalizeSpell trata o formato
          metamagics: Array.isArray(entry.metamagics) ? entry.metamagics : [],
        }))
        .filter((entry) => {
          // Mantém entradas com base preenchida, palavra escolhida ou
          // qualquer metamagia com conteúdo
          if (entry.base && String(entry.base).trim()) return true;
          if (entry.wordId && String(entry.wordId).trim()) return true;
          return (entry.metamagics || []).some((m) => {
            if (typeof m === "string") return m.trim();
            return (m && (m.name || m.wordId)) ? true : false;
          });
        })
        .map(normalizeSpell);
    }
  }

  return c;
}

/**
 * Aplica clamping aos recursos: PV/PM/Pontos Heroicos atuais não podem
 * ultrapassar seus respectivos máximos, nem ser negativos.
 *
 * Pontos de Vida Temporários (hp.temp) podem ser livremente positivos.
 *
 * `resources` deve vir de deriveResources(c, activeEffects).
 */
export function clampResources(char, resources) {
  if (!char) return char;
  const { hpMax, mpMax, heroicMax } = resources || {};
  const c = { ...char };

  if (c.hp) {
    const cur = Number(c.hp.current) || 0;
    const temp = Math.max(0, Number(c.hp.temp) || 0);
    c.hp = {
      ...c.hp,
      current: Math.max(0, Math.min(cur, hpMax || 0)),
      temp,
    };
  }
  if (c.mp) {
    const cur = Number(c.mp.current) || 0;
    c.mp = {
      ...c.mp,
      current: Math.max(0, Math.min(cur, mpMax || 0)),
    };
  }
  const hp = Number(c.heroicPoints) || 0;
  c.heroicPoints = Math.max(0, Math.min(hp, heroicMax || 0));

  return c;
}

/**
 * Remove campos vazios/redundantes de um personagem para economizar
 * espaço na metadata da room (limite de 16 kB por item no Owlbear).
 * Não altera o objeto original.
 *
 * Estratégias:
 *  - remove strings vazias, arrays vazios, objetos vazios
 *  - remove campos de descrição em branco em skills/spells/equip/traits
 *  - remove efeitos/custos desabilitados e vazios
 */
export function slimCharacter(char) {
  if (!char || typeof char !== "object") return char;

  const isEmpty = (v) => {
    if (v === null || v === undefined) return true;
    if (typeof v === "string") return v.trim() === "";
    if (Array.isArray(v)) return v.length === 0;
    if (typeof v === "object") return Object.keys(v).length === 0;
    return false;
  };

  // Remove chaves vazias recursivamente, MAS preserva números (inclusive 0)
  // e booleanos (inclusive false), que são significativos.
  const clean = (obj) => {
    if (Array.isArray(obj)) {
      return obj.map(clean);
    }
    if (obj && typeof obj === "object") {
      const out = {};
      for (const [k, v] of Object.entries(obj)) {
        if (typeof v === "number" || typeof v === "boolean") {
          out[k] = v;
          continue;
        }
        const cleaned = clean(v);
        if (!isEmpty(cleaned)) {
          out[k] = cleaned;
        }
      }
      return out;
    }
    return obj;
  };

  return clean(char);
}

/**
 * Calcula o tamanho aproximado (em bytes) que o personagem ocupa quando
 * serializado em JSON. Útil para avisar o usuário antes de estourar o
 * limite do Owlbear.
 */
export function characterSizeBytes(char) {
  try {
    return new Blob([JSON.stringify(char)]).size;
  } catch {
    return JSON.stringify(char).length;
  }
}
