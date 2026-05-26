import { useEffect, useState } from "react";
import { DiceTray } from "./Die3D.jsx";
import { shouldHideRollDetails, shouldMaskRollTotal } from "../lib/dice.js";

/**
 * Overlay que aparece sobre o popover quando uma rolagem chega (remota
 * ou local). Mostra os dados rolando + resultado, com auto-dismiss.
 */
export function LiveRollOverlay({ roll, viewer, durationMs = 5000, onDismiss }) {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (!roll) return;
    setShown(true);
    const t = setTimeout(() => {
      setShown(false);
      const t2 = setTimeout(() => onDismiss?.(), 250);
      return () => clearTimeout(t2);
    }, durationMs);
    return () => clearTimeout(t);
  }, [roll, durationMs, onDismiss]);

  if (!roll) return null;

  const hideDetails = shouldHideRollDetails(roll, viewer);
  const maskTotal = shouldMaskRollTotal(roll, viewer);

  // Quando o total está mascarado para o observador, criamos uma versão
  // "cega" da rolagem para o DiceTray, com valores aleatórios — apenas
  // visualmente. O resultado real nunca é exibido para esse observador.
  const maskedDice = maskTotal
    ? {
        ...roll,
        allRolls: (roll.allRolls || []).map(() => Math.ceil(Math.random() * 6)),
        kept: [Math.ceil(Math.random() * 6), Math.ceil(Math.random() * 6)],
        dropped: (roll.dropped || []).map(() => Math.ceil(Math.random() * 6)),
      }
    : roll;

  const outcomeClass = maskTotal
    ? ""
    : roll.isCritSuccess
    ? "crit-success"
    : roll.isCritFail
    ? "crit-fail"
    : "";

  return (
    <div
      className={"live-roll-overlay " + (shown ? "shown" : "hidden")}
      onClick={() => onDismiss?.()}
      role="dialog"
      aria-live="polite"
    >
      <div className="live-roll-card" onClick={(e) => e.stopPropagation()}>
        <div className="live-roll-header">
          <div className="live-roll-author">
            {roll.hidden && "🕶 "}
            {roll.characterName || "Mesa"}
          </div>
          <div className="live-roll-label">{roll.label || "Rolagem"}</div>
        </div>

        <DiceTray result={maskedDice} size={56} />

        {!hideDetails && (
          <div className="live-roll-formula">
            {roll.dropped && roll.dropped.length > 0 ? (
              <>
                <span>[{roll.kept.join(", ")}]</span>{" "}
                <span className="muted">(desc.: {roll.dropped.join(", ")})</span>{" "}
              </>
            ) : (
              <span>[{roll.kept.join(", ")}]</span>
            )}
            <span>= {roll.diceSum}</span>
            {roll.attribute ? (
              <span>
                {" "}
                + atrib. {roll.attribute >= 0 ? "+" : ""}
                {roll.attribute}
              </span>
            ) : null}
            {roll.bonus ? (
              <span>
                {" "}
                + bônus {roll.bonus >= 0 ? "+" : ""}
                {roll.bonus}
              </span>
            ) : null}
          </div>
        )}

        <div className={"live-roll-total " + outcomeClass}>
          <div className="live-roll-num">
            {maskTotal ? "???" : roll.total}
          </div>
          {!maskTotal && roll.isCritSuccess && (
            <div className="live-roll-tag crit-success">
              ✦ SUCESSO CRÍTICO ✦
            </div>
          )}
          {!maskTotal && roll.isCritFail && (
            <div className="live-roll-tag crit-fail">✗ FALHA CRÍTICA ✗</div>
          )}
          {!maskTotal &&
            !roll.isCritSuccess &&
            !roll.isCritFail &&
            roll.difficulty != null && (
              <div
                className={
                  "live-roll-tag " +
                  (roll.outcome === "success" ? "ok" : "ko")
                }
              >
                {roll.outcome === "success"
                  ? `✓ vs ${roll.difficulty}`
                  : `✗ vs ${roll.difficulty}`}
              </div>
            )}
        </div>

        <button className="live-roll-close" onClick={() => onDismiss?.()}>
          fechar
        </button>
      </div>
    </div>
  );
}
