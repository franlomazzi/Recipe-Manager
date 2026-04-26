"use client";

import type { Step } from "@/lib/types/recipe";
import type { User } from "firebase/auth";

export async function fetchScaledInstructions(
  steps: Step[],
  multiplier: number,
  user: User | null,
  recipeId: string,
  onSuccess: (recipeId: string, map: Record<string, string>) => void
): Promise<void> {
  if (!user || multiplier === 1 || steps.length === 0) return;
  try {
    const token = await user.getIdToken();
    const res = await fetch("/api/scale-step-instructions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        steps: steps.map((s) => ({ id: s.id, instruction: s.instruction })),
        multiplier,
      }),
    });
    if (!res.ok) throw new Error(`scale-step-instructions ${res.status}`);
    const data = (await res.json()) as {
      steps?: Array<{ id: string; scaledInstruction: string }>;
    };
    if (!Array.isArray(data.steps)) throw new Error("invalid response");
    const map: Record<string, string> = {};
    for (const item of data.steps) {
      map[item.id] = item.scaledInstruction;
    }
    onSuccess(recipeId, map);
  } catch (err) {
    console.warn("[cook] step instruction scaling failed, using originals:", err);
  }
}
