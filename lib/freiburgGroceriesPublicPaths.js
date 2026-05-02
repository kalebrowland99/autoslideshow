import { existsSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { FREIBURG_JUNK_CLASSES } from "@/lib/freiburgGroceriesJunk";

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
 * Absolute paths to cached Freiburg junk-class images under `public/freiburg/`.
 * Run `npm run cache:freiburg-junk` once to populate.
 */
export function listCachedFreiburgJunkImageAbsPaths(cwd = process.cwd()) {
  const root = join(cwd, "public", "freiburg");
  const acc = [];
  for (const cls of FREIBURG_JUNK_CLASSES) {
    walkPngs(join(root, cls), acc);
  }
  return acc;
}
