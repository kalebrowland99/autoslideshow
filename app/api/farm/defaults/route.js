import { getFarmDefaults } from "@/lib/farmDefaults";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const brand = searchParams.get("brand") || "labely";
  return Response.json(getFarmDefaults(brand));
}
