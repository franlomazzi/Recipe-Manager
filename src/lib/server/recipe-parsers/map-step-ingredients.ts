// Server-only: asks Gemini to map recipe ingredients (with quantities) onto
// recipe steps based on each step's instruction text. Returns a structured
// per-step list of { ingredientId, quantity } allocations in the ingredient's
// stored unit.
//
// The caller is expected to be the recipe form; we do not modify the recipe —
// we just produce the mapping, which the client applies to its local state.

const MODEL = "gemini-2.5-flash";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const TIMEOUT_MS = 45_000;

export class StepMapperError extends Error {
  status: number;
  constructor(message: string, status = 500) {
    super(message);
    this.status = status;
  }
}

export interface StepMapperIngredientInput {
  id: string;
  name: string;
  quantity: number | null;
  unit: string;
  note?: string;
}

export interface StepMapperStepInput {
  id: string;
  order: number;
  instruction: string;
}

export interface StepMapperAllocation {
  ingredientId: string;
  quantity: number | null;
}

export interface StepMapperResult {
  stepId: string;
  ingredients: StepMapperAllocation[];
}

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    mappings: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          stepId: {
            type: "STRING",
            description: "The id of the step being mapped (must match an input step id exactly).",
          },
          ingredients: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                ingredientId: {
                  type: "STRING",
                  description: "Must match one of the input ingredient ids exactly.",
                },
                quantity: {
                  type: "NUMBER",
                  description:
                    "Amount of this ingredient used in this step, in the ingredient's stored unit. Use 0 for unmeasured ingredients (e.g. 'salt to taste') or when the step text gives no hint of an amount.",
                },
              },
              required: ["ingredientId", "quantity"],
            },
          },
        },
        required: ["stepId", "ingredients"],
      },
    },
  },
  required: ["mappings"],
} as const;

const SYSTEM_PROMPT = `You map recipe ingredients onto recipe steps for a cooking app.

You receive (1) a list of ingredients with ids, names, total quantities, and units, and (2) a list of steps with ids and instruction text. For each step, determine which ingredients are used and how much of each.

Rules:
- Use ONLY the ingredientId values from the input ingredients list. Never invent ids, rename ingredients, or introduce new ones.
- Use ONLY the stepId values from the input steps list. Every input step MUST appear in the output "mappings" array exactly once, even if it has no ingredients (empty "ingredients" array).
- Quantities are expressed in the ingredient's stored unit (the "unit" field from the input). If the step text says "2 tbsp of olive oil" but the ingredient is stored in ml, convert to ml (1 tbsp ≈ 15 ml). If a conversion is unclear, estimate proportionally from the total.
- Fractional references ("half the butter", "a third of the flour", "¼ cup of the sauce") must be computed from the ingredient's total quantity. "Half of 100 g" = 50.
- An ingredient that appears in exactly one step should be allocated its full total to that step.
- An ingredient split across multiple steps without explicit amounts should be divided based on the step text ("most of" → ~2/3, "a bit of" → small; otherwise split evenly among the mentioning steps).
- The sum of an ingredient's allocations across all steps MUST NOT exceed its total quantity. Prefer under-allocating over exceeding the total.
- Ingredients with quantity 0 or unmeasured items ("to taste", "for serving") should be allocated with quantity 0 in the steps where they appear.
- Decorative or optional ingredients that no step references should simply be omitted from the output.
- Steps with no cooking ingredients ("preheat the oven", "let the dough rest") should return an empty ingredients array.
- Only use ingredients that are clearly referenced by the step text (explicitly or via pronouns like "the sauce", "the dough"). Do not speculatively attach ingredients to steps.

Return ONLY the structured JSON. No prose.`;

export async function mapIngredientsToSteps(input: {
  ingredients: StepMapperIngredientInput[];
  steps: StepMapperStepInput[];
}): Promise<StepMapperResult[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new StepMapperError(
      "Step mapping is not configured on the server.",
      500
    );
  }
  if (!input.ingredients.length) {
    throw new StepMapperError("No ingredients to map.", 400);
  }
  if (!input.steps.length) {
    throw new StepMapperError("No steps to map.", 400);
  }

  const userMessage =
    `Ingredients (JSON):\n${JSON.stringify(input.ingredients, null, 2)}\n\n` +
    `Steps (JSON):\n${JSON.stringify(input.steps, null, 2)}\n\n` +
    `Produce the step-ingredient mapping as structured JSON matching the schema.`;

  const body = {
    contents: [{ role: "user", parts: [{ text: userMessage }] }],
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
      temperature: 0.1,
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
    console.error("Gemini step-mapper error:", response.status, errorText);
    throw new StepMapperError(
      "The AI couldn't map ingredients to steps. Try again.",
      response.status >= 500 ? 502 : 400
    );
  }

  const data = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const jsonText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!jsonText) {
    throw new StepMapperError("Gemini returned no content.", 502);
  }

  let parsed: { mappings?: StepMapperResult[] };
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new StepMapperError("Gemini returned malformed JSON.", 502);
  }
  if (!parsed.mappings || !Array.isArray(parsed.mappings)) {
    throw new StepMapperError("Gemini response missing mappings.", 502);
  }

  return sanitize(parsed.mappings, input);
}

// Defensive pass: drop unknown ids, normalize negative/NaN quantities to 0,
// convert 0 to null for ingredients whose total is null (so the form renders
// them as "no amount" instead of "0"), and proportionally scale down any
// ingredient whose total allocation exceeds the recipe total.
function sanitize(
  mappings: StepMapperResult[],
  input: { ingredients: StepMapperIngredientInput[]; steps: StepMapperStepInput[] }
): StepMapperResult[] {
  const ingredientById = new Map(input.ingredients.map((i) => [i.id, i]));
  const stepIds = new Set(input.steps.map((s) => s.id));

  // First pass: filter to known ids, coerce quantities.
  const cleaned: StepMapperResult[] = mappings
    .filter((m) => stepIds.has(m.stepId))
    .map((m) => ({
      stepId: m.stepId,
      ingredients: (m.ingredients ?? [])
        .filter((si) => ingredientById.has(si.ingredientId))
        .map((si) => {
          const ing = ingredientById.get(si.ingredientId)!;
          let q: number | null;
          if (typeof si.quantity !== "number" || !Number.isFinite(si.quantity) || si.quantity < 0) {
            q = ing.quantity === null ? null : 0;
          } else if (ing.quantity === null) {
            // No total on the source ingredient — store null so the form
            // shows "no amount" rather than forcing a fake number.
            q = null;
          } else {
            q = si.quantity;
          }
          return { ingredientId: si.ingredientId, quantity: q };
        }),
    }));

  // Ensure every input step appears in output (even if empty), so the client
  // can confidently overwrite every step's ingredients array.
  const byStepId = new Map(cleaned.map((m) => [m.stepId, m]));
  for (const step of input.steps) {
    if (!byStepId.has(step.id)) {
      cleaned.push({ stepId: step.id, ingredients: [] });
    }
  }

  // Second pass: clamp totals per ingredient. If the model over-allocated,
  // scale down proportionally so the sum fits within the recipe total.
  for (const ing of input.ingredients) {
    if (ing.quantity === null || ing.quantity <= 0) continue;
    let total = 0;
    for (const m of cleaned) {
      for (const si of m.ingredients) {
        if (si.ingredientId === ing.id && typeof si.quantity === "number") {
          total += si.quantity;
        }
      }
    }
    if (total > ing.quantity + 1e-6) {
      const scale = ing.quantity / total;
      for (const m of cleaned) {
        for (const si of m.ingredients) {
          if (si.ingredientId === ing.id && typeof si.quantity === "number") {
            si.quantity = Math.round(si.quantity * scale * 100) / 100;
          }
        }
      }
    }
  }

  return cleaned;
}
