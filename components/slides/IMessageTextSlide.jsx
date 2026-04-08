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
    // Prefer AI-generated thread stored on the slot
    if (Array.isArray(slot?.imessageThread) && slot.imessageThread.length >= 3) {
      return slot.imessageThread.map((m) => ({ from: m.from, text: m.text }));
    }
    // Seeded fallback
    const n = momName(slot?.itemName);
    const p = slot?.soldPrice ? slot.soldPrice : "???";
    return THREAD_VARIANTS[(seed >>> 0) % THREAD_VARIANTS.length](n, p, seed);
  }, [seed, slot?.itemName, slot?.soldPrice, slot?.imessageThread]);

  const timeLabel = TIME_LABELS[(seed >>> 2) % TIME_LABELS.length];

  // Short display name for avatar initial + sender label
  const shortName = contactName.replace(/\s*\(.*?\)/, "").trim().split(/\s+/)[0]; // "Mom"
  const avatarLetter = shortName[0]?.toUpperCase() ?? "M";

  // ── Layout (all in iPhone pts) ────────────────────────────────────────────
  const statusH   = 54;
  const navH      = 88;
  const inputBarH = 84;
  const avatarSz  = 32;
  const avatarGap = 8;   // gap between avatar and bubble
  const leftPad   = 10;  // left edge padding
  const rightPad  = 16;
  const bubbleMaxW = 260;
  const R  = 20;   // full corner radius
  const Rs = 5;    // small corner (chained bubbles)
  const fontSize  = 17;
  const padV      = 10;
  const padH      = 14;
  const sameGap   = 3;   // gap between bubbles of same sender
  const turnGap   = 18;  // gap between different-sender turns
  const nameFSize = 12;

  // Group bubbles into sender-runs for name label + avatar logic
  const groups = [];
  bubbles.forEach((msg, idx) => {
    const prev = bubbles[idx - 1];
    if (!prev || prev.from !== msg.from) {
      groups.push({ from: msg.from, indices: [idx] });
    } else {
      groups[groups.length - 1].indices.push(idx);
    }
  });
  // Build a map: bubbleIdx → { isFirst, isLast, isGroupFirst, isGroupLast }
  const bubbleMeta = {};
  groups.forEach((g) => {
    g.indices.forEach((idx, pos) => {
      bubbleMeta[idx] = {
        isGroupFirst: pos === 0,
        isGroupLast:  pos === g.indices.length - 1,
        isVeryLast:   idx === bubbles.length - 1,
        isVeryFirst:  idx === 0,
      };
    });
  });

  return (
    <div style={{
      width: W, height: H,
      background: BG,
      fontFamily: FONT,
      position: "relative",
      overflow: "hidden",
    }}>

      {/* ── Status bar ──────────────────────────────────────────────────────── */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0,
        height: px(statusH),
        display: "flex", alignItems: "flex-end", justifyContent: "space-between",
        paddingLeft: px(22), paddingRight: px(18), paddingBottom: px(10),
        zIndex: 10,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: px(5) }}>
          <span style={{ color: "#fff", fontSize: px(15), fontWeight: 600, letterSpacing: "-0.02em" }}>10:39</span>
          {/* Location arrow */}
          <svg width={px(10)} height={px(12)} viewBox="0 0 24 24" fill="white" opacity="0.9">
            <path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z"/>
          </svg>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: px(6) }}>
          {/* Signal bars */}
          {[6,9,12,15].map((h, i) => (
            <div key={i} style={{ width: px(3.5), height: px(h), background: "#fff", borderRadius: px(1) }} />
          ))}
          {/* WiFi */}
          <svg width={px(17)} height={px(13)} viewBox="0 0 24 18" fill="white" style={{ marginLeft: px(2) }}>
            <path d="M12 4C7.31 4 3.07 5.9 0 8.98L2.4 11.5C4.83 9.02 8.24 7.5 12 7.5s7.17 1.52 9.6 4L24 9C20.93 5.9 16.69 4 12 4zm0 6c-3.04 0-5.78 1.21-7.78 3.16L6.6 15.5C8.04 14.03 10 13.1 12 13.1s3.96.93 5.4 2.4l2.38-2.34C17.78 11.21 15.04 10 12 10zm0 6a4 4 0 00-2.83 1.17L12 20l2.83-2.83A4 4 0 0012 16z"/>
          </svg>
          {/* Battery */}
          <div style={{ display: "flex", alignItems: "center", marginLeft: px(2) }}>
            <div style={{ width: px(27), height: px(13), borderRadius: px(3.5), border: `${px(1.5)}px solid rgba(255,255,255,0.5)`, position: "relative", overflow: "visible" }}>
              <div style={{ position: "absolute", inset: px(2), right: "20%", background: "#fff", borderRadius: px(2) }} />
              <div style={{ position: "absolute", right: px(-4), top: "30%", bottom: "30%", width: px(2.5), background: "rgba(255,255,255,0.5)", borderRadius: "0 2px 2px 0" }} />
            </div>
          </div>
        </div>
      </div>

      {/* ── Nav bar ─────────────────────────────────────────────────────────── */}
      <div style={{
        position: "absolute", top: px(statusH), left: 0, right: 0,
        height: px(navH),
        background: NAV_BG,
        backdropFilter: "blur(24px)",
        borderBottom: `${px(0.5)}px solid rgba(255,255,255,0.12)`,
        display: "flex", alignItems: "center",
        paddingLeft: px(10), paddingRight: px(16),
        zIndex: 10,
      }}>
        {/* Back arrow (no text — matches screenshot) */}
        <div style={{ minWidth: px(32), display: "flex", alignItems: "center" }}>
          <svg width={px(12)} height={px(20)} viewBox="0 0 12 20" fill="none" stroke={IOS_BLUE} strokeWidth={px(2)} strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 2L2 10l8 8"/>
          </svg>
        </div>

        {/* Center: avatar + name + chevron */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: px(3) }}>
          {/* Avatar circle */}
          <div style={{
            width: px(42), height: px(42), borderRadius: "50%",
            background: "#8E8E93",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }}>
            <span style={{ color: "#fff", fontSize: px(18), fontWeight: 600 }}>{avatarLetter}</span>
          </div>
          {/* Name + chevron */}
          <div style={{ display: "flex", alignItems: "center", gap: px(3) }}>
            <span style={{ color: "#fff", fontSize: px(13), fontWeight: 500, letterSpacing: "-0.01em" }}>{shortName}</span>
            <svg width={px(7)} height={px(11)} viewBox="0 0 7 11" fill="none" stroke={IOS_BLUE} strokeWidth={px(1.5)} strokeLinecap="round">
              <path d="M1 1l5 4.5L1 10"/>
            </svg>
          </div>
        </div>

        {/* Spacer for symmetry */}
        <div style={{ minWidth: px(32) }} />
      </div>

      {/* ── Message thread ───────────────────────────────────────────────────── */}
      <div style={{
        position: "absolute",
        top: px(statusH + navH),
        left: 0, right: 0,
        bottom: px(inputBarH),
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
        paddingBottom: px(12),
        overflowY: "hidden",
      }}>
        {/* "iMessage / Today X:XX AM" thread header */}
        <div style={{
          textAlign: "center",
          color: "rgba(255,255,255,0.4)",
          fontSize: px(12),
          fontWeight: 400,
          lineHeight: 1.5,
          marginBottom: px(16),
          letterSpacing: "0.01em",
        }}>
          iMessage{"\n"}{timeLabel}
        </div>

        {/* Render by groups so we can show name labels + avatars correctly */}
        {groups.map((group, gIdx) => {
          const isSon = group.from === "son";
          const prevGroup = groups[gIdx - 1];
          const marginTop = prevGroup ? px(turnGap) : 0;

          return (
            <div key={gIdx} style={{ marginTop }}>
              {/* Sender name label (mom only, above first bubble of group) */}
              {!isSon && (
                <div style={{
                  fontSize: px(nameFSize),
                  color: "rgba(255,255,255,0.45)",
                  fontWeight: 400,
                  marginBottom: px(3),
                  paddingLeft: px(leftPad + avatarSz + avatarGap),
                  letterSpacing: "0.01em",
                }}>
                  {shortName}
                </div>
              )}

              {/* Row: avatar (mom) + bubbles */}
              <div style={{
                display: "flex",
                flexDirection: "row",
                alignItems: "flex-end",
                paddingLeft: isSon ? 0 : px(leftPad),
                paddingRight: isSon ? px(rightPad) : 0,
              }}>
                {/* Avatar — mom only, shown aligned to last bubble */}
                {!isSon && (
                  <div style={{
                    width: px(avatarSz), height: px(avatarSz),
                    borderRadius: "50%",
                    background: "#8E8E93",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0,
                    marginRight: px(avatarGap),
                    marginBottom: 0,
                  }}>
                    <span style={{ color: "#fff", fontSize: px(14), fontWeight: 600 }}>{avatarLetter}</span>
                  </div>
                )}

                {/* Bubble stack */}
                <div style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: isSon ? "flex-end" : "flex-start",
                  gap: px(sameGap),
                }}>
                  {group.indices.map((idx, pos) => {
                    const msg = bubbles[idx];
                    const isFirst = pos === 0;
                    const isLast  = pos === group.indices.length - 1;
                    const isVeryLast = idx === bubbles.length - 1;

                    // Border radius: TL TR BR BL
                    const r = px(R), rs = px(Rs);
                    const borderRadius = isSon
                      ? `${isFirst ? r : rs} ${r} ${r} ${isLast ? r : rs}`
                      : `${r} ${isFirst ? r : rs} ${isLast ? r : rs} ${r}`;

                    return (
                      <div key={idx}>
                        <div style={{
                          maxWidth: px(bubbleMaxW),
                          background: isSon ? IOS_BLUE : BUBBLE_GREY,
                          borderRadius,
                          padding: `${px(padV)}px ${px(padH)}px`,
                        }}>
                          <span style={{
                            color: "#fff",
                            fontSize: px(fontSize),
                            lineHeight: 1.35,
                            fontWeight: 400,
                            letterSpacing: "-0.01em",
                            display: "block",
                          }}>
                            {msg.text}
                          </span>
                        </div>
                        {/* "Delivered" under very last message */}
                        {isVeryLast && (
                          <div style={{
                            fontSize: px(11),
                            color: "rgba(255,255,255,0.35)",
                            marginTop: px(3),
                            textAlign: isSon ? "right" : "left",
                            paddingRight: isSon ? 0 : 0,
                          }}>
                            Delivered
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Input bar ────────────────────────────────────────────────────────── */}
      <div style={{
        position: "absolute",
        bottom: 0, left: 0, right: 0,
        height: px(inputBarH),
        background: NAV_BG,
        backdropFilter: "blur(24px)",
        borderTop: `${px(0.5)}px solid rgba(255,255,255,0.12)`,
        display: "flex",
        alignItems: "center",
        paddingLeft: px(12),
        paddingRight: px(14),
        gap: px(10),
      }}>
        {/* Camera icon */}
        <svg width={px(26)} height={px(22)} viewBox="0 0 26 22" fill="none">
          <rect x="1" y="4" width="24" height="16" rx="4" stroke="rgba(255,255,255,0.55)" strokeWidth="1.8"/>
          <circle cx="13" cy="12" r="4.5" stroke="rgba(255,255,255,0.55)" strokeWidth="1.8"/>
          <path d="M9 4l1.5-3h5L17 4" stroke="rgba(255,255,255,0.55)" strokeWidth="1.8" strokeLinecap="round"/>
        </svg>
        {/* Apps button */}
        <div style={{
          width: px(30), height: px(30), borderRadius: "50%",
          border: `${px(1.8)}px solid rgba(255,255,255,0.5)`,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <svg width={px(14)} height={px(14)} viewBox="0 0 14 14" fill="rgba(255,255,255,0.55)">
            <circle cx="2.5" cy="2.5" r="1.5"/><circle cx="7" cy="2.5" r="1.5"/><circle cx="11.5" cy="2.5" r="1.5"/>
            <circle cx="2.5" cy="7" r="1.5"/><circle cx="7" cy="7" r="1.5"/><circle cx="11.5" cy="7" r="1.5"/>
            <circle cx="2.5" cy="11.5" r="1.5"/><circle cx="7" cy="11.5" r="1.5"/><circle cx="11.5" cy="11.5" r="1.5"/>
          </svg>
        </div>
        {/* iMessage input pill */}
        <div style={{
          flex: 1,
          height: px(36),
          background: "rgba(255,255,255,0.06)",
          border: `${px(1)}px solid rgba(255,255,255,0.18)`,
          borderRadius: px(18),
          display: "flex",
          alignItems: "center",
          paddingLeft: px(14),
          paddingRight: px(10),
          justifyContent: "space-between",
        }}>
          <span style={{ color: "rgba(255,255,255,0.28)", fontSize: px(16), letterSpacing: "-0.01em" }}>iMessage</span>
          {/* Audio waveform icon */}
          <svg width={px(20)} height={px(16)} viewBox="0 0 20 16" fill="none">
            {[2,5,0,8,3,8,0,5,2].map((h, i) => (
              <rect key={i} x={i * 2.2 + 0.1} y={(8 - h) / 2} width="1.6" height={Math.max(h, 2)} rx="0.8" fill="rgba(255,255,255,0.45)"/>
            ))}
          </svg>
        </div>
      </div>
    </div>
  );
}
