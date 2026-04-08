"use client";

import { useMemo } from "react";

/**
 * iOS Messages dark-mode chat screenshot.
 * Shows mom's follow-up texts after the voicemail: called but no answer,
 * GF's thrift hauls are inappropriate, gave the item away.
 */

const IPHONE_SCALE = 1080 / 390;
const FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", system-ui, sans-serif';
const IOS_BLUE = "#007AFF";
const BUBBLE_GREY = "#3A3A3C";
const BG = "#000000";
const NAV_BG = "rgba(28,28,30,0.94)";

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h;
}

// Same contact-name pool as VoicemailMomSlide so they always match
const CONTACT_NAMES = [
  "Mom (new iPhone 17)",
  "Mom (new iphone 17 pro)",
  "Mom 📱 new phone dont delete",
  "Mom 💕 (iphone 17)",
  "Mommy (new number!)",
  "Mom ❤️ new iphone 17",
  "Mom (got new phone again lol)",
  "mama new iphone 17",
  "Mom (iphone upgrade)",
  "Mom (resaved new phone)",
  "Mom 💕 (new number)",
  "Mommy 📲 new phone",
  "Mom (iphone 17 pro max)",
  "Mom - dont lose this number",
  "mama 💛 new iphone",
  "Mom (switched phones again)",
  "Mom new phone 2025",
  "Mommy new iphone 17",
  "Mom 🌸 new number",
  "Mom (finally upgraded)",
];

function momName(itemName) {
  if (!itemName) return "that thing";
  let s = itemName.trim()
    .replace(/\s*\(.*?\)/g, "")
    .replace(/^(the|a|an)\s+/i, "")
    .replace(/\b(vintage|authentic|pre-owned|pre owned|used|like-new|like new|gently used)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  return s.toLowerCase();
}

// Each variant returns [{from:"mom"|"son", text}] — full conversation thread
const M = (text) => ({ from: "mom", text });
const S = (text) => ({ from: "son", text });

// Son reply variants — reference the sold price
const SON_REPLIES = [
  (p) => `mom i looked it up on thrifty and you literally gave away a $${p} item`,
  (p) => `MOM. i just checked thrifty. that was a $${p} item you gave away`,
  (p) => `mom why would you do that, thrifty says that thing was worth $${p}`,
  (p) => `you gave away a $${p} item mom. i looked it up on thrifty`,
  (p) => `mom thrifty says that was $${p}. you gave away $${p}.`,
];

// Mom's comeback variants
const MOM_COMEBACKS = [
  "idc what thrifty says. get a real job and stop reselling things",
  "i don't care about thrifty. get a job. stop reselling. end of conversation.",
  "thrifty is not a job. get a real job and stop this reselling nonsense",
  "i don't want to hear about thrifty. you need to get a job and stop this.",
  "good. maybe that will teach you to answer your phone. also get a job.",
];

const THREAD_VARIANTS = [
  (n, p, seed) => [
    M("i called you but you didn't pick up 🙄"),
    M(`we seriously need to talk about your girlfriend's thrift haul videos, they are completely inappropriate and embarrassing for this family`),
    M(`since you couldn't bother to answer your phone i went ahead and gave the ${n} away to another lady at the store. hope it was worth it.`),
    S(SON_REPLIES[(seed >>> 1) % SON_REPLIES.length](p)),
    M(MOM_COMEBACKS[(seed >>> 4) % MOM_COMEBACKS.length]),
  ],
  (n, p, seed) => [
    M("you didn't answer so i left a voicemail but i'll say it here too"),
    M(`your girlfriend's thrift videos are NOT okay and the whole family agrees, it needs to stop`),
    M(`also because you didn't call me back i gave your ${n} to someone else at goodwill. it's gone. call me.`),
    S(SON_REPLIES[(seed >>> 1) % SON_REPLIES.length](p)),
    M(MOM_COMEBACKS[(seed >>> 4) % MOM_COMEBACKS.length]),
  ],
  (n, p, seed) => [
    M("i called. no answer. typical."),
    M(`i need you to talk to your girlfriend about her thrift haul videos — they are offensive and she will not be welcome at family events if this continues`),
    M(`i waited for you to call back and you didn't so i gave the ${n} away. someone else has it now. that's on you.`),
    S(SON_REPLIES[(seed >>> 1) % SON_REPLIES.length](p)),
    M(MOM_COMEBACKS[(seed >>> 4) % MOM_COMEBACKS.length]),
  ],
  (n, p, seed) => [
    M("hey i called you like 3 times, you need to answer your phone"),
    M(`this is about your girlfriend's thrift videos — the whole family has seen them and we are NOT okay with it, she needs to stop`),
    M(`and since you ignored me i donated the ${n} i found for you back to goodwill. it's gone. next time answer your phone.`),
    S(SON_REPLIES[(seed >>> 1) % SON_REPLIES.length](p)),
    M(MOM_COMEBACKS[(seed >>> 4) % MOM_COMEBACKS.length]),
  ],
  (n, p, seed) => [
    M("you didn't pick up so now i'm texting you 🙄"),
    M(`your girlfriend's little thrift haul videos are embarrassing and inappropriate and i need you to tell her to stop before the next family event`),
    M(`i held onto that ${n} for you all day waiting for you to call back and you never did so i gave it away. gone. i hope she posts THAT in a video.`),
    S(SON_REPLIES[(seed >>> 1) % SON_REPLIES.length](p)),
    M(MOM_COMEBACKS[(seed >>> 4) % MOM_COMEBACKS.length]),
  ],
];

// Time strings shown above the first bubble
const TIME_LABELS = [
  "Today 8:34 AM", "Today 9:12 AM", "Today 10:47 AM",
  "Today 11:03 AM", "Today 2:18 PM",
];

export default function IMessageTextSlide({ slot, S, config }) {
  const px = (n) => Math.round(n * IPHONE_SCALE * S);

  const W = Math.round(1080 * S);
  const H = Math.round(1920 * S);

  const seed = useMemo(() => hashStr(
    (slot?.itemName || "") + (slot?.spentPrice || "") + (slot?.soldPrice || "")
  ), [slot?.itemName, slot?.spentPrice, slot?.soldPrice]);

  const contactName = useMemo(() => {
    const override = (config?.voicemailDisplayNumber ?? "").trim();
    if (override) return override;
    return CONTACT_NAMES[seed % CONTACT_NAMES.length];
  }, [config?.voicemailDisplayNumber, seed]);

  const bubbles = useMemo(() => {
    const n = momName(slot?.itemName);
    const p = slot?.soldPrice ? slot.soldPrice : "???";
    return THREAD_VARIANTS[(seed >>> 0) % THREAD_VARIANTS.length](n, p, seed);
  }, [seed, slot?.itemName, slot?.soldPrice]);

  const timeLabel = TIME_LABELS[(seed >>> 2) % TIME_LABELS.length];

  // ── Layout ────────────────────────────────────────────────────────────────
  const statusH = 54;
  const navH    = 88;
  const padX    = 16;
  const bubbleMaxW = 270; // pts
  const bubbleR    = 18;
  const bubbleRSmall = 4;
  const fontSize   = 17;
  const lineH      = 1.35;
  const padV       = 11;
  const padHoriz   = 14;
  const gap        = 4; // gap between consecutive bubbles from same sender
  const timeSize   = 13;

  return (
    <div style={{
      width: W, height: H,
      background: BG,
      fontFamily: FONT,
      position: "relative",
      overflow: "hidden",
    }}>
      {/* ── Status bar ─────────────────────────────────────────────────────── */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0,
        height: px(statusH),
        display: "flex", alignItems: "flex-end", justifyContent: "space-between",
        paddingLeft: px(20), paddingRight: px(16), paddingBottom: px(10),
        zIndex: 10,
      }}>
        <span style={{ color: "#fff", fontSize: px(15), fontWeight: 600, letterSpacing: "-0.02em" }}>9:41</span>
        <div style={{ display: "flex", alignItems: "center", gap: px(6) }}>
          {/* Signal */}
          {[3,4,5,6].map((h, i) => (
            <div key={i} style={{ width: px(3), height: px(h), background: "#fff", borderRadius: px(1) }} />
          ))}
          {/* WiFi */}
          <svg width={px(16)} height={px(12)} viewBox="0 0 16 12" fill="white">
            <path d="M8 9.5a1.5 1.5 0 110 3 1.5 1.5 0 010-3zm0-3.5a6 6 0 014.24 1.76l-1.42 1.42A4 4 0 008 8a4 4 0 00-2.83 1.17L3.76 7.76A6 6 0 018 6zm0-4a10 10 0 017.07 2.93L13.66 6.34A8 8 0 008 4a8 8 0 00-5.66 2.34L.93 4.93A10 10 0 018 2z"/>
          </svg>
          {/* Battery */}
          <div style={{ display: "flex", alignItems: "center", gap: px(2) }}>
            <div style={{ width: px(25), height: px(12), borderRadius: px(3), border: "1.5px solid rgba(255,255,255,0.4)", position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", left: px(1.5), top: px(1.5), bottom: px(1.5), width: "75%", background: "#fff", borderRadius: px(1.5) }} />
            </div>
            <div style={{ width: px(2), height: px(5), background: "rgba(255,255,255,0.4)", borderRadius: "0 1px 1px 0" }} />
          </div>
        </div>
      </div>

      {/* ── Nav bar ────────────────────────────────────────────────────────── */}
      <div style={{
        position: "absolute", top: px(statusH), left: 0, right: 0,
        height: px(navH),
        background: NAV_BG,
        backdropFilter: "blur(20px)",
        borderBottom: "0.5px solid rgba(255,255,255,0.1)",
        display: "flex", alignItems: "center",
        paddingLeft: px(8), paddingRight: px(16),
        zIndex: 10,
      }}>
        {/* Back */}
        <div style={{ display: "flex", alignItems: "center", gap: px(3), minWidth: px(60) }}>
          <svg width={px(10)} height={px(17)} viewBox="0 0 10 17" fill={IOS_BLUE}>
            <path d="M8.5 1L1 8.5 8.5 16"/>
          </svg>
          <span style={{ color: IOS_BLUE, fontSize: px(17), fontWeight: 400 }}>Messages</span>
        </div>
        {/* Center: avatar + name */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: px(2) }}>
          <div style={{
            width: px(32), height: px(32), borderRadius: "50%",
            background: "linear-gradient(135deg,#8e44ad,#3498db)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <span style={{ color: "#fff", fontSize: px(14), fontWeight: 600 }}>M</span>
          </div>
          <span style={{ color: "#fff", fontSize: px(12), fontWeight: 500, letterSpacing: "-0.01em" }}>{contactName}</span>
        </div>
        {/* Action icons */}
        <div style={{ display: "flex", gap: px(20), minWidth: px(60), justifyContent: "flex-end" }}>
          {/* Video */}
          <svg width={px(20)} height={px(15)} viewBox="0 0 24 18" fill={IOS_BLUE}>
            <path d="M15 3H2a1 1 0 00-1 1v10a1 1 0 001 1h13a1 1 0 001-1V4a1 1 0 00-1-1zm7 2.5l-5 3.5 5 3.5V5.5z"/>
          </svg>
          {/* Phone */}
          <svg width={px(18)} height={px(18)} viewBox="0 0 24 24" fill={IOS_BLUE}>
            <path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56a.977.977 0 00-1.01.24l-1.57 1.97c-4.51-2.38-7.17-5.19-9.53-9.53l1.97-1.57a.99.99 0 00.25-1.11c-.37-1.12-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z"/>
          </svg>
        </div>
      </div>

      {/* ── Message thread ─────────────────────────────────────────────────── */}
      <div style={{
        position: "absolute",
        top: px(statusH + navH),
        left: 0, right: 0, bottom: px(90),
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
        paddingLeft: px(padX),
        paddingRight: px(padX),
        paddingBottom: px(24),
        gap: px(gap),
      }}>
        {/* Time label */}
        <div style={{
          textAlign: "center",
          color: "rgba(255,255,255,0.45)",
          fontSize: px(timeSize),
          fontWeight: 400,
          marginBottom: px(8),
          letterSpacing: "0.01em",
        }}>
          {timeLabel}
        </div>

        {/* Bubbles */}
        {bubbles.map((msg, idx) => {
          const isSon  = msg.from === "son";
          const isLast = idx === bubbles.length - 1;

          // Group-shape radius: smaller corner where bubbles from same sender chain
          const prevSame = idx > 0 && bubbles[idx - 1].from === msg.from;
          const nextSame = idx < bubbles.length - 1 && bubbles[idx + 1].from === msg.from;
          const r  = px(bubbleR);
          const rs = px(bubbleRSmall);

          // TL TR BR BL
          const borderRadius = isSon
            ? `${prevSame ? rs : r} ${rs} ${nextSame ? rs : r} ${r}`
            : `${rs} ${prevSame ? rs : r} ${nextSame ? rs : r} ${rs}`;

          return (
            <div key={idx} style={{
              display: "flex",
              flexDirection: "column",
              alignItems: isSon ? "flex-end" : "flex-start",
              gap: 0,
            }}>
              <div style={{
                maxWidth: px(bubbleMaxW),
                background: isSon ? IOS_BLUE : BUBBLE_GREY,
                borderRadius,
                padding: `${px(padV)}px ${px(padHoriz)}px`,
              }}>
                <span style={{
                  color: "#ffffff",
                  fontSize: px(fontSize),
                  lineHeight: lineH,
                  fontWeight: 400,
                  letterSpacing: "-0.01em",
                  display: "block",
                }}>
                  {msg.text}
                </span>
              </div>
              {/* "Read" under the last mom bubble (last message) */}
              {isLast && !isSon && (
                <span style={{
                  color: "rgba(255,255,255,0.35)",
                  fontSize: px(11),
                  marginTop: px(4),
                  marginLeft: px(4),
                  letterSpacing: "0.01em",
                }}>
                  Delivered
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Input bar ──────────────────────────────────────────────────────── */}
      <div style={{
        position: "absolute",
        bottom: 0, left: 0, right: 0,
        height: px(90),
        background: NAV_BG,
        backdropFilter: "blur(20px)",
        borderTop: "0.5px solid rgba(255,255,255,0.1)",
        display: "flex",
        alignItems: "center",
        paddingLeft: px(12),
        paddingRight: px(12),
        gap: px(10),
      }}>
        {/* Apps button */}
        <div style={{ width: px(32), height: px(32), borderRadius: "50%", background: "rgba(255,255,255,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width={px(16)} height={px(16)} viewBox="0 0 24 24" fill="rgba(255,255,255,0.6)">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11h-4v4h-2v-4H7v-2h4V7h2v4h4v2z"/>
          </svg>
        </div>
        {/* Text input pill */}
        <div style={{
          flex: 1,
          height: px(36),
          background: "rgba(255,255,255,0.08)",
          border: "1px solid rgba(255,255,255,0.15)",
          borderRadius: px(18),
          display: "flex",
          alignItems: "center",
          paddingLeft: px(14),
          paddingRight: px(14),
        }}>
          <span style={{ color: "rgba(255,255,255,0.3)", fontSize: px(16), letterSpacing: "-0.01em" }}>iMessage</span>
        </div>
        {/* Send button */}
        <div style={{ width: px(32), height: px(32), borderRadius: "50%", background: "rgba(255,255,255,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width={px(14)} height={px(14)} viewBox="0 0 24 24" fill="rgba(255,255,255,0.6)">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
          </svg>
        </div>
      </div>
    </div>
  );
}
