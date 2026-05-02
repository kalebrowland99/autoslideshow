/** Labely score 0–100 and rating labels (must match API / prompts). */

export function clampLabelyScore(score) {
  const n = Number(score);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function ratingLabelFromScore(score) {
  const s = clampLabelyScore(score);
  if (s <= 20) return "Avoid";
  if (s <= 45) return "Limit";
  if (s <= 60) return "Okay Occasionally";
  if (s <= 80) return "Good";
  return "Great";
}
