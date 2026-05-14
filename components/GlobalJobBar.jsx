"use client";

import { useEffect, useState } from "react";
import { getGlobalJob, jobControls, readJobHeartbeat, subscribeGlobalJob } from "@/lib/globalJobProgress";

export default function GlobalJobBar() {
  const [, bump] = useState(0);
  const [reloadNotice, setReloadNotice] = useState(null);

  useEffect(() => subscribeGlobalJob(() => bump((n) => n + 1)), []);

  useEffect(() => {
    const hb = readJobHeartbeat();
    if (!hb) return;
    const age = Date.now() - hb.ts;
    if (age > 0 && age < 6 * 60 * 1000 && hb.percent > 2 && hb.percent < 98) {
      setReloadNotice(
        "A long job was interrupted when this tab reloaded. Video encoding only runs in the browser — start Export or Generate again from the left panel."
      );
    }
  }, []);

  const j = getGlobalJob();

  if (!j && !reloadNotice) return null;

  return (
    <div className="shrink-0 border-b border-white/10 bg-zinc-950/95 backdrop-blur-sm z-[60]">
      {reloadNotice ? (
        <div className="flex items-start justify-between gap-3 border-b border-amber-500/25 bg-amber-500/10 px-4 py-2">
          <p className="text-[11px] leading-snug text-amber-100/95">{reloadNotice}</p>
          <button
            type="button"
            onClick={() => {
              setReloadNotice(null);
            }}
            className="shrink-0 rounded-md bg-amber-500/20 px-2 py-1 text-[10px] font-semibold text-amber-100 hover:bg-amber-500/30"
          >
            Dismiss
          </button>
        </div>
      ) : null}
      {j ? (
        <div className="flex flex-wrap items-center gap-3 px-4 py-2">
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-center justify-between gap-2 text-[10px] text-white/50">
              <span className="truncate font-medium uppercase tracking-wide text-white/45">
                {j.paused ? "Paused" : "In progress"}
              </span>
              <span className="tabular-nums text-violet-300">{Math.round(j.percent)}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
              <div
                className={`h-full rounded-full transition-all duration-300 ${j.paused ? "bg-amber-500/80" : "bg-violet-500"}`}
                style={{ width: `${Math.min(100, Math.max(0, j.percent))}%` }}
              />
            </div>
            <p className="truncate text-[11px] text-white/65" title={j.phase}>
              {j.phase}
            </p>
            {j.hint ? (
              <p className="text-[10px] leading-snug text-white/35">{j.hint}</p>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-1.5">
            {j.paused ? (
              <button
                type="button"
                onClick={() => jobControls.resume()}
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-emerald-500"
              >
                Continue
              </button>
            ) : (
              <button
                type="button"
                onClick={() => jobControls.pause()}
                className="rounded-lg bg-white/10 px-3 py-1.5 text-[11px] font-semibold text-white/90 hover:bg-white/15"
              >
                Pause
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                jobControls.stop();
              }}
              className="rounded-lg bg-red-600/90 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-red-500"
            >
              Stop
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
