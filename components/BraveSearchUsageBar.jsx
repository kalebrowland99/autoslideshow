"use client";

import { useCallback, useEffect, useState } from "react";

export const BRAVE_USAGE_UPDATED_EVENT = "brave-usage-updated";

/** @param {{ configured: boolean, used: number, limit: number, remaining: number, month: string } | null | undefined} detail */
export function dispatchBraveUsageUpdated(detail) {
  if (typeof window === "undefined" || !detail?.configured) return;
  window.dispatchEvent(new CustomEvent(BRAVE_USAGE_UPDATED_EVENT, { detail }));
}

/**
 * @param {{ enabled?: boolean, compact?: boolean, className?: string }} props
 */
export default function BraveSearchUsageBar({ enabled = true, compact = false, className = "" }) {
  const [usage, setUsage] = useState(null);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setUsage(null);
      return;
    }
    try {
      const res = await fetch("/api/brave-usage", { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (body?.configured) setUsage(body);
      else setUsage(null);
    } catch {
      setUsage(null);
    }
  }, [enabled]);

  useEffect(() => {
    refresh();
    if (!enabled) return undefined;
    const onUpdate = (e) => {
      if (e?.detail?.configured) setUsage(e.detail);
      else refresh();
    };
    window.addEventListener(BRAVE_USAGE_UPDATED_EVENT, onUpdate);
    return () => window.removeEventListener(BRAVE_USAGE_UPDATED_EVENT, onUpdate);
  }, [enabled, refresh]);

  if (!enabled || !usage?.configured) return null;

  const used = Math.max(0, Number(usage.used) || 0);
  const limit = Math.max(1, Number(usage.limit) || 1000);
  const remaining = Math.max(0, Number(usage.remaining) ?? limit - used);
  const pct = Math.min(100, (used / limit) * 100);
  const warn = remaining <= Math.max(50, limit * 0.1);
  const barColor = warn ? "bg-amber-500" : "bg-sky-500";

  return (
    <div
      className={`rounded-lg border border-sky-500/25 bg-sky-500/8 px-3 py-2 ${className}`}
      title="Brave Image Search API usage this month (free tier ≈ 1,000 searches)"
    >
      <div className="flex items-center justify-between gap-2 text-[10px]">
        <span className="font-semibold uppercase tracking-wide text-sky-200/90">
          Brave searches
        </span>
        <span className={`tabular-nums font-medium ${warn ? "text-amber-200" : "text-sky-100/80"}`}>
          {remaining.toLocaleString()} left
          {!compact ? ` · ${used.toLocaleString()} / ${limit.toLocaleString()} used` : null}
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-black/30">
        <div
          className={`h-full rounded-full transition-all duration-300 ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {!compact ? (
        <p className="mt-1 text-[9px] leading-snug text-white/35">
          Resets monthly · override limit with BRAVE_SEARCH_MONTHLY_LIMIT
        </p>
      ) : null}
    </div>
  );
}
