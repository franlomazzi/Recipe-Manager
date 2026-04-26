import { NextResponse } from "next/server";
import { verifyAuthorizedCaller } from "@/lib/firebase/admin";
import {
  scaleStepInstructions,
  StepScalerError,
  type StepScalerInput,
} from "@/lib/server/recipe-parsers/scale-step-instructions";

// POST /api/scale-step-instructions
//
// AUTH: Firebase ID token whose uid is whitelisted — same gate as the other
// Gemini-backed routes, so non-whitelisted callers can't burn quota.
//
// Body: { steps: { id: string; instruction: string }[]; multiplier: number }
// Returns: { steps: { id: string; scaledInstruction: string }[] }

const MAX_BODY_BYTES = 64 * 1024;

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

  let payload: { steps?: StepScalerInput[]; multiplier?: number };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!Array.isArray(payload.steps) || payload.steps.length === 0) {
    return NextResponse.json({ error: "Missing or empty steps array." }, { status: 400 });
  }
  if (typeof payload.multiplier !== "number" || !Number.isFinite(payload.multiplier)) {
    return NextResponse.json({ error: "Missing or invalid multiplier." }, { status: 400 });
  }
  if (payload.multiplier === 1) {
    return NextResponse.json({ error: "Multiplier must not be 1." }, { status: 400 });
  }

  try {
    const steps = await scaleStepInstructions(payload.steps, payload.multiplier);
    return NextResponse.json({ steps });
  } catch (err) {
    if (err instanceof StepScalerError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("scale-step-instructions internal error:", err);
    const message = err instanceof Error ? err.message : "Scaling failed unexpectedly.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
