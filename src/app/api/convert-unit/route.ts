import { NextResponse } from "next/server";
import { verifyAuthorizedCaller } from "@/lib/firebase/admin";

const MODEL = "gemini-3-flash-preview";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const TIMEOUT_MS = 15_000;

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    factor: { type: "number" },
    confidence: { type: "string", enum: ["high", "low"] },
    reasoning: { type: "string" },
  },
  required: ["factor", "confidence"],
};

interface ConvertUnitPayload {
  ingredientName: string;
  brand?: string;
  fromUnit: string;
  toUnit: string;
}

interface GeminiResponse {
  factor: number;
  confidence: "high" | "low";
  reasoning?: string;
}

// POST /api/convert-unit
//
// AUTH: Firebase ID token, same whitelist as /api/import-recipe.
//
// PAYLOAD: { ingredientName, brand?, fromUnit, toUnit }
// RESPONSE: { factor: number } — multiply fromUnit quantity to get toUnit quantity.
// Returns 422 when Gemini confidence is "low" so caller can fall back gracefully.

export async function POST(req: Request) {
  try {
    await verifyAuthorizedCaller(req);
  } catch (err) {
    const status = (err as { status?: number }).status ?? 401;
    const message = err instanceof Error ? err.message : "Unauthorized";
    return NextResponse.json({ error: message }, { status });
  }

  let payload: Partial<ConvertUnitPayload>;
  try {
    payload = (await req.json()) as Partial<ConvertUnitPayload>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { ingredientName, brand, fromUnit, toUnit } = payload;
  if (!ingredientName || !fromUnit || !toUnit) {
    return NextResponse.json(
      { error: "Missing required fields: ingredientName, fromUnit, toUnit." },
      { status: 400 }
    );
  }

  if (fromUnit === toUnit) {
    return NextResponse.json({ factor: 1 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Unit conversion is not configured on the server." },
      { status: 500 }
    );
  }

  const ingredientLabel = brand
    ? `${ingredientName} (${brand})`
    : ingredientName;

  const prompt = `How many ${toUnit} are in 1 ${fromUnit} of ${ingredientLabel}?

Return a JSON object with:
- "factor": the numeric multiplier (1 ${fromUnit} × factor = result in ${toUnit})
- "confidence": "high" if you are confident in this conversion for this specific ingredient, "low" if the conversion is approximate, unknown, or depends heavily on preparation/form
- "reasoning": brief explanation (optional)

Examples:
- 1 tsp of table salt → ~5.69 g → factor: 5.69, confidence: "high"
- 1 cup of all-purpose flour → ~125 g → factor: 125, confidence: "high"
- 1 tsp of an unknown spice blend → factor: ~2.6, confidence: "low"`;

  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
      temperature: 0.1,
      thinkingConfig: { thinkingBudget: 0 },
    },
  };

  let result: GeminiResponse;
  try {
    const response = await fetch(`${ENDPOINT}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gemini convert-unit error:", response.status, errorText);
      return NextResponse.json(
        { error: "Unit conversion failed." },
        { status: 502 }
      );
    }

    const data = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const jsonText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!jsonText) {
      return NextResponse.json({ error: "No response from AI." }, { status: 502 });
    }

    result = JSON.parse(jsonText) as GeminiResponse;
  } catch (err) {
    console.error("convert-unit internal error:", err);
    return NextResponse.json(
      { error: "Unit conversion failed." },
      { status: 500 }
    );
  }

  if (result.confidence !== "high" || !result.factor || result.factor <= 0) {
    return NextResponse.json(
      { error: "Could not confidently convert this unit.", confidence: "low" },
      { status: 422 }
    );
  }

  return NextResponse.json({ factor: result.factor });
}
