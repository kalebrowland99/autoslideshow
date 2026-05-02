/**
 * Downloads the Freiburg Groceries tarball and copies all 25 class folders into public/freiburg/.
 * @see https://github.com/PhilJd/freiburg_groceries_dataset
 */
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import { FREIBURG_ALL_CLASSES } from "../lib/freiburgGroceriesClasses.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = join(__dirname, "..");
const CACHE = join(ROOT, ".cache", "freiburg");
const TGZ = join(CACHE, "freiburg_groceries_dataset.tar.gz");
const UNPACK = join(CACHE, "unpack");
const PUB = join(ROOT, "public", "freiburg");

const DATASET_URL =
  "http://aisdatasets.informatik.uni-freiburg.de/freiburg_groceries_dataset/freiburg_groceries_dataset.tar.gz";

function sh(cmd) {
  execSync(cmd, { stdio: "inherit", cwd: ROOT });
}

mkdirSync(CACHE, { recursive: true });

if (!existsSync(TGZ) || statSync(TGZ).size < 1_000_000) {
  console.log("Downloading Freiburg Groceries dataset (tar.gz)…");
  sh(`curl -fL "${DATASET_URL}" -o "${TGZ}"`);
}

rmSync(UNPACK, { recursive: true, force: true });
mkdirSync(UNPACK, { recursive: true });

const members = FREIBURG_ALL_CLASSES.map((c) => `images/${c}`).join(" ");
console.log("Extracting all class image folders from archive…");
sh(`tar -xzf "${TGZ}" -C "${UNPACK}" ${members}`);

let imagesRoot = join(UNPACK, "images");
if (!existsSync(imagesRoot)) {
  const top = readdirSync(UNPACK).filter((n) => !n.startsWith("."));
  const guess = top.length === 1 ? join(UNPACK, top[0], "images") : null;
  if (guess && existsSync(guess)) imagesRoot = guess;
}
if (!existsSync(imagesRoot)) {
  console.error("Could not find images/ inside tarball — layout may have changed.");
  process.exit(1);
}

rmSync(PUB, { recursive: true, force: true });
mkdirSync(PUB, { recursive: true });

for (const cls of FREIBURG_ALL_CLASSES) {
  const src = join(imagesRoot, cls);
  const dest = join(PUB, cls);
  if (!existsSync(src)) {
    console.warn("Missing class folder:", src);
    continue;
  }
  mkdirSync(dest, { recursive: true });
  for (const f of readdirSync(src)) {
    if (!/\.(png|jpe?g)$/i.test(f)) continue;
    cpSync(join(src, f), join(dest, f));
  }
}

let n = 0;
for (const cls of FREIBURG_ALL_CLASSES) {
  const d = join(PUB, cls);
  if (!existsSync(d)) continue;
  n += readdirSync(d).filter((f) => /\.(png|jpe?g)$/i.test(f)).length;
}

console.log(`Done. Copied ${n} images into public/freiburg/ (${FREIBURG_ALL_CLASSES.length} classes).`);
