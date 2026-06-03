// ===========================================================================
// MODELOS DE HABILIDADE COM EFEITOS PRÉ-CONFIGURADOS
// ===========================================================================
//
// Este arquivo mapeia o `id` de uma habilidade da biblioteca (skillsLibrary.js)
// para uma configuração de efeitos/modo. Quando o jogador adiciona uma
// habilidade da biblioteca que tenha um modelo aqui, ela já entra na ficha
// com:
//   - mode:    "passive" (sempre ativa) ou "active" (jogador liga/desliga)
//   - active:  para habilidades ativas, começa SEMPRE false (off), para o
//              jogador ligar quando precisar
//   - effects: lista de efeitos mecânicos já preenchida
//   - costs:   custos de recurso (mp/hp/heroic) já preenchidos, se houver
//
// ---------------------------------------------------------------------------
// REFERÊNCIA — ESTRUTURA DE UM EFEITO
// ---------------------------------------------------------------------------
//
//   { type, target, value, label, enabled }
//
//   type:
//     "dice"   → +N dados de melhoria na rolagem alvo
//     "bonus"  → +N ao resultado da rolagem alvo
//     "stat"   → modifica um valor derivado (PV máx, PM máx, etc.)
//     "set"    → DEFINE um valor fixo enquanto ativo (atributo/secundário)
//     "damage" → bônus de dano (informativo, somado no painel)
//     "rd"     → redução de dano (informativo, somado no painel)
//     "info"   → condição / texto livre (exibido, sem efeito mecânico)
//
//   target (depende do type):
//     dice/bonus → "all" | "forca" | "agilidade" | "vigor" | "mente"
//                  | "percepcao" | "attack" | "defense" | "initiative"
//                  | "skill:<NomeDaHabilidade>"
//     stat       → "max_hp" | "max_mp" | "max_heroic" | "initiative"
//                  | "defense" | "deslocamento"
//     set        → "forca" | "agilidade" | "vigor" | "mente" | "percepcao"
//                  | "bloqueio" | "esquiva" | "conjuracao" | "iniciativa"
//                  | "deslocamento" | "percepcao_passiva"
//     damage/rd/info → target ignorado (use "all")
//
//   value:   número (ignorado para "info")
//   label:   texto livre / condição (opcional, mas recomendado)
//   enabled: true por padrão. Cada efeito pode ser desligado individualmente
//            pelo jogador na ficha.
//
// ---------------------------------------------------------------------------
// REFERÊNCIA — ESTRUTURA DE UM CUSTO
// ---------------------------------------------------------------------------
//
//   { resource, value, label }
//     resource: "mp" | "hp" | "heroic" | "hpTemp"
//     value:    número
//     label:    texto livre (ex: "por rodada", "ao ativar")
//
// ===========================================================================

export const SKILL_EFFECT_TEMPLATES = {
  // -------------------------------------------------------------------------
  // MODELO 1 — ALERTA (PASSIVA)
  // Habilidade sempre ativa. Demonstra efeitos de bônus em rolagem (dice),
  // bônus em valor derivado (stat) e condição informativa (info).
  // -------------------------------------------------------------------------
  alerta: {
    mode: "passive",
    active: false, // ignorado em passiva, mas mantido por consistência
    effects: [
      {
        type: "dice",
        target: "percepcao",
        value: 1,
        label: "Descobrir coisas escondidas, notar detalhes, escutar sons",
        enabled: true,
      },
      {
        type: "stat",
        target: "initiative",
        value: 4,
        label: "Avançado: +4 na Iniciativa",
        enabled: true,
      },
      {
        type: "info",
        target: "all",
        value: 0,
        label: "Avançado: +1D para perceber armadilhas e ameaças naturais",
        enabled: true,
      },
    ],
    costs: [],
  },

  // -------------------------------------------------------------------------
  // MODELO 2 — ASAS (ATIVA)
  // Habilidade que o jogador liga quando quer voar. Começa OFF (active:false).
  // Demonstra efeito de modificação de deslocamento (stat) e custo.
  // -------------------------------------------------------------------------
  asas: {
    mode: "active",
    active: false, // começa desligada — jogador ativa quando voar
    effects: [
      {
        type: "stat",
        target: "deslocamento",
        value: 2,
        label: "Voando: +2m de deslocamento",
        enabled: true,
      },
      {
        type: "info",
        target: "all",
        value: 0,
        label: "Deve concluir o movimento em solo firme (Básico)",
        enabled: true,
      },
    ],
    costs: [],
  },

  // -------------------------------------------------------------------------
  // MODELO 3 — EXEMPLO COMPLETO (ATIVA)
  // ⚠️ MODELO DE REFERÊNCIA com TODOS os tipos de efeito e um custo.
  // Use este bloco como gabarito ao criar novas habilidades no código.
  // Não corresponde a uma habilidade real do livro — é didático.
  //
  // Para criar uma nova habilidade com efeitos, copie este bloco, troque a
  // chave "_exemplo_completo" pelo id da habilidade (veja o id em
  // skillsLibrary.js) e ajuste os efeitos.
  // -------------------------------------------------------------------------
  _exemplo_completo: {
    mode: "active", // "active" (liga/desliga) ou "passive" (sempre ligada)
    active: false, // habilidades ativas SEMPRE começam off
    effects: [
      // 1) +Dados de melhoria numa rolagem
      {
        type: "dice",
        target: "attack", // todos os ataques
        value: 1,
        label: "+1D em ataques enquanto ativa",
        enabled: true,
      },
      // 2) +Bônus fixo numa rolagem
      {
        type: "bonus",
        target: "defense", // Bloqueio/Esquiva
        value: 2,
        label: "+2 na defesa",
        enabled: true,
      },
      // 3) Modificar um valor derivado (PV máximo, etc.)
      {
        type: "stat",
        target: "max_hp",
        value: 5,
        label: "+5 PV máximo enquanto ativa",
        enabled: true,
      },
      // 4) DEFINIR um valor fixo (sobrescreve enquanto ativa)
      {
        type: "set",
        target: "deslocamento",
        value: 10,
        label: "Deslocamento fixado em 10m",
        enabled: true,
      },
      // 5) Bônus de dano (informativo, somado no painel)
      {
        type: "damage",
        target: "all",
        value: 3,
        label: "+3 de dano",
        enabled: true,
      },
      // 6) Redução de dano (informativo, somado no painel)
      {
        type: "rd",
        target: "all",
        value: 2,
        label: "Reduz 2 de dano recebido",
        enabled: true,
      },
      // 7) Condição / texto livre (sem efeito mecânico, só exibido)
      {
        type: "info",
        target: "all",
        value: 0,
        label: "Brilha intensamente; inimigos cegos têm desvantagem",
        enabled: true,
      },
    ],
    costs: [
      // Custo ao ativar / manter a habilidade
      { resource: "mp", value: 2, label: "ao ativar" },
      { resource: "heroic", value: 1, label: "por rodada mantida" },
    ],
  },
};

/**
 * Retorna a configuração de efeitos/modo para uma habilidade da biblioteca,
 * ou null se ela não tiver modelo. A busca é pelo `id` da habilidade.
 *
 * Retorna SEMPRE uma cópia profunda, para que editar a habilidade na ficha
 * não altere o modelo compartilhado.
 */
export function getSkillTemplate(skillId) {
  const tpl = SKILL_EFFECT_TEMPLATES[skillId];
  if (!tpl) return null;
  return {
    mode: tpl.mode || "passive",
    // Habilidades ativas sempre começam desligadas (off).
    active: tpl.mode === "active" ? false : !!tpl.active,
    effects: (tpl.effects || []).map((e) => ({ ...e })),
    costs: (tpl.costs || []).map((c) => ({ ...c })),
  };
}
