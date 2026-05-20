// ===========================================================================
// Palavras Arcanas — Ligeia RPG
// Listadas conforme o "Mapa de Magias" da ficha de personagem (página 2 da
// ficha) e a Sessão 11: Magia do Livro de Regras.
// ===========================================================================

export const WORDS_OF_BASE = [
  // Palavras abstratas (não conjuráveis sozinhas; servem como base)
  { id: "omni", name: "Omni", category: "abstrata" },
  { id: "othera", name: "Othera", category: "abstrata" },
  { id: "autem", name: "Autem", category: "abstrata" },
];

export const ARCANE_WORDS = [
  { id: "acida", name: "Acida", category: "elemental", damage: "Ácido" },
  { id: "augurado", name: "Augurado", category: "adivinhação" },
  { id: "carmo", name: "Carmo", category: "encantamento" },
  { id: "devena", name: "Devena", category: "convocação" },
  { id: "energio", name: "Energio", category: "elemental", damage: "Energia" },
  { id: "exitium", name: "Exitium", category: "destruição" },
  { id: "forjuri", name: "Forjuri", category: "criação" },
  { id: "fulgur", name: "Fulgur", category: "elemental", damage: "Raio" },
  { id: "glacios", name: "Glacios", category: "elemental", damage: "Frio" },
  { id: "ignis", name: "Ignis", category: "elemental", damage: "Fogo" },
  { id: "iluzio", name: "Iluzio", category: "ilusão" },
  { id: "inanis", name: "Inanis", category: "antimagia" },
  { id: "kreo", name: "Kreo", category: "criação" },
  { id: "krucigon", name: "Krucigon", category: "transmutação" },
  { id: "lumo", name: "Lumo", category: "luz" },
  { id: "majesto", name: "Majesto", category: "amplificação" },
  { id: "menso", name: "Menso", category: "mente" },
  { id: "mortis", name: "Mortis", category: "morte", damage: "Necrótico" },
  { id: "noxia", name: "Nóxia", category: "veneno", damage: "Veneno" },
  { id: "pluribus", name: "Pluribus", category: "multiplicação" },
  { id: "saeculorum", name: "Saeculorum", category: "tempo" },
  { id: "sangon", name: "Sangon", category: "sangue" },
  { id: "sankta", name: "Sankta", category: "sagrado", damage: "Radiante" },
  { id: "sonigu", name: "Sonigu", category: "som", damage: "Sônico" },
  { id: "sorcdiron", name: "Sorcdiron", category: "encantamento" },
  { id: "tenebrae", name: "Tenebrae", category: "trevas" },
  { id: "traumato", name: "Traumato", category: "psíquico", damage: "Psíquico" },
  { id: "vitae", name: "Vitae", category: "vida" },
];

export const ALL_WORDS = [...WORDS_OF_BASE, ...ARCANE_WORDS];
