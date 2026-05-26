// ===========================================================================
// Ligeia RPG — Motor de rolagem
//
// Regras (Livro de Regras, Sessão 2: "O Básico" e "Dados De Melhoria"):
//
// 1. A rolagem padrão é 2d6 + atributo (+ bônus situacionais).
// 2. Dados de melhoria são d6 EXTRAS adicionados à rolagem.
//    Quando há dados de melhoria, role todos, MAS só os DOIS MAIORES
//    dados são considerados para somar com o atributo.
// 3. Sucesso crítico: os dois maiores dados resultam em "6, 6" E o
//    resultado total iguala/supera a dificuldade. Falha crítica: os
//    dois maiores dados resultam em "1, 1" (sempre, independente do
//    valor de atributo/bônus).
// 4. Em rolagens opostas, vence o maior resultado. Empate vai para o
//    atacante.
// ===========================================================================

/**
 * Rola um dado de seis faces.
 * @returns {number} valor entre 1 e 6
 */
function rollD6() {
  return Math.floor(Math.random() * 6) + 1;
}

/**
 * Executa uma rolagem de Ligeia.
 *
 * @param {Object} params
 * @param {number} params.attribute    Valor do atributo (Força, Mente, etc.) ou 0 para "rolagem pura".
 * @param {number} params.improvement  Dados de melhoria adicionais (somados aos 2 base).
 * @param {number} params.bonus        Bônus/redutor fixo (+ ou -).
 * @param {string} params.label        Rótulo descritivo da rolagem.
 * @param {number} params.difficulty   Dificuldade alvo (opcional).
 *
 * @returns {Object} resultado da rolagem
 */
export function rollLigeia({
  attribute = 0,
  improvement = 0,
  bonus = 0,
  label = "Rolagem",
  difficulty = null,
} = {}) {
  // Total de dados a rolar (mínimo 2; melhoria adiciona mais)
  const totalDice = 2 + Math.max(0, improvement);

  // Rola todos os dados
  const allRolls = [];
  for (let i = 0; i < totalDice; i++) {
    allRolls.push(rollD6());
  }

  // Ordena decrescente e pega os 2 maiores
  const sorted = [...allRolls].sort((a, b) => b - a);
  const kept = sorted.slice(0, 2);
  const dropped = sorted.slice(2);

  const diceSum = kept[0] + kept[1];
  const total = diceSum + attribute + bonus;

  // Detecção de críticos (apenas os 2 dados mantidos importam)
  const isCritFail = kept[0] === 1 && kept[1] === 1;
  const isCritSuccess =
    kept[0] === 6 &&
    kept[1] === 6 &&
    (difficulty == null || total >= difficulty);

  // Determinação de sucesso/falha contra dificuldade (se houver)
  let outcome = "neutral";
  if (isCritFail) outcome = "crit-fail";
  else if (isCritSuccess) outcome = "crit-success";
  else if (difficulty != null) {
    outcome = total >= difficulty ? "success" : "fail";
  }

  return {
    rollId:
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2) + Date.now().toString(36),
    label,
    attribute,
    improvement,
    bonus,
    difficulty,
    allRolls, // todos os dados rolados, em ordem
    kept, // os 2 maiores
    dropped, // os descartados (melhoria não usada)
    diceSum, // soma dos 2 maiores
    total, // resultado final somado
    isCritFail,
    isCritSuccess,
    outcome,
    timestamp: Date.now(),
  };
}

/**
 * Rola dano. Em Ligeia, dano vem em formato:
 *   "Tipo X"   -> dano fixo X (ex: "Raio 2")
 *   "Tipo +X"  -> dano escalonado: X base + 1 por cada 2 pontos que o ataque
 *                  superou a defesa.
 *
 * Esta função apenas calcula o dano bruto. Subtrair proteção fica a cargo
 * do narrador/jogador.
 *
 * @param {Object} params
 * @param {number} params.base             Dano base da arma/magia.
 * @param {number} params.scalingDiff      Diferença entre rolagem de ataque e defesa.
 * @param {boolean} params.isScaling       Se true, soma 1 por 2 pontos de diferença.
 * @param {number} params.skillBonus       Bônus de habilidades.
 * @param {number} params.critBonus        Bônus de crítico (= nível do personagem).
 */
export function calculateDamage({
  base = 0,
  scalingDiff = 0,
  isScaling = false,
  skillBonus = 0,
  critBonus = 0,
} = {}) {
  const scaling = isScaling ? Math.floor(Math.max(0, scalingDiff) / 2) : 0;
  const total = base + scaling + skillBonus + critBonus;
  return {
    base,
    scaling,
    skillBonus,
    critBonus,
    total: Math.max(0, total),
  };
}

/**
 * Formata uma rolagem como texto legível (para histórico/broadcast).
 */
export function formatRoll(r) {
  const dicePart =
    r.dropped && r.dropped.length > 0
      ? `[${r.kept.join(", ")}] (descartados: ${r.dropped.join(", ")})`
      : `[${r.kept.join(", ")}]`;

  const parts = [`${dicePart} = ${r.diceSum}`];
  if (r.attribute) parts.push(`atributo ${r.attribute >= 0 ? "+" : ""}${r.attribute}`);
  if (r.bonus) parts.push(`bônus ${r.bonus >= 0 ? "+" : ""}${r.bonus}`);

  let outcome = "";
  if (r.isCritSuccess) outcome = " ✦ SUCESSO CRÍTICO ✦";
  else if (r.isCritFail) outcome = " ✗ FALHA CRÍTICA ✗";
  else if (r.difficulty != null) {
    outcome = r.outcome === "success" ? ` ✓ vs ${r.difficulty}` : ` ✗ vs ${r.difficulty}`;
  }

  return `${r.label}: ${parts.join(" + ")} = ${r.total}${outcome}`;
}

/**
 * Versão resumida — só rótulo, total e crítico. Sem dados, atributo, bônus.
 * Usada para mostrar rolagens do Narrador aos jogadores.
 */
export function formatRollSummary(r) {
  let outcome = "";
  if (r.isCritSuccess) outcome = " ✦ SUCESSO CRÍTICO ✦";
  else if (r.isCritFail) outcome = " ✗ FALHA CRÍTICA ✗";
  const label = r.label ? `${r.label}: ` : "";
  return `${label}${r.total}${outcome}`;
}

/**
 * Escolhe o formato apropriado para mostrar uma rolagem a um observador.
 *
 * Regras:
 *  - Quem rolou sempre vê os detalhes completos (própria rolagem).
 *  - GMs sempre veem o resultado real.
 *  - Rolagens ocultas (`hidden: true`) NÃO ainda reveladas → players veem "???".
 *  - Rolagens normais do Narrador → players veem versão resumida (sem dados,
 *    atributo, bônus — só rótulo + total + crítico).
 */
export function formatRollForViewer(roll, viewer) {
  if (!roll) return "";
  const viewerRole = viewer?.role || "PLAYER";
  const viewerId = viewer?.id;
  const fromRole = roll.fromRole || "GM";
  const fromPlayerId = roll.fromPlayerId;
  const isAuthor = fromPlayerId && viewerId && fromPlayerId === viewerId;

  // GM e o autor sempre veem o real (com prefixo 🕶 se for oculta)
  if (isAuthor || viewerRole === "GM") {
    const txt = formatRoll(roll);
    return roll.hidden ? `🕶 ${txt}` : txt;
  }

  // Player: rolagem oculta vira "???"
  if (roll.hidden) {
    const label = roll.label ? `${roll.label}: ` : "";
    return `${label}???`;
  }

  // Player: rolagem normal vinda do Narrador é resumida
  if (fromRole === "GM") return formatRollSummary(roll);

  // Caso padrão (player rolou e outros players veem): completo
  return formatRoll(roll);
}

/**
 * Indica se a rolagem deve ter detalhes (dados, atributo, bônus) ocultos
 * para o observador. Útil para a renderização do toast/overlay também.
 */
export function shouldHideRollDetails(roll, viewer) {
  if (!roll) return false;
  const viewerRole = viewer?.role || "PLAYER";
  const viewerId = viewer?.id;
  const fromRole = roll.fromRole || "GM";
  const fromPlayerId = roll.fromPlayerId;
  if (fromPlayerId && viewerId && fromPlayerId === viewerId) return false;
  if (viewerRole === "GM") return false;
  // Players sempre veem versão sem detalhes quando vier do GM ou for oculta
  if (roll.hidden) return true;
  return fromRole === "GM";
}

/**
 * Indica se o total deve aparecer mascarado (???).
 * Apenas para rolagens ocultas que ainda não foram reveladas, e para
 * observadores que não são o autor nem GM.
 */
export function shouldMaskRollTotal(roll, viewer) {
  if (!roll || !roll.hidden) return false;
  const viewerRole = viewer?.role || "PLAYER";
  const viewerId = viewer?.id;
  const fromPlayerId = roll.fromPlayerId;
  const isAuthor = fromPlayerId && viewerId && fromPlayerId === viewerId;
  if (isAuthor || viewerRole === "GM") return false;
  return true;
}
