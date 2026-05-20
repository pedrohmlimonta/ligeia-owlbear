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

    // Habilidades (cada uma com nível B/A/E)
    skills: [], // [{ name: "Atletismo", level: "B" }, ...]

    // Equipamentos (texto livre)
    equipment: "",

    // Ataques (dois espaços conforme a ficha)
    attacks: [
      { weapon: "", attribute: "forca", bonus: 0, dice: 0, properties: "" },
      { weapon: "", attribute: "forca", bonus: 0, dice: 0, properties: "" },
    ],

    // Magias
    magic: {
      knownWords: [], // ids de palavras arcanas aprendidas
      minorSpells: "", // texto livre com magias menores/truques
      grimoire: [
        { base: "", metamagics: ["", ""] },
        { base: "", metamagics: ["", ""] },
        { base: "", metamagics: ["", ""] },
        { base: "", metamagics: ["", ""] },
        { base: "", metamagics: ["", ""] },
        { base: "", metamagics: ["", ""] },
      ],
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
