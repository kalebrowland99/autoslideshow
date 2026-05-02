import { readFileSync } from "fs";
import { NextResponse } from "next/server";
import { listCachedFreiburgJunkImageAbsPaths } from "@/lib/freiburgGroceriesPublicPaths";

function mimeForPath(absPath) {
  const lower = absPath.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

export async function GET() {
  const paths = listCachedFreiburgJunkImageAbsPaths();
  if (paths.length === 0) {
    return NextResponse.json(
      {
        error:
          "No Freiburg junk-class images in public/freiburg/. Run: npm run cache:freiburg-junk (see public/freiburg/README.txt).",
      },
      { status: 404 }
    );
  }

  const abs = paths[Math.floor(Math.random() * paths.length)];
  const buf = readFileSync(abs);
  const mime = mimeForPath(abs);
  const b64 = buf.toString("base64");

  return NextResponse.json({
    imageDataUrl: `data:${mime};base64,${b64}`,
    source: "freiburg_groceries_dataset",
  });
}
