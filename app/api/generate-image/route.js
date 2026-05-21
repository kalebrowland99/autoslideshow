import { NextResponse } from "next/server";
import { runImageGenerationPipeline } from "@/lib/imageGenerationBackend";

const OPENAI_CHAT = "https://api.openai.com/v1/chat/completions";

async function identifyWithOpenAI({ imageUrl, openaiApiKey }) {
  if (!openaiApiKey?.trim()) {
    return { error: "OpenAI API key is not configured on the server.", status: 500 };
  }

  const res = await fetch(OPENAI_CHAT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openaiApiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [{
        role: "user",
        content: [
          { type: "image_url", image_url: { url: imageUrl, detail: "low" } },
          { type: "text", text: `You are an expert Grailed reseller and thrift evaluator. Analyze this thrift store item photo.

Return ONLY valid JSON — no markdown, no explanation:
{"title": "3-6 word resale title", "price": 45}

Rules:
- title: concise resale product title like "Vintage Chrome Hearts Ring" or "Supreme Box Logo Hoodie" or "Kapital Boro Patchwork Jacket"
- price: realistic Grailed/eBay resale price in USD as an integer

Brand price guidelines:
- Japanese archive (Kapital, Visvim, Undercover, Number Nine, Comme des Garçons, etc.): $150–2000
- High fashion (Rick Owens, Balenciaga, Chrome Hearts, Prada, etc.): $100–1500
- Streetwear (Supreme, BAPE, Off-White, Palace): $60–500
- Gorpcore (Arc'teryx, Patagonia TNF): $40–300
- Vintage workwear (Carhartt, Levi's USA, Dickies): $30–200
- Sneakers (Nike, Jordan, Adidas vintage): $50–400
- General vintage / cultural merch: $15–80

Be decisive. Think like a reseller trying to make money.` },
        ],
      }],
      max_tokens: 60,
    }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    return { error: data?.error?.message || `OpenAI error ${res.status}`, status: res.status };
  }

  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content?.trim() || "";

  try {
    const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
    return {
      title: parsed.title?.replace(/^["']|["']$/g, "") || null,
      price: parsed.price ? String(Math.round(Number(parsed.price))) : null,
    };
  } catch {
    return { error: "Could not parse OpenAI identification response.", status: 502 };
  }
}

async function rewordCaptionWithOpenAI({ text, openaiApiKey }) {
  if (!openaiApiKey?.trim()) {
    return { error: "OpenAI API key is not configured on the server.", status: 500 };
  }
  const res = await fetch(OPENAI_CHAT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openaiApiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: `You lightly reword this short TikTok slideshow hook so it feels fresh but keeps the same meaning, energy, and emojis. Preserve line breaks as \\n if there are multiple lines. Max 2 lines. Output ONLY the new caption text, no quotes or explanation:\n\n${text}`,
        },
      ],
      max_tokens: 120,
    }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    return { error: data?.error?.message || `OpenAI error ${res.status}`, status: res.status };
  }

  const data = await res.json();
  let out = data.choices?.[0]?.message?.content?.trim() || "";
  out = out.replace(/^["']|["']$/g, "").trim();
  if (!out) return { error: "Empty reword response.", status: 502 };
  return { text: out };
}

async function coinPricesWithOpenAI({ coinName, openaiApiKey }) {
  if (!openaiApiKey?.trim()) {
    return { error: "OpenAI API key is not configured on the server.", status: 500 };
  }
  const res = await fetch(OPENAI_CHAT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openaiApiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: `You estimate realistic US coin prices for collectors.\n\nCoin: ${coinName}\n\nReturn ONLY JSON (no markdown, no explanation) in this shape:\n{"buy": 120, "sell": 180}\n\nRules:\n- buy = what someone might realistically pay at a show/online to acquire it (USD integer)\n- sell = realistic resale / market value to a collector (USD integer)\n- sell must be >= buy\n- Be conservative (no insane viral numbers) unless the coin is truly famous (e.g., 1913 Liberty nickel, 1933 Saint-Gaudens double eagle)\n- If the coin includes a condition note like proof/high grade, reflect higher price but keep plausible\n- If uncertain, return reasonable mid-market estimates rather than refusing.`,
        },
      ],
      temperature: 0.6,
      max_tokens: 80,
    }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    return { error: data?.error?.message || `OpenAI error ${res.status}`, status: res.status };
  }

  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content?.trim() || "";
  try {
    const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
    const buy = Math.round(Number(parsed.buy));
    const sell = Math.round(Number(parsed.sell));
    if (!Number.isFinite(buy) || !Number.isFinite(sell) || buy <= 0 || sell <= 0) {
      return { error: "Invalid coin price response.", status: 502 };
    }
    return { buy: String(buy), sell: String(Math.max(sell, buy)) };
  } catch {
    return { error: "Could not parse OpenAI coin price response.", status: 502 };
  }
}

async function valcoinIdentifyWithOpenAI({ imageUrl, openaiApiKey }) {
  if (!openaiApiKey?.trim()) {
    return { error: "OpenAI API key is not configured on the server.", status: 500 };
  }
  if (typeof imageUrl !== "string" || !imageUrl.trim()) {
    return { error: "imageUrl is required.", status: 400 };
  }

  const res = await fetch(OPENAI_CHAT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openaiApiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o",
      temperature: 0.4,
      max_tokens: 600,
      messages: [
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: imageUrl, detail: "high" } },
            {
              type: "text",
              text: `You are a US coin grading and pricing expert (Heritage Auctions / PCGS / NGC vibe). The photo may show a single coin, both sides, or a small group; pick the most prominent US coin and identify it.

Return ONLY valid JSON (no markdown, no extra prose), exactly this shape:
{
  "name": "1909-S VDB Lincoln Cent",
  "year": "1909",
  "mintMark": "S",
  "denomination": "1 cent",
  "grade": "VF-30",
  "buy": 1400,
  "sell": 2200,
  "listings": [
    { "title": "1909-S VDB Lincoln Wheat Cent VF Original", "source": "Heritage Auctions", "price": 2150 },
    { "title": "1909 S VDB Penny PCGS Genuine Detail", "source": "eBay", "price": 1850 }
  ]
}

Rules:
- name: 3-7 words, clean Title Case (year, mint mark if visible, series, denomination). Examples: "1916-D Mercury Dime", "1893-S Morgan Dollar", "1955 Doubled Die Lincoln Cent", "1942/1 Mercury Dime".
- If only the obverse or reverse is visible, still pick a sensible variety/year window from visual cues (portrait, design, mint mark location, devices).
- buy: realistic acquire price at a show / strong eBay buy, USD integer.
- sell: realistic comp / collector retail price, USD integer, >= buy.
- For ultra-common coins (modern Lincoln cents, Wheat cents post-1934, Memorial cents, Roosevelt dimes, Jefferson nickels, clad quarters, Kennedy halves, Sacagawea/Presidential dollars): keep prices low ($2-$60). For semi-keys ($50-$500). Only true keys (1909-S VDB, 1914-D, 1916-D Merc, 1893-S Morgan, 1916 Standing Liberty, 1932-D/S Washington, 1955 DDO, etc.) should reach $500+; never invent absurd numbers.
- listings: exactly 2 plausible recently-sold comps, sources from {Heritage Auctions, Stack's Bowers, GreatCollections, eBay, APMEX, JM Bullion, NGC, PCGS, SD Bullion}. Each price within ~25% of sell.
- If the photo is clearly NOT a US coin or you cannot identify any coin (medal, token, foreign, packaging only), return {"name": ""} with no other fields.`,
            },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    return { error: data?.error?.message || `OpenAI error ${res.status}`, status: res.status };
  }

  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content?.trim() || "";

  try {
    const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
    const name = String(parsed?.name ?? "").trim();
    if (!name) {
      return { error: "Could not identify a US coin in the photo.", status: 422 };
    }
    const buy = Math.round(Number(parsed.buy));
    const sell = Math.round(Number(parsed.sell));
    if (!Number.isFinite(buy) || !Number.isFinite(sell) || buy <= 0 || sell <= 0) {
      return { error: "Invalid coin price response.", status: 502 };
    }
    const sellSafe = Math.max(buy, sell);
    const listings = Array.isArray(parsed.listings)
      ? parsed.listings.slice(0, 2).map((l) => {
          const lp = Math.round(Number(l?.price));
          return {
            title: String(l?.title ?? "").trim() || `${name} — Sold`,
            source: String(l?.source ?? "").trim() || "eBay",
            price: Number.isFinite(lp) && lp > 0 ? String(lp) : "",
          };
        })
      : [];
    return {
      name,
      year: String(parsed.year ?? "").trim(),
      mintMark: String(parsed.mintMark ?? "").trim(),
      denomination: String(parsed.denomination ?? "").trim(),
      grade: String(parsed.grade ?? "").trim(),
      buy: String(Math.max(1, buy)),
      sell: String(sellSafe),
      listings,
    };
  } catch {
    return { error: "Could not parse coin identification response.", status: 502 };
  }
}

// ── Route handler ─────────────────────────────────────────────────────────────
export async function POST(req) {
  try {
    const {
      action = "generate",
      prompt,
      referenceFile,
      referenceInline,
      referenceRoot,
      imageUrl,
      geminiApiKey: requestGeminiApiKey,
      openaiApiKey: requestOpenaiApiKey,
      model = "gemini",
      text,
    } = await req.json();

    const openaiApiKey = process.env.OPENAI_API_KEY?.trim() || requestOpenaiApiKey?.trim();
    const geminiApiKey = process.env.GEMINI_API_KEY?.trim() || requestGeminiApiKey?.trim();

    let result;
    if (action === "identify") {
      result = await identifyWithOpenAI({ imageUrl, openaiApiKey });
      if (result.error) {
        return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
      }
      return NextResponse.json({ title: result.title, price: result.price });
    }

    if (action === "rewordCaption") {
      result = await rewordCaptionWithOpenAI({ text: text ?? "", openaiApiKey });
      if (result.error) {
        return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
      }
      return NextResponse.json({ text: result.text });
    }

    if (action === "coinPrices") {
      const coinName = String(text ?? "").trim();
      result = await coinPricesWithOpenAI({ coinName, openaiApiKey });
      if (result.error) {
        return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
      }
      return NextResponse.json({ buy: result.buy, sell: result.sell });
    }

    if (action === "valcoinIdentify") {
      result = await valcoinIdentifyWithOpenAI({ imageUrl, openaiApiKey });
      if (result.error) {
        return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
      }
      return NextResponse.json({
        name: result.name,
        year: result.year,
        mintMark: result.mintMark,
        denomination: result.denomination,
        grade: result.grade,
        buy: result.buy,
        sell: result.sell,
        listings: result.listings,
      });
    }

    result = await runImageGenerationPipeline({
      prompt,
      referenceFile,
      referenceInline,
      referenceRoot,
      model,
      openaiApiKey: requestOpenaiApiKey,
      geminiApiKey: requestGeminiApiKey,
    });

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
    }
    return NextResponse.json({ b64: result.b64 });
  } catch (err) {
    console.error("[generate-image]", err);
    return NextResponse.json({ error: err.message || "Unknown server error" }, { status: 500 });
  }
}
