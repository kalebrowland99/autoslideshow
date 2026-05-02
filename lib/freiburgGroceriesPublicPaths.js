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

function collectClass(cwd, cls, acc) {
  const cacheRoot = join(cwd, "public", "freiburg");
  const embedRoot = join(cwd, "public", "freiburg-embed");
  walkPngs(join(cacheRoot, cls), acc);
  walkPngs(join(embedRoot, cls), acc);
}

/**
 * Absolute paths to Freiburg images: full optional cache `public/freiburg/<CLASS>/`
 * plus committed production subset `public/freiburg-embed/<CLASS>/`.
 *
 * @param {string | null | undefined} category — one of FREIBURG_ALL_CLASSES, or falsy for all classes
 */
export function listCachedFreiburgImageAbsPaths(cwd = process.cwd(), category = null) {
  const acc = [];
  const cat = typeof category === "string" && FREIBURG_ALL_CLASSES.includes(category) ? category : null;
  if (cat) {
    collectClass(cwd, cat, acc);
    return acc;
  }
  for (const cls of FREIBURG_ALL_CLASSES) {
    collectClass(cwd, cls, acc);
  }
  return acc;
}
