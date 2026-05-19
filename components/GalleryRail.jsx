"use client";

import { useMemo, useRef, useState } from "react";

const COMPACT_THRESHOLD = 20;

/** First usable preview URL for a saved show. */
function galleryThumbUrl(show) {
  const ps = String(show?.previewScreenshot || "").trim();
  if (ps) return ps;
  const slots = Array.isArray(show?.slots) ? show.slots : [];
  for (const s of slots) {
    const u = String(s?.imageUrl || "").trim();
    if (u) return u;
  }
  return null;
}

/**
 * Right-rail gallery: stays within viewport height; compact rows for large batches;
 * jump-to-index for 120+ slideshows.
 *
 * @param {{ show: object, origIdx: number }[]} entries — shows for the current app only; `origIdx` indexes the full `savedSlideshows` array in parent state.
 */
export default function GalleryRail({ entries, activeShowIdx, loadShow }) {
  const scrollRef = useRef(null);
  const [jump, setJump] = useState("");
  const compact = entries.length > COMPACT_THRESHOLD;

  const counts = useMemo(() => {
    let withThumb = 0;
    for (const { show } of entries) {
      if (galleryThumbUrl(show)) withThumb += 1;
    }
    return { withThumb, total: entries.length };
  }, [entries]);

  const runJump = () => {
    const n = Number.parseInt(String(jump).trim(), 10);
    if (!Number.isFinite(n) || n < 1 || n > entries.length) return;
    const el = document.querySelector(`[data-gallery-idx="${n - 1}"]`);
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    setJump("");
  };

  return (
    <aside className="flex w-[260px] shrink-0 flex-col border-l border-white/10 bg-[#0a0a0a] min-h-0">
      <div className="flex min-h-0 flex-1 flex-col p-3">
        <div className="mb-2 flex shrink-0 items-center justify-between gap-2 border-b border-white/10 pb-2">
          <span className="text-white/50 text-[11px] font-semibold uppercase tracking-wider">
            Slideshows
          </span>
          <span className="text-violet-400 text-[11px] font-semibold tabular-nums">
            {counts.total}
          </span>
        </div>

        {entries.length > 12 ? (
          <div className="mb-2 flex shrink-0 items-center gap-1.5">
            <label className="sr-only" htmlFor="gallery-jump">Jump to slideshow number</label>
            <input
              id="gallery-jump"
              type="number"
              min={1}
              max={entries.length}
              placeholder={`1–${entries.length}`}
              value={jump}
              onChange={(e) => setJump(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  runJump();
                }
              }}
              className="min-w-0 flex-1 rounded-lg border border-white/15 bg-black/40 px-2 py-1.5 text-[11px] text-white outline-none placeholder:text-white/25 focus:border-violet-500/60"
            />
            <button
              type="button"
              onClick={runJump}
              className="shrink-0 rounded-lg bg-violet-600 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-violet-500"
            >
              Go
            </button>
          </div>
        ) : null}

        {compact ? (
          <p className="mb-2 shrink-0 text-[10px] leading-snug text-white/35">
            Compact list ({counts.withThumb}/{counts.total} with thumbnails). Scroll stays in this column.
          </p>
        ) : null}

        <div
          ref={scrollRef}
          className={`min-h-0 flex-1 overflow-y-auto overscroll-contain pr-0.5 ${compact ? "space-y-1" : "space-y-2.5"}`}
        >
          {entries.map(({ show, origIdx }, listIdx) => {
            const thumb = galleryThumbUrl(show);
            const caption = show.captionText || `Slideshow ${listIdx + 1}`;
            const active = activeShowIdx === origIdx;

            if (compact) {
              return (
                <button
                  key={origIdx}
                  type="button"
                  data-gallery-idx={listIdx}
                  onClick={() => loadShow(show, origIdx)}
                  className={`flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition-all ${
                    active
                      ? "border-violet-500 bg-violet-500/10 ring-1 ring-violet-500/30"
                      : "border-white/10 bg-black/20 hover:border-white/25"
                  }`}
                >
                  <div className="h-10 w-10 shrink-0 overflow-hidden rounded-md bg-zinc-900 ring-1 ring-white/10">
                    {thumb ? (
                      <img src={thumb} alt="" className="h-full w-full object-cover object-center" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-[10px] font-bold text-white/20">
                        {listIdx + 1}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <span className={`text-[10px] font-semibold tabular-nums ${active ? "text-violet-400" : "text-white/35"}`}>
                        #{listIdx + 1}
                      </span>
                      {active ? <span className="text-[9px] text-violet-400">●</span> : null}
                    </div>
                    <p className="truncate text-[10px] leading-tight text-white/50">{caption}</p>
                  </div>
                </button>
              );
            }

            return (
              <button
                key={origIdx}
                type="button"
                data-gallery-idx={listIdx}
                onClick={() => loadShow(show, origIdx)}
                className={`w-full overflow-hidden rounded-xl border text-left transition-all ${
                  active
                    ? "border-violet-500 ring-1 ring-violet-500/40"
                    : "border-white/10 hover:border-white/25"
                }`}
              >
                {show.previewScreenshot ? (
                  <div className="bg-black/80">
                    <div className="relative max-h-[min(52vh,380px)] bg-black" style={{ aspectRatio: "9 / 16" }}>
                      <img
                        src={show.previewScreenshot}
                        alt={caption ? `Preview of ${caption}` : `Preview of slideshow ${listIdx + 1}`}
                        className="h-full w-full max-h-[min(52vh,380px)] object-contain object-center"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="grid max-h-[min(52vh,380px)] grid-cols-2 gap-px bg-black/60">
                    {(Array.isArray(show.slots) ? show.slots : []).map((slot, i) => (
                      <div key={i} className="relative overflow-hidden bg-zinc-900" style={{ aspectRatio: "3/4" }}>
                        {slot.imageUrl ? (
                          <img src={slot.imageUrl} alt="" className="h-full w-full object-contain object-center" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center">
                            <span className="text-white/15 text-[10px]">{i + 1}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                <div className="bg-zinc-900/80 px-2.5 py-2">
                  <div className="flex items-center justify-between">
                    <span className={`text-[10px] font-semibold ${active ? "text-violet-400" : "text-white/30"}`}>
                      #{listIdx + 1}
                    </span>
                    {active ? (
                      <span className="text-[9px] font-medium text-violet-400">● active</span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 truncate text-[11px] leading-tight text-white/60">{caption}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
