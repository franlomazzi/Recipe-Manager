import { NextResponse } from "next/server";
import { verifyAuthorizedCaller } from "@/lib/firebase/admin";
import { getGeminiApiKey } from "@/lib/server/gemini-key";

// Server-side only. Builds the "combined plate" for a multi-recipe meal:
//   1. Gemini text → a short creative dish name + an image prompt that
//      describes all components plated together.
//   2. Imagen 4.0 → one photo of that combined plate.
// Both keep the Gemini key off the client and are auth-gated to the whitelist.
//
// PAYLOAD: { titles: string[], category?: string }
// RESPONSE: { name: string, image: string /* base64 JPEG */ }

const TEXT_MODEL = "gemini-3-flash-preview";
const TEXT_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${TEXT_MODEL}:generateContent`;
const TEXT_TIMEOUT_MS = 15_000;
const IMAGE_TIMEOUT_MS = 30_000;

const NAME_SCHEMA = {
  type: "object",
  properties: {
    name: { type: "string" },
    imagePrompt: { type: "string" },
  },
  required: ["name", "imagePrompt"],
};

interface ComboPayload {
  titles?: string[];
  category?: string;
}

export async function POST(req: Request) {
  try {
    await verifyAuthorizedCaller(req);
  } catch (err) {
    const status = (err as { status?: number }).status ?? 401;
    const message = err instanceof Error ? err.message : "Unauthorized";
    return NextResponse.json({ error: message }, { status });
  }

  let payload: ComboPayload;
  try {
    payload = (await req.json()) as ComboPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const titles = (payload.titles ?? [])
    .map((t) => (typeof t === "string" ? t.trim() : ""))
    .filter(Boolean);
  if (titles.length < 2) {
    return NextResponse.json(
      { error: "At least two recipe titles are required for a combined meal." },
      { status: 400 }
    );
  }

  const apiKey = await getGeminiApiKey();

  const categoryHint = payload.category ? ` (a ${payload.category} meal)` : "";
  const list = titles.join(", ");

  // ── 1. Creative name + image prompt ──
  const namePrompt = `These individual recipes are eaten together as one plated meal${categoryHint}: ${list}.

First, detect the language of the recipe names (e.g. English or Spanish).

Return JSON with:
- "name": a short, appetizing name (max 4 words) for the combined plate as a single dish. It should evoke the whole meal, not just one component. Prefer English; write the name in natural, fluent English even when the source recipes are in another language. Only keep a non-English word if it is the common culinary term for the dish. Never produce a literal word-for-word translation or a mix of languages that reads awkwardly — the name must sound natural to a native speaker.
- "imagePrompt": a vivid food-photography prompt (in English) describing all of these components arranged together on one plate, professionally styled.`;

  let name = "";
  let imagePrompt = "";
  try {
    const res = await fetch(`${TEXT_ENDPOINT}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: namePrompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: NAME_SCHEMA,
          temperature: 0.7,
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
      signal: AbortSignal.timeout(TEXT_TIMEOUT_MS),
    });
    if (res.ok) {
      const data = (await res.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const jsonText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (jsonText) {
        const parsed = JSON.parse(jsonText) as {
          name?: string;
          imagePrompt?: string;
        };
        name = (parsed.name ?? "").trim();
        imagePrompt = (parsed.imagePrompt ?? "").trim();
      }
    } else {
      console.error("generate-meal-combo name error:", res.status, await res.text());
    }
  } catch (err) {
    console.error("generate-meal-combo name internal error:", err);
  }

  // Fallbacks so the feature degrades gracefully if the text call fails.
  if (!name) name = `${titles[0]} +${titles.length - 1}`;
  if (!imagePrompt) {
    imagePrompt = `A professional, high-quality food photography shot of one plate holding ${list} together. Delicious, appetizing, cinematic lighting, gourmet presentation.`;
  }

  // ── 2. Combined plate image ──
  const imageUrl = `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${apiKey}`;
  let image: string | undefined;
  try {
    const res = await fetch(imageUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        instances: [{ prompt: imagePrompt }],
        parameters: { sampleCount: 1, aspectRatio: "1:1" },
      }),
      signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS),
    });
    if (!res.ok) {
      const errorText = await res.text();
      console.error("generate-meal-combo image error:", res.status, errorText);
      return NextResponse.json(
        { error: "Combined image generation failed.", name },
        { status: 502 }
      );
    }
    const data = (await res.json()) as {
      predictions?: Array<{ bytesBase64Encoded?: string }>;
    };
    image = data?.predictions?.[0]?.bytesBase64Encoded;
  } catch (err) {
    console.error("generate-meal-combo image internal error:", err);
    return NextResponse.json(
      { error: "Combined image generation failed.", name },
      { status: 500 }
    );
  }

  if (!image) {
    return NextResponse.json(
      { error: "No image returned.", name },
      { status: 502 }
    );
  }

  return NextResponse.json({ name, image });
}
