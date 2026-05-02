/**
 * Rebuild public/freiburg-embed/ (1 PNG per class) from a local full cache in public/freiburg/.
 * Run after `npm run cache:freiburg-junk` when you want to refresh the production subset.
 */
import { cpSync, mkdirSync, existsSync, readdirSync, rmSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import { FREIBURG_ALL_CLASSES } from "../lib/freiburgGroceriesClasses.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = join(__dirname, "..");
const SRC = join(ROOT, "public", "freiburg");
const DST = join(ROOT, "public", "freiburg-embed");

rmSync(DST, { recursive: true, force: true });

for (const c of FREIBURG_ALL_CLASSES) {
  const sd = join(SRC, c);
  if (!existsSync(sd)) {
    console.error("Missing full cache folder:", sd, "— run npm run cache:freiburg-junk first.");
    process.exit(1);
  }
  const files = readdirSync(sd).filter((f) => /\.png$/i.test(f)).sort();
  if (!files.length) {
    console.error("No PNGs in", sd);
    process.exit(1);
  }
  const pick = files[0];
  mkdirSync(join(DST, c), { recursive: true });
  cpSync(join(sd, pick), join(DST, c, pick));
  console.log(c, pick);
}
console.log("Wrote public/freiburg-embed/");
