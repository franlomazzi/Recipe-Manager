import { NextResponse } from "next/server";
import { verifyAuthorizedCaller } from "@/lib/firebase/admin";
import { RECIPE_RESPONSE_SCHEMA } from "@/lib/server/recipe-parsers/schema";
import type { DraftRecipe } from "@/lib/types/import";
import { getGeminiApiKey } from "@/lib/server/gemini-key";

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

const TRANSLATE_SYSTEM_PROMPT = `You translate every human-readable text field of a recipe JSON into the target language. The input recipe is in a source language; your output MUST contain no source-language words in any translatable field.

Translate every one of these fields, for every item in the arrays:
- title
- description
- notes
- ingredients[].name (translate the ingredient word itself, e.g. "pollo" -> "chicken", "harina" -> "flour"; keep lowercase, plain, no quantity or prep)
- ingredients[].note (e.g. "finamente picado" -> "finely chopped")
- steps[].instruction (rewrite the cooking step in the target language, imperative and concise, preserving any explicit timings)
- steps[].timerLabel (e.g. "Hornear" -> "Bake")

Copy these fields through unchanged: quantity, prepTime, cookTime, servings, timerMinutes, order, unit, ingredients[].category, difficulty, categories, sourceUrl, detectedLanguage.

Do not skip fields. Do not leave any translatable field in the source language. Return one complete JSON object matching the schema, with the same number of ingredients and steps as the input.`;

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

  const apiKey = await getGeminiApiKey();

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
