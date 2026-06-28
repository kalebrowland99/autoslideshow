import { getFarmDefaults } from "@/lib/farmDefaults";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const brand = searchParams.get("brand") || "labely";
  const jobId = searchParams.get("jobId") || searchParams.get("job_id") || "";
  return Response.json(getFarmDefaults(brand, { jobId }));
}
