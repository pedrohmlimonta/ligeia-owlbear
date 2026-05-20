import { useEffect, useState } from "react";

// Rotações finais para cada face do d6 (1..6 visível)
const FACE_ROTATIONS = {
  1: { x: 0, y: 0 },
  2: { x: -90, y: 0 },
  3: { x: 0, y: -90 },
  4: { x: 0, y: 90 },
  5: { x: 90, y: 0 },
  6: { x: 180, y: 0 },
};

/**
 * Dado 3D individual. Recebe `value` (1..6) e anima rolando até pousar
 * mostrando essa face.
 *
 * Props:
 *   - value: valor final do dado (1..6)
 *   - kept: se este dado conta para o resultado (cor dourada). Caso contrário, esmaecido.
 *   - size: tamanho do cubo em pixels (default 60)
 *   - delay: atraso em ms antes de começar a rolar
 */
export function Die3D({ value, kept = true, size = 60, delay = 0 }) {
  const [rolling, setRolling] = useState(true);

  useEffect(() => {
    setRolling(true);
    const t = setTimeout(() => setRolling(false), 900 + delay);
    return () => clearTimeout(t);
  }, [value, delay]);

  const rot = FACE_ROTATIONS[value] || { x: 0, y: 0 };
  const finalTransform = `rotateX(${rot.x}deg) rotateY(${rot.y}deg)`;

  // Estilos do cubo
  const cubeStyle = {
    width: size,
    height: size,
    transformStyle: "preserve-3d",
    position: "relative",
    transition: rolling
      ? "transform 0.9s cubic-bezier(.22, 1, .36, 1)"
      : "transform 0.4s ease",
    transform: rolling
      ? `rotateX(${720 + rot.x}deg) rotateY(${1080 + rot.y}deg)`
      : finalTransform,
    transitionDelay: `${delay}ms`,
  };

  // Estilos compartilhados das faces
  const faceBase = {
    position: "absolute",
    width: size,
    height: size,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "var(--font-display)",
    fontSize: size * 0.45,
    fontWeight: 700,
    color: kept ? "#f3e3b9" : "#7a6b54",
    background: kept
      ? "linear-gradient(145deg, #2a1f15, #1a1410)"
      : "linear-gradient(145deg, #1a1410, #0d0907)",
    border: `2px solid ${kept ? "var(--gold)" : "var(--border)"}`,
    boxShadow: kept
      ? "inset 0 0 12px rgba(212, 166, 73, 0.2), 0 0 8px rgba(212, 166, 73, 0.3)"
      : "inset 0 0 8px rgba(0, 0, 0, 0.5)",
    borderRadius: "4px",
    backfaceVisibility: "hidden",
  };

  const half = size / 2;
  return (
    <div
      style={{
        perspective: 600,
        display: "inline-block",
        margin: "0.25rem",
      }}
    >
      <div style={cubeStyle}>
        {/* Face 1 (frente) */}
        <div style={{ ...faceBase, transform: `translateZ(${half}px)` }}>1</div>
        {/* Face 6 (trás) */}
        <div style={{ ...faceBase, transform: `rotateY(180deg) translateZ(${half}px)` }}>
          6
        </div>
        {/* Face 4 (direita) */}
        <div style={{ ...faceBase, transform: `rotateY(90deg) translateZ(${half}px)` }}>
          4
        </div>
        {/* Face 3 (esquerda) */}
        <div style={{ ...faceBase, transform: `rotateY(-90deg) translateZ(${half}px)` }}>
          3
        </div>
        {/* Face 2 (topo) */}
        <div style={{ ...faceBase, transform: `rotateX(90deg) translateZ(${half}px)` }}>
          2
        </div>
        {/* Face 5 (base) */}
        <div style={{ ...faceBase, transform: `rotateX(-90deg) translateZ(${half}px)` }}>
          5
        </div>
      </div>
    </div>
  );
}

/**
 * Conjunto de dados rolados, com indicação de quais "contam" e quais
 * foram descartados (regra dos dados de melhoria).
 */
export function DiceTray({ result, size = 60 }) {
  if (!result) return null;

  // result.allRolls está em ordem de rolagem; precisamos marcar quais
  // valores estão entre os 2 maiores (mantidos) e quais foram descartados.
  const keepCounts = {};
  result.kept.forEach((v) => {
    keepCounts[v] = (keepCounts[v] || 0) + 1;
  });

  // Para cada dado da rolagem, decidir se ele "conta"
  // (consumimos o slot de keepCounts conforme encontramos)
  const remaining = { ...keepCounts };
  const flags = result.allRolls.map((v) => {
    if ((remaining[v] || 0) > 0) {
      remaining[v]--;
      return true;
    }
    return false;
  });

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "center",
        padding: "1rem",
        background: "radial-gradient(ellipse at center, #1a1410 0%, #0a0705 100%)",
        borderRadius: "8px",
        border: "1px solid var(--border)",
        minHeight: size + 32,
      }}
    >
      {result.allRolls.map((v, i) => (
        <Die3D key={i} value={v} kept={flags[i]} size={size} delay={i * 80} />
      ))}
    </div>
  );
}
