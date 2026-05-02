import { readFileSync } from "fs";
import { NextResponse } from "next/server";
import { FREIBURG_ALL_CLASSES, isFreiburgCategoryId } from "@/lib/freiburgGroceriesClasses";
import { listCachedFreiburgImageAbsPaths } from "@/lib/freiburgGroceriesPublicPaths";

function mimeForPath(absPath) {
  const lower = absPath.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

export async function GET(request) {
  const raw = request.nextUrl.searchParams.get("category")?.trim() || "";
  const category = raw ? raw.toUpperCase().replace(/\s+/g, "_") : "";

  if (category && !isFreiburgCategoryId(category)) {
    return NextResponse.json(
      {
        error: `Unknown category "${raw}". Use one of: ${FREIBURG_ALL_CLASSES.join(", ")}`,
      },
      { status: 400 }
    );
  }

  const paths = listCachedFreiburgImageAbsPaths(process.cwd(), category || null);
  if (paths.length === 0) {
    const hint = category
      ? `No images found for ${category} under public/freiburg/${category}/. Run: npm run cache:freiburg-junk`
      : "No Freiburg images in public/freiburg/. Run: npm run cache:freiburg-junk (see public/freiburg/README.txt).";
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
