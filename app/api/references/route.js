import { readdir, stat } from "fs/promises";
import { join } from "path";
import { NextResponse } from "next/server";

async function walkDir(dir, base = "") {
  let results = [];
  let entries;
  try { entries = await readdir(dir); } catch { return results; }
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const relative = base ? `${base}/${entry}` : entry;
    const s = await stat(fullPath).catch(() => null);
    if (!s) continue;
    if (s.isDirectory()) {
      results = results.concat(await walkDir(fullPath, relative));
    } else if (/\.(jpe?g|png|webp|gif)$/i.test(entry)) {
      results.push(relative);
    }
  }
  return results;
}

export async function GET() {
  const dir = join(process.cwd(), "public", "references");
  const images = await walkDir(dir);
  return NextResponse.json({ images });
}
