import { NextResponse } from "next/server";

const OPENAI_CHAT = "https://api.openai.com/v1/chat/completions";

export async function POST(req) {
  const { type, itemName, soldPrice } = await req.json();
  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) return NextResponse.json({ error: "OPENAI_API_KEY not set" }, { status: 500 });

  if (type === "imessageThread") {
    const priceStr = soldPrice ? `$${soldPrice}` : "a lot of money";
    const prompt = `Generate a realistic iMessage conversation between a mom and her son.
Context:
- Mom found a thrift-store item ("${itemName || "some item"}") at Goodwill, checked it on the Thrifty reselling app.
- She called her son but he didn't answer, so she texts him.
- She's also mad about his girlfriend's thrift haul videos online and says she's not welcome at family events.
- Because he didn't answer, she gave the item away to someone else at the store.
- Son texts back upset, saying he looked up the item on Thrifty and it was worth ${priceStr}.
- Mom shuts him down: she doesn't care about Thrifty, tells him to get a real job and stop reselling.

Rules:
- Exactly 5 messages in this order: mom, mom, mom, son, mom
- Mom texts are passive-aggressive, casual, lowercase, realistic mom texting style
- Son's text is shocked/frustrated, references "${priceStr}" specifically
- Last mom message is dismissive and tells him to get a job and stop reselling
- Keep each message under 25 words
- Vary the wording naturally — don't sound templated
- Return ONLY a JSON array, no markdown, no explanation:
[{"from":"mom","text":"..."},{"from":"mom","text":"..."},{"from":"mom","text":"..."},{"from":"son","text":"..."},{"from":"mom","text":"..."}]`;

    try {
      const res = await fetch(OPENAI_CHAT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          temperature: 1.1,
          max_tokens: 400,
          messages: [{ role: "user", content: prompt }],
        }),
      });

      const data = await res.json();
      const raw = data.choices?.[0]?.message?.content?.trim() ?? "";

      // Strip markdown code fences if model adds them
      const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
      const thread = JSON.parse(cleaned);

      if (!Array.isArray(thread) || thread.length !== 5) {
        throw new Error("Unexpected thread format");
      }

      return NextResponse.json({ thread });
    } catch (e) {
      console.error("generate-text error:", e);
      return NextResponse.json({ error: String(e) }, { status: 500 });
    }
  }

  if (type === "starterPackThrifting") {
    // Always "pov: you thrift full time" — vary the wording slightly each time
    const HEADLINE_VARIANTS = [
      "pov: you thrift full time",
      "pov: thrifting is literally your job",
      "pov: thrift is your full-time grind",
      "pov: you live at the thrift store",
      "pov: you wake up and go thrift",
      "pov: thrifting is your whole personality",
    ];
    const pack = {
      headline: HEADLINE_VARIANTS[Math.floor(Math.random() * HEADLINE_VARIANTS.length)],
      angle: "full-time thrifter struggles and culture — bins, germ-x, masks, cart drama, price tags, haul piles, depop orders, post office runs",
    };

    const GREY_HAT_POOL = [
      "switching tags", "swiping buggies", "cart snatching", "hiding finds",
      "tag swapping", "rack squatting", "price sticker swap", "holding racks hostage",
      "stealing from carts", "covering finds", "stacking carts", "faking condition tags",
      "hiding under racks", "digging in donated bags", "price-tag peeling",
    ];
    const greyHatExample = GREY_HAT_POOL[Math.floor(Math.random() * GREY_HAT_POOL.length)];

    const prompt = `You are generating a viral TikTok thrift starter pack slide.

Pack concept: "${pack.headline}"
Theme angle: ${pack.angle}

Rules:
- Audience: Gen Z / young millennial thrifters
- Tone: relatable, slightly controversial, debate-bait — NOT hateful or discriminatory
- Do NOT mention Google Lens, do NOT use any specific brand names
- Return ONLY raw JSON — no markdown, no extra text

Label rules (CRITICAL — read carefully):
- Labels must be CONCRETE and INSTANTLY SELF-EXPLANATORY to any thrifter
- A label should describe a specific, real, physical object or action — NOT a metaphor, NOT a vibe, NOT a clever phrase
- A stranger who thrifts should read the label and immediately picture the exact thing
- Bad examples: "hide and seek", "the ultimate tote", "the hustle", "thrift therapy" — too abstract/vague
- Good examples: "germ-x bottle", "the bins smell", "cart diving", "depop notification", "post office run", "price tag drama", "donation pile", "bin gloves", "haul spread", "shipping tape"

Output:
1. headline — all lowercase, 1–2 punchy lines, creative variation of "${pack.headline}" (slight rewording each time)
2. Exactly TWO tiles — each has:
   - label: 1–3 words, a SPECIFIC concrete thrift object or action (follow label rules above)
   - imagePrompt: one sentence for a realistic iPhone candid photo of exactly that label subject (no text overlays, no people in foreground, 9:16 portrait)

Hard rule: tiles[1].label MUST be a grey-hat / black-hat thrifting controversy inspired by: "${greyHatExample}". Keep it 1–3 words, specific and concrete (e.g. "tag switching", "cart snatching").

Return this exact JSON shape (exactly 2 tiles, no more):
{
  "headline": "...",
  "tiles": [
    {"label": "...", "imagePrompt": "..."},
    {"label": "...", "imagePrompt": "..."}
  ]
}`;

    try {
      const res = await fetch(OPENAI_CHAT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          temperature: 1.2,
          max_tokens: 320,
          messages: [{ role: "user", content: prompt }],
        }),
      });

      const data = await res.json();
      const raw = data.choices?.[0]?.message?.content?.trim() ?? "";
      const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
      const out = JSON.parse(cleaned);

      const headline = String(out?.headline ?? "").trim();
      const tilesRaw = Array.isArray(out?.tiles) ? out.tiles : [];

      if (!headline || tilesRaw.length < 2) throw new Error("Unexpected starter pack format");

      // Take exactly 2 tiles
      const items = tilesRaw.slice(0, 2).map((t) => String(t?.label ?? "").trim().slice(0, 28));
      const imagePrompts = tilesRaw.slice(0, 2).map((t) => String(t?.imagePrompt ?? "").trim().slice(0, 300));

      return NextResponse.json({ headline, items, imagePrompts });
    } catch (e) {
      console.error("generate-text error:", e);
      return NextResponse.json({ error: String(e) }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "Unknown type" }, { status: 400 });
}
