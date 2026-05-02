import { readFileSync } from "fs";
import { NextResponse } from "next/server";
import { FREIBURG_ALL_CLASSES, normalizeFreiburgCategoryParam } from "@/lib/freiburgGroceriesClasses";
import { listCachedFreiburgImageAbsPaths } from "@/lib/freiburgGroceriesPublicPaths";

function mimeForPath(absPath) {
  const lower = absPath.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

export async function GET(request) {
  const raw = request.nextUrl.searchParams.get("category")?.trim() || "";
  const category = normalizeFreiburgCategoryParam(raw);

  if (raw && !category) {
    return NextResponse.json(
      {
        error: `Unknown category "${raw}". Use one of: ${FREIBURG_ALL_CLASSES.join(", ")}`,
      },
      { status: 400 }
    );
  }

  const cwd = process.cwd();
  const allCached = listCachedFreiburgImageAbsPaths(cwd, null);
  const paths = listCachedFreiburgImageAbsPaths(cwd, category || null);

  if (paths.length === 0) {
    if (allCached.length === 0) {
      const hint =
        "No Freiburg images found (expected public/freiburg-embed/ in production or public/freiburg/ after npm run cache:freiburg-junk).";
      return NextResponse.json({ error: hint }, { status: 404 });
    }
    const hint = category
      ? `No images for category ${category}. Pick another category or “Any class”, or add files under public/freiburg/${category}/ locally.`
      : "No Freiburg images matched this request.";
    return NextResponse.json({ error: hint }, { status: 404 });
  }

  const abs = paths[Math.floor(Math.random() * paths.length)];
  const buf = readFileSync(abs);
  const mime = mimeForPath(abs);
  const b64 = buf.toString("base64");

  return NextResponse.json({
    imageDataUrl: `data:${mime};base64,${b64}`,
    source: "freiburg_groceries_dataset",
    category: category || null,
  });
}
