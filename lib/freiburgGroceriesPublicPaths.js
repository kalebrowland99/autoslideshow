import { existsSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { FREIBURG_ALL_CLASSES } from "@/lib/freiburgGroceriesClasses";

const IMG_RE = /\.(png|jpe?g)$/i;

function walkPngs(dir, acc) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    if (name.startsWith(".")) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walkPngs(p, acc);
    else if (IMG_RE.test(name)) acc.push(p);
  }
}

/**
 * Absolute paths to cached Freiburg images under `public/freiburg/<CLASS>/`.
 * @param {string | null | undefined} category — one of FREIBURG_ALL_CLASSES, or falsy for all cached classes
 */
export function listCachedFreiburgImageAbsPaths(cwd = process.cwd(), category = null) {
  const root = join(cwd, "public", "freiburg");
  const acc = [];
  const cat = typeof category === "string" && FREIBURG_ALL_CLASSES.includes(category) ? category : null;
  if (cat) {
    walkPngs(join(root, cat), acc);
    return acc;
  }
  for (const cls of FREIBURG_ALL_CLASSES) {
    walkPngs(join(root, cls), acc);
  }
  return acc;
}
