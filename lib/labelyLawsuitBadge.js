/**
 * Deterministic lawsuit badge for Labely UI — stable per seed (export / rerenders).
 * n ∈ {0…25} → "(n) Lawsuit Found"
 */
export function getLabelyLawsuitBadgeLabel(seedString) {
  const s = String(seedString ?? "");
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
  const n = Math.abs(h) % 26;
  return `(${n}) Lawsuit Found`;
}
