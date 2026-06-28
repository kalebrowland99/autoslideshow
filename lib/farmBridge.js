/** Upload encoded MP4 bytes to the iMouse farm gallery ingest API. */

export async function uploadMp4ToFarm({
  farmUrl,
  jobId,
  secret,
  slot,
  file,
  filename,
  clear = false,
}) {
  const form = new FormData();
  const blob = file instanceof Blob ? file : new Blob([file], { type: "video/mp4" });
  form.append("file", blob, filename);
  form.append("slot", String(slot));
  form.append("job_id", String(jobId || ""));
  if (clear) form.append("clear", "true");

  const headers = {};
  if (secret) headers["X-Farm-Secret"] = secret;

  const base = String(farmUrl || "").replace(/\/+$/, "");
  const res = await fetch(`${base}/api/slideshow/ingest`, {
    method: "POST",
    headers,
    body: form,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Farm ingest failed (${res.status})`);
  }
  return res.json();
}

export async function notifyAutomationDone({ farmUrl, jobId, secret }) {
  const headers = {};
  if (secret) headers["X-Farm-Secret"] = secret;

  const base = String(farmUrl || "").replace(/\/+$/, "");
  const res = await fetch(
    `${base}/api/slideshow/jobs/${encodeURIComponent(jobId)}/automation-done`,
    { method: "POST", headers },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Farm automation-done failed (${res.status})`);
  }
  return res.json();
}

export function setFarmJobStatus(message) {
  if (typeof window !== "undefined") {
    window.__FARM_JOB_STATUS__ = String(message || "");
  }
}

export function markFarmJobDone() {
  if (typeof window !== "undefined") {
    window.__FARM_JOB_DONE__ = true;
  }
}

export function markFarmJobFailed(message) {
  if (typeof window !== "undefined") {
    window.__FARM_JOB_ERROR__ = String(message || "Farm automation failed");
  }
}
