import { NextResponse } from "next/server";
import { verifyAuthorizedCaller } from "@/lib/firebase/admin";
import { RECIPE_RESPONSE_SCHEMA } from "@/lib/server/recipe-parsers/schema";
import type { DraftRecipe } from "@/lib/types/import";

// POST /api/translate-recipe
//
// AUTH: same Firebase ID token + whitelist check as /api/import-recipe.
// BODY: { draft: DraftRecipe; targetLanguage: "en" | "es" }
//
// Translates only the human-readable text fields of the draft; all numeric
// and enum fields are preserved from the original.

const MODEL = "gemini-3-flash-preview";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const TIMEOUT_MS = 60_000;

const TRANSLATE_SYSTEM_PROMPT = `You are a recipe translator. You will receive a recipe as JSON and must return the same recipe translated into the requested language.

Rules:
- Translate ONLY these text fields: title, description, notes, each ingredient name, each ingredient note, each step instruction, each step timerLabel.
- Do NOT change any numeric fields (quantity, prepTime, cookTime, servings, timerMinutes, order).
- Do NOT change unit codes, category enum values, difficulty, or the categories array.
- Do NOT change sourceUrl or detectedLanguage.
- Keep ingredient names lowercase and plain (no prep or quantity).
- Keep step instructions imperative and concise, preserving explicit timings.
- Return a complete JSON object matching the schema exactly.`;

export async function POST(req: Request) {
  try {
    await verifyAuthorizedCaller(req);
  } catch (err) {
    const status = (err as { status?: number }).status ?? 401;
    const message = err instanceof Error ? err.message : "Unauthorized";
    return NextResponse.json({ error: message }, { status });
  }

  let payload: { draft?: DraftRecipe; targetLanguage?: unknown };
  try {
    payload = (await req.json()) as { draft?: DraftRecipe; targetLanguage?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { draft, targetLanguage } = payload;
  if (!draft || (targetLanguage !== "en" && targetLanguage !== "es")) {
    return NextResponse.json(
      { error: "Missing draft or invalid targetLanguage." },
      { status: 400 }
    );
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Translation is not configured on the server." },
      { status: 500 }
    );
  }

  const langName = targetLanguage === "en" ? "English" : "Spanish";

  const body = {
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `Translate the following recipe JSON to ${langName}. Return only the translated JSON.\n\n${JSON.stringify(draft)}`,
          },
        ],
      },
    ],
    systemInstruction: { parts: [{ text: TRANSLATE_SYSTEM_PROMPT }] },
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: RECIPE_RESPONSE_SCHEMA,
      temperature: 0.2,
      thinkingConfig: { thinkingBudget: 0 },
    },
  };

  let response: Response;
  try {
    response = await fetch(`${ENDPOINT}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    console.error("Gemini translate fetch error:", err);
    return NextResponse.json({ error: "Translation request failed." }, { status: 502 });
  }

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Gemini translate error:", response.status, errorText);
    return NextResponse.json({ error: "Translation failed." }, { status: 502 });
  }

  const data = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const jsonText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!jsonText) {
    return NextResponse.json({ error: "Gemini returned no content." }, { status: 502 });
  }

  let translated: DraftRecipe;
  try {
    translated = JSON.parse(jsonText) as DraftRecipe;
  } catch {
    return NextResponse.json({ error: "Gemini returned malformed JSON." }, { status: 502 });
  }

  // Preserve fields that should never be altered by translation.
  translated.sourceUrl = draft.sourceUrl;
  translated.detectedLanguage = draft.detectedLanguage;

  return NextResponse.json({ draft: translated });
}
