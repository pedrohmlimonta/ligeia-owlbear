// ===========================================================================
// Encode/decode da rolagem na URL do popover de overlay
//
// O Owlbear não passa props para popovers — só URL. Para enviar a rolagem
// à janela /roll-overlay.html, serializamos como JSON → base64url e
// colocamos no hash da URL (não no query para que não invalide cache).
// ===========================================================================

function toBase64Url(str) {
  // unicode-safe
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(b64) {
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  const norm = b64.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const bin = atob(norm);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/** Devolve a URL relativa para abrir o overlay com `roll` embutido. */
export function buildRollOverlayUrl(roll) {
  const base = new URL("roll-overlay.html", window.location.href).toString();
  if (!roll) return base;
  try {
    const payload = toBase64Url(JSON.stringify(roll));
    return `${base}#r=${payload}`;
  } catch {
    return base;
  }
}

/** No carregamento de roll-overlay.html, devolve a rolagem ou null. */
export function initialRollFromUrl() {
  const hash = window.location.hash || "";
  const m = hash.match(/r=([^&]+)/);
  if (!m) return null;
  try {
    return JSON.parse(fromBase64Url(m[1]));
  } catch {
    return null;
  }
}
