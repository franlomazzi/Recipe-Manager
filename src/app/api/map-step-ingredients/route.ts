import { NextResponse } from "next/server";
import { verifyAuthorizedCaller } from "@/lib/firebase/admin";
import {
  mapIngredientsToSteps,
  StepMapperError,
  type StepMapperIngredientInput,
  type StepMapperStepInput,
} from "@/lib/server/recipe-parsers/map-step-ingredients";

// POST /api/map-step-ingredients
//
// AUTH: Firebase ID token whose uid is whitelisted — same gate as the other
// Gemini-backed routes, so non-whitelisted callers can't burn quota.
//
// Body: { ingredients: IngredientInput[]; steps: StepInput[] }
// Returns: { mappings: [{ stepId, ingredients: [{ ingredientId, quantity }] }] }

const MAX_BODY_BYTES = 128 * 1024;

export async function POST(req: Request) {
  try {
    await verifyAuthorizedCaller(req);
  } catch (err) {
    const status = (err as { status?: number }).status ?? 401;
    const message = err instanceof Error ? err.message : "Unauthorized";
    return NextResponse.json({ error: message }, { status });
  }

  const contentLength = Number(req.headers.get("content-length") ?? "0");
  if (contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Payload too large." }, { status: 413 });
  }

  let payload: {
    ingredients?: StepMapperIngredientInput[];
    steps?: StepMapperStepInput[];
  };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!Array.isArray(payload.ingredients) || !Array.isArray(payload.steps)) {
    return NextResponse.json(
      { error: "Missing ingredients or steps." },
      { status: 400 }
    );
  }

  try {
    const mappings = await mapIngredientsToSteps({
      ingredients: payload.ingredients,
      steps: payload.steps,
    });
    return NextResponse.json({ mappings });
  } catch (err) {
    if (err instanceof StepMapperError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("map-step-ingredients internal error:", err);
    const message =
      err instanceof Error ? err.message : "Mapping failed unexpectedly.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
