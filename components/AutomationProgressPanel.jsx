"use client";

import { useEffect, useRef, useState } from "react";
import GlobalJobBar from "@/components/GlobalJobBar";
import { getAutomationLogEntries, subscribeAutomationLog } from "@/lib/automationLog";

function formatLogTime(ts) {
  try {
    return new Date(ts).toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return "";
  }
}

const LEVEL_CLASS = {
  info: "text-foreground",
  success: "text-emerald-700",
  error: "text-destructive",
  warn: "text-amber-700",
};

export default function AutomationProgressPanel({ loading = false }) {
  const [, bump] = useState(0);
  const logEndRef = useRef(null);
  const entries = getAutomationLogEntries();

  useEffect(() => subscribeAutomationLog(() => bump((n) => n + 1)), []);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [entries.length]);

  return (
    <section className="mb-8 space-y-4">
      <GlobalJobBar />
      <div className="dash-card p-4 md:p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Activity log
          </h3>
          {loading ? (
            <span className="text-xs text-muted-foreground">Loading defaults…</span>
          ) : null}
        </div>
        <div className="h-52 overflow-y-auto rounded-lg border border-border/60 bg-muted/25 p-3">
          {entries.length === 0 ? (
            <p className="text-xs text-muted-foreground">Waiting for status updates…</p>
          ) : (
            <ul className="space-y-1.5 font-mono text-[11px] leading-relaxed">
              {entries.map((entry) => (
                <li key={entry.id} className={LEVEL_CLASS[entry.level] || LEVEL_CLASS.info}>
                  <span className="mr-2 tabular-nums text-muted-foreground">
                    {formatLogTime(entry.ts)}
                  </span>
                  {entry.message}
                </li>
              ))}
            </ul>
          )}
          <div ref={logEndRef} />
        </div>
      </div>
    </section>
  );
}
