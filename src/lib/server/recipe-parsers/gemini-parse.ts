// Server-only: calls Gemini with structured output and returns a DraftRecipe.
// Prompt + schema live next door in ./schema.ts so they stay together.
//
// Two public entry points today:
//   - parseRecipeFromText     – pasted text (Phase 1)
//   - parseRecipeFromYouTube  – Gemini ingests the URL natively (Phase 2)
// They share a common core that builds the request, calls Gemini, and
// validates the structured JSON response.

import type { DraftRecipe } from "@/lib/types/import";
import { RECIPE_RESPONSE_SCHEMA, SYSTEM_PROMPT } from "./schema";
import { normalizeToMetric } from "./unit-convert";

const MODEL = "gemini-2.5-flash";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

// Hard cap on pasted text so a single bad source can't burn the whole
// Gemini daily quota. 120k chars ≈ 30k tokens — plenty for any recipe.
const MAX_INPUT_CHARS = 120_000;

// YouTube videos tie up more tokens than text. 60s is enough for short
// videos; longer ones (full cooking tutorials) can legitimately take 60-120s
// including video download on Gemini's side. Give it headroom.
const YOUTUBE_TIMEOUT_MS = 180_000;
const TEXT_TIMEOUT_MS = 60_000;

export class GeminiParseError extends Error {
  status: number;
  constructor(message: string, status = 500) {
    super(message);
    this.status = status;
  }
}

// Gemini's `parts` array is a union. We only emit two shapes right now.
type GeminiPart =
  | { text: string }
  | { fileData: { fileUri: string; mimeType?: string } };

interface CallOptions {
  parts: GeminiPart[];
  timeoutMs: number;
  sourceUrl?: string;
  /**
   * Retry once on transport-level failures (TCP reset, socket closed,
   * DNS). This covers the most common YouTube failure mode: Google's edge
   * closes the connection while their upstream fetches/transcodes the
   * video, but the video is cached server-side, so the second attempt
   * almost always succeeds. Only enable when the extra latency on failure
   * is worth it — leave off for text parsing where errors are deterministic.
   */
  retryOnNetworkError?: boolean;
}

async function callGeminiForRecipe(opts: CallOptions): Promise<DraftRecipe> {
  try {
    return await doCallGemini(opts);
  } catch (err) {
    if (opts.retryOnNetworkError && isTransientNetworkError(err)) {
      console.warn(
        "Gemini transport error, retrying once:",
        err instanceof Error ? err.message : err
      );
      return await doCallGemini(opts);
    }
    throw err;
  }
}

// GeminiParseError means Gemini itself responded with a non-2xx — retry won't
// help. Everything else thrown by fetch (TypeError "fetch failed", undici
// socket errors, AbortError from our timeout) is transient.
function isTransientNetworkError(err: unknown): boolean {
  if (err instanceof GeminiParseError) return false;
  return err instanceof Error;
}

async function doCallGemini(opts: CallOptions): Promise<DraftRecipe> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new GeminiParseError(
      "Recipe import is not configured on the server.",
      500
    );
  }

  const body = {
    contents: [{ role: "user", parts: opts.parts }],
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: RECIPE_RESPONSE_SCHEMA,
      temperature: 0.2,
    },
  };

  const response = await fetch(`${ENDPOINT}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(opts.timeoutMs),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Gemini parse error:", response.status, errorText);
    throw new GeminiParseError(
      "The AI could not read this source. Try another one.",
      response.status >= 500 ? 502 : 400
    );
  }

  const data = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const jsonText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!jsonText) {
    throw new GeminiParseError("Gemini returned no content.", 502);
  }

  let parsed: DraftRecipe;
  try {
    parsed = JSON.parse(jsonText) as DraftRecipe;
  } catch {
    throw new GeminiParseError("Gemini returned malformed JSON.", 502);
  }

  if (!parsed.title || typeof parsed.title !== "string") {
    throw new GeminiParseError(
      "We couldn't find a recipe in this source.",
      422
    );
  }
  if (!Array.isArray(parsed.ingredients) || parsed.ingredients.length === 0) {
    throw new GeminiParseError(
      "We couldn't find a recipe in this source.",
      422
    );
  }

  if (opts.sourceUrl) parsed.sourceUrl = opts.sourceUrl;
  // Convert US/imperial mass units to metric before handing the draft off.
  // Safe (mass only, deterministic) and leaves an audit note on each
  // converted ingredient so the user can verify on review.
  return normalizeToMetric(parsed);
}

// -------------------------------------------------------------------------
// Text paste
// -------------------------------------------------------------------------

interface ParseTextOptions {
  text: string;
  sourceUrl?: string;
}

export async function parseRecipeFromText(
  opts: ParseTextOptions
): Promise<DraftRecipe> {
  const trimmed = opts.text.trim();
  if (!trimmed) {
    throw new GeminiParseError("No content to parse.", 400);
  }
  const truncated =
    trimmed.length > MAX_INPUT_CHARS ? trimmed.slice(0, MAX_INPUT_CHARS) : trimmed;

  return callGeminiForRecipe({
    parts: [
      {
        text: `Convert the following recipe source into structured JSON matching the schema.\n\n---\n${truncated}\n---`,
      },
    ],
    timeoutMs: TEXT_TIMEOUT_MS,
    sourceUrl: opts.sourceUrl,
  });
}

// -------------------------------------------------------------------------
// YouTube URL — Gemini ingests it natively as a fileData part
// -------------------------------------------------------------------------

interface ParseYouTubeOptions {
  url: string;
}

export async function parseRecipeFromYouTube(
  opts: ParseYouTubeOptions
): Promise<DraftRecipe> {
  return callGeminiForRecipe({
    parts: [
      { fileData: { fileUri: opts.url } },
      {
        text: "Extract the recipe from this cooking video into structured JSON matching the schema. Combine what the creator says with what is shown on screen (measuring, on-screen text overlays, final ingredient shots). Ignore sponsor segments and ending banter.",
      },
    ],
    timeoutMs: YOUTUBE_TIMEOUT_MS,
    sourceUrl: opts.url,
    retryOnNetworkError: true,
  });
}
