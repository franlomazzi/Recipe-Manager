// Server-only: asks Gemini to rewrite recipe step instructions with quantities
// scaled by the given multiplier. Returns a map of stepId → scaled instruction.
//
// Only numerical ingredient quantities are scaled — time durations, temperatures,
// and non-ingredient counts are left unchanged.

const MODEL = "gemini-3-flash-preview";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const TIMEOUT_MS = 30_000;

export class StepScalerError extends Error {
  status: number;
  constructor(message: string, status = 500) {
    super(message);
    this.status = status;
  }
}

export interface StepScalerInput {
  id: string;
  instruction: string;
}

export interface StepScalerResult {
  id: string;
  scaledInstruction: string;
}

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    steps: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          id: {
            type: "STRING",
            description: "Must match one of the input step ids exactly.",
          },
          scaledInstruction: {
            type: "STRING",
            description: "The instruction text with ingredient quantities scaled.",
          },
        },
        required: ["id", "scaledInstruction"],
      },
    },
  },
  required: ["steps"],
} as const;

const SYSTEM_PROMPT = `You scale ingredient quantities in recipe step instructions for a cooking app.

You receive a list of steps (id + instruction text) and a numeric multiplier. For each step, return the instruction text with every ingredient quantity scaled by the multiplier.

Rules:
- Scale ONLY numeric quantities that represent amounts of ingredients or volumes (e.g. "200 grams", "2 tbsp", "3 large eggs", "1/2 cup", "2–3 cloves").
- Do NOT scale time durations ("bake for 30 minutes", "rest for 5 minutes", "beat for 2 minutes") — these are process times, not quantities.
- Do NOT scale temperatures ("180°C", "350°F", "medium heat").
- Do NOT scale non-ingredient counts ("2 pans", "3 layers", "a baking sheet").
- Preserve all other words, punctuation, and phrasing exactly — do not rewrite, summarise, or improve.
- For fractions: compute the scaled value and express it as a clean fraction or decimal (e.g. 0.5 → "½", 0.25 → "¼", 1.5 → "1½", 0.333 → "⅓", 0.75 → "¾").
- For ranges ("2–3 cloves"), scale both numbers.
- If a step has no quantities to scale, return the instruction unchanged.
- Use ONLY the id values from the input. Every input step MUST appear in the output exactly once.

Return ONLY the structured JSON. No prose.`;

export async function scaleStepInstructions(
  steps: StepScalerInput[],
  multiplier: number
): Promise<StepScalerResult[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new StepScalerError("Step scaling is not configured on the server.", 500);
  }
  if (!steps.length) {
    throw new StepScalerError("No steps to scale.", 400);
  }
  if (!Number.isFinite(multiplier) || multiplier <= 0 || multiplier === 1) {
    throw new StepScalerError("Invalid multiplier.", 400);
  }

  const userMessage =
    `Multiplier: ${multiplier}\n\n` +
    `Steps (JSON):\n${JSON.stringify(steps, null, 2)}\n\n` +
    `Scale the quantities in each instruction and return the result.`;

  const body = {
    contents: [{ role: "user", parts: [{ text: userMessage }] }],
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
      temperature: 0,
      thinkingConfig: { thinkingBudget: 0 },
    },
  };

  const response = await fetch(`${ENDPOINT}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Gemini step-scaler error:", response.status, errorText);
    throw new StepScalerError(
      "The AI couldn't scale step instructions. Try again.",
      response.status >= 500 ? 502 : 400
    );
  }

  const data = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const jsonText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!jsonText) {
    throw new StepScalerError("Gemini returned no content.", 502);
  }

  let parsed: { steps?: StepScalerResult[] };
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new StepScalerError("Gemini returned malformed JSON.", 502);
  }
  if (!parsed.steps || !Array.isArray(parsed.steps)) {
    throw new StepScalerError("Gemini response missing steps.", 502);
  }

  return sanitize(parsed.steps, steps);
}

// Ensure every input step is present in the output, with a valid string instruction.
// Unknown ids are dropped; missing steps fall back to the original instruction.
function sanitize(
  results: StepScalerResult[],
  inputs: StepScalerInput[]
): StepScalerResult[] {
  const inputById = new Map(inputs.map((s) => [s.id, s]));
  const resultById = new Map(
    results
      .filter((r) => inputById.has(r.id) && typeof r.scaledInstruction === "string")
      .map((r) => [r.id, r])
  );

  return inputs.map((input) => {
    const result = resultById.get(input.id);
    return {
      id: input.id,
      scaledInstruction: result?.scaledInstruction ?? input.instruction,
    };
  });
}
