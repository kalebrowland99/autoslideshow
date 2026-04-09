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
    // Rotate through different angles each call for variety
    const ANGLES = [
      "the physical struggle (bins, lines, bin diving, sweat, dust, mask smell)",
      "the reseller grind (packaging, depop notifications, price research, post office runs)",
      "the goodwill politics (cart drama, hostile stares, rack hogging, donation drop-off chaos)",
      "the thrift haul aftermath (washing everything, smell, piles on floor, storage overflow)",
      "the thrifter identity (being misunderstood, explaining reselling, flex vs. necessity)",
    ];
    const randomAngle = ANGLES[Math.floor(Math.random() * ANGLES.length)];

    const GREY_HAT_POOL = [
      "switching tags", "swiping buggies", "cart snatching", "hiding finds",
      "tag swapping", "rack squatting", "price sticker swap", "holding racks hostage",
      "stealing from carts", "covering finds", "faking condition tags",
    ];
    const greyHatExample = GREY_HAT_POOL[Math.floor(Math.random() * GREY_HAT_POOL.length)];

    const prompt = `You are generating a viral TikTok \"starter pack\" slide for full-time thrifters.

Theme angle this time: ${randomAngle}

Rules:
- Audience: Gen Z / young millennial thrifters who resell on depop/poshmark
- Tone: relatable, slightly controversial, debate-bait — NOT hateful or discriminatory
- Do NOT mention Google Lens, do NOT mention any real brand names
- Return ONLY raw JSON — no markdown, no extra text

Output:
1. headline — all lowercase, 1–2 punchy lines, must start with "pov:" or reference the thrift life POV
2. Three tiles — each has:
   - label: 1–3 words, short card header matching the theme angle
   - imagePrompt: one sentence for a realistic iPhone photo of that exact subject (no text, no people in foreground, 9:16 portrait)

Hard rule: tiles[1].label MUST be a grey-hat/black-hat thrift controversy this generation's pick: "${greyHatExample}" or a creative variation of it.

Return this exact JSON shape:
{
  "headline": "...",
  "tiles": [
    {"label": "...", "imagePrompt": "..."},
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

      // Fallback: also accept old flat items[] shape
      if ((!tilesRaw.length) && Array.isArray(out?.items)) {
        const items = out.items.map((s) => String(s ?? "").trim()).filter(Boolean);
        if (!headline || items.length !== 3) throw new Error("Unexpected starter pack format");
        return NextResponse.json({ headline, items: items.map((s) => s.slice(0, 28)), imagePrompts: [] });
      }

      if (!headline || tilesRaw.length !== 3) throw new Error("Unexpected starter pack format");

      const items = tilesRaw.map((t) => String(t?.label ?? "").trim().slice(0, 28));
      const imagePrompts = tilesRaw.map((t) => String(t?.imagePrompt ?? "").trim().slice(0, 300));

      return NextResponse.json({ headline, items, imagePrompts });
    } catch (e) {
      console.error("generate-text error:", e);
      return NextResponse.json({ error: String(e) }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "Unknown type" }, { status: 400 });
}
