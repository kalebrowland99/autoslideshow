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
    const prompt = `Generate a \"starter pack\" headline + 3 card titles for a controversial but relatable TikTok post about thrifting.

Goal:
- \"Rage bait\" / debate bait that young thrifters relate to (Gen Z / young millennials)
- No hate, no slurs, no protected-class targeting
- Don't mention Google Lens (the app already does that)
- Keep it about thrift culture: resellers vs thrifters, goodwill bins, depop, gatekeeping, \"thrift grift\", overpriced curated thrift, \"is it vintage or just old\", etc.

Output rules:
- Return ONLY JSON, no markdown.
- Headline: 1–2 lines max, all lowercase, punchy, like the example \"people with these hobbies have more aura than they know what to do with\".
- Exactly 3 item titles:
  - Each is 1–3 words (short label like a card header)
  - Should be concrete/visual (a person type, a habit, an item, a place)
  - Avoid brand names that are trademark-heavy; keep generic.

Return JSON shape exactly:
{"headline":"...","items":["...","...","..."]}`;

    try {
      const res = await fetch(OPENAI_CHAT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          temperature: 1.1,
          max_tokens: 220,
          messages: [{ role: "user", content: prompt }],
        }),
      });

      const data = await res.json();
      const raw = data.choices?.[0]?.message?.content?.trim() ?? "";
      const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
      const out = JSON.parse(cleaned);
      const headline = String(out?.headline ?? "").trim();
      const items = Array.isArray(out?.items) ? out.items.map((s) => String(s ?? "").trim()).filter(Boolean) : [];

      if (!headline || items.length !== 3) throw new Error("Unexpected starter pack format");

      // Trim to keep card headers short and safe
      const clippedItems = items.map((s) => s.slice(0, 28));
      return NextResponse.json({ headline, items: clippedItems });
    } catch (e) {
      console.error("generate-text error:", e);
      return NextResponse.json({ error: String(e) }, { status: 500 });
    }
  }

  if (type === "povThriftFullTime") {
    const prompt = `Create a viral \"starter pack\" for: \"pov: you thrift full time\".

We are generating:
- 1 headline (all lowercase) that is debate-bait / relatable for young thrifters
- 5 struggle tiles (short labels) AND 5 matching image prompts (photoreal) for those tiles.

Requirements:
- Do NOT mention Google Lens.
- Keep it about thrifting culture and pain points: goodwill bins, lining up, resellers, depop/posh orders, sanitizer, masks, dust, sweat, sore hands, chaotic carts, price tags, donation days, etc.
- No hate, no slurs, no protected-class targeting.

Headline rules:
- all lowercase
- 1–2 lines max
- must start with \"pov:\" or \"pov\"

Tile rules:
- Exactly 5 tiles.
- Each tile label: 1–3 words (max 18 chars preferred).
- Each tile prompt: one sentence describing a 9:16 iPhone photo of that struggle object/scene.
- Prompts should be realistic (no text overlays), suitable for our image generator.

Return ONLY JSON with this exact shape:
{
  \"headline\":\"...\",
  \"tiles\":[
    {\"label\":\"...\",\"prompt\":\"...\"},
    {\"label\":\"...\",\"prompt\":\"...\"},
    {\"label\":\"...\",\"prompt\":\"...\"},
    {\"label\":\"...\",\"prompt\":\"...\"},
    {\"label\":\"...\",\"prompt\":\"...\"}
  ]
}`;

    try {
      const res = await fetch(OPENAI_CHAT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          temperature: 1.1,
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
      const tiles = tilesRaw
        .slice(0, 5)
        .map((t) => ({
          label: String(t?.label ?? "").trim().slice(0, 28),
          prompt: String(t?.prompt ?? "").trim().slice(0, 240),
        }))
        .filter((t) => t.label && t.prompt);

      if (!headline || tiles.length !== 5) throw new Error("Unexpected povThriftFullTime format");
      return NextResponse.json({ headline, tiles });
    } catch (e) {
      console.error("generate-text error:", e);
      return NextResponse.json({ error: String(e) }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "Unknown type" }, { status: 400 });
}
