"use client";

import { useCallback, useMemo, useState, Fragment } from "react";

function clampScore(score) {
  const n = Number(score);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** Score dot + default verdict label */
function scoreTheme(score) {
  const s = clampScore(score);
  if (s <= 20) return { dot: "bg-[#E54D42]", verdict: "Avoid" };
  if (s <= 60) return { dot: "bg-[#FFB01A]", verdict: "Limit" };
  return { dot: "bg-[#34C759]", verdict: "Good" };
}

function ShareIcon({ className }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M12 3v10"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M8.5 6.5 12 3l3.5 3.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SaveBookmarkIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M7 3h10a2 2 0 012 2v16l-7-4-7 4V5a2 2 0 012-2z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Renders `**bold**` in analysis text (same convention as LabelySlide). */
function AnalysisSummary({ text, className }) {
  const parts = useMemo(() => {
    const t = text || "";
    const out = [];
    const re = /\*\*([^*]+)\*\*/g;
    let last = 0;
    let m;
    while ((m = re.exec(t)) !== null) {
      if (m.index > last) out.push({ bold: false, s: t.slice(last, m.index) });
      out.push({ bold: true, s: m[1] });
      last = m.index + m[0].length;
    }
    if (last < t.length) out.push({ bold: false, s: t.slice(last) });
    return out.length ? out : [{ bold: false, s: t }];
  }, [text]);

  return (
    <p className={className}>
      {parts.map((p, i) =>
        p.bold ? (
          <strong key={i} className="font-bold text-[#1A1A1A]">
            {p.s}
          </strong>
        ) : (
          <Fragment key={i}>{p.s}</Fragment>
        )
      )}
    </p>
  );
}

const emptyLabely = {
  name: "",
  brand: "",
  score: 0,
  verdict: "Limit",
  analysis: "",
  imageDataUrl: null,
};

/**
 * @param {{ fillViewport?: boolean }} props
 * fillViewport: true for standalone /labely (full viewport height); false when embedded in the main app layout.
 */
export default function LabelyView({ fillViewport = true }) {
  const [data, setData] = useState(emptyLabely);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const theme = useMemo(() => scoreTheme(data?.score ?? 0), [data?.score]);

  const analyzeDataUrl = useCallback(async (imageDataUrl) => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/labely", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageDataUrl }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Analysis failed");
      setData((prev) => ({
        ...prev,
        ...json,
        imageDataUrl: imageDataUrl || prev.imageDataUrl,
      }));
    } catch (e) {
      console.error("[labely] analyze failed", e);
      setError(e?.message || "Could not analyze image.");
    } finally {
      setBusy(false);
    }
  }, []);

  const onPickFile = useCallback(
    (e) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file?.type?.startsWith("image/")) return;
      const r = new FileReader();
      r.onload = () => {
        const url = typeof r.result === "string" ? r.result : "";
        if (url) analyzeDataUrl(url);
      };
      r.readAsDataURL(file);
    },
    [analyzeDataUrl]
  );

  const shell = fillViewport
    ? "min-h-screen flex items-center justify-center bg-[#F9F9F9] px-[22px] py-10 text-[#1A1A1A]"
    : "flex min-h-full w-full items-center justify-center bg-[#F9F9F9] px-[22px] py-10 text-[#1A1A1A]";

  return (
    <div className={shell}>
      <div className="w-full max-w-[420px]">
        <div className="mb-14 rounded-xl border border-dashed border-[#C9E8DE] bg-white/80 px-4 py-3">
          <label className="block text-[11px] font-semibold text-[#3D5C4E] mb-2">
            Upload a product photo
          </label>
          <input
            type="file"
            accept="image/*"
            disabled={busy}
            onChange={onPickFile}
            className="w-full text-[11px] text-[#5C5C5C] file:mr-2 file:rounded-lg file:border-0 file:bg-[#EEF4F0] file:px-3 file:py-2 file:text-[12px] file:font-semibold file:text-[#3D5C4E]"
          />
          {busy ? <p className="mt-2 text-[11px] text-[#6B9080]">Analyzing packaging…</p> : null}
          {error ? <p className="mt-2 text-[11px] text-red-600">{error}</p> : null}
        </div>

        <div className="flex items-start gap-4">
          <div className="h-[118px] w-[118px] shrink-0 overflow-hidden rounded-2xl bg-black shadow-[0_6px_16px_rgba(0,0,0,0.12)]">
            {data?.imageDataUrl ? (
              <img
                src={data.imageDataUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="h-full w-full bg-gradient-to-br from-zinc-800 to-black" />
            )}
          </div>

          <div className="relative min-w-0 flex-1 pr-[6.5rem] pt-0.5">
            <button
              type="button"
              className="absolute bottom-0 right-0 top-auto flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-[#DCDCE0] bg-[#EFEFEF] px-3.5"
              aria-label="Share"
            >
              <span className="whitespace-nowrap text-[12px] font-semibold tracking-[0.08em] text-[#5C5C5C]">
                SHARE
              </span>
              <ShareIcon className="h-5 w-5 text-[#5C5C5C]" />
            </button>
            <h1 className="truncate text-[22px] font-bold leading-snug tracking-tight text-[#1A1A1A]">
              {data?.name || "Product name"}
            </h1>
            {(data?.brand ?? "").trim() ? (
              <p className="mt-1.5 truncate text-[16px] font-normal tracking-wide text-[#8E8E93]">
                {data?.brand}
              </p>
            ) : null}

            <div className="mt-4 flex max-w-full items-start gap-1">
              <span
                className={`mt-[0.28em] h-3 w-3 shrink-0 rounded-full ${theme.dot}`}
                aria-hidden="true"
              />
              <div className="flex min-w-0 flex-col gap-px leading-none">
                <span className="text-[20px] font-semibold tabular-nums tracking-tight text-[#1A1A1A]">
                  {clampScore(data?.score ?? 0)}/100
                </span>
                <span className="text-[12px] font-normal leading-none text-[#8E8E93]">
                  {data?.verdict ?? theme.verdict}
                </span>
              </div>
            </div>
          </div>
        </div>

        <button
          type="button"
          disabled
          className="mt-[22px] flex h-11 w-full cursor-default items-center justify-center gap-2 rounded-full border-2 border-[#6B9080] bg-[#EEF4F0] px-4 text-[15px] font-bold tracking-wide text-[#3D5C4E] opacity-90"
        >
          <span>Add to Pantry</span>
          <SaveBookmarkIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
        </button>

        <div className="mt-6 rounded-[20px] border border-[#C9E8DE] bg-white p-[22px] shadow-[0_4px_28px_rgba(122,195,170,0.28)]">
          <div className="flex justify-center">
            <div
              className="text-center text-[32px] font-black leading-[0.95] tracking-tight text-[#7B4F2E]"
              style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
            >
              labely
            </div>
          </div>

          {data?.analysis?.trim() ? (
            <AnalysisSummary
              text={data.analysis}
              className="mt-4 text-[16px] leading-[1.5] text-[#3C3C43]"
            />
          ) : (
            <p className="mt-4 text-[16px] leading-[1.5] text-[#3C3C43]">
              Upload a clear photo of the front label of a packaged food or drink. Labely will read the pack and write a
              health-style summary like the in-app card.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
