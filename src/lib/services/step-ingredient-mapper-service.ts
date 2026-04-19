// Client-side helper for /api/map-step-ingredients. Keeps the Gemini key
// server-side and attaches a Firebase ID token so the server can whitelist
// the caller.

import { getAuth } from "@/lib/firebase/config";

export interface MapStepIngredientsInput {
  ingredients: Array<{
    id: string;
    name: string;
    quantity: number | null;
    unit: string;
    note?: string;
  }>;
  steps: Array<{
    id: string;
    order: number;
    instruction: string;
  }>;
}

export interface MappedStep {
  stepId: string;
  ingredients: Array<{ ingredientId: string; quantity: number | null }>;
}

export async function mapStepIngredientsWithAI(
  input: MapStepIngredientsInput
): Promise<MappedStep[]> {
  const currentUser = getAuth().currentUser;
  if (!currentUser) {
    throw new Error("You must be signed in to use AI mapping.");
  }
  const idToken = await currentUser.getIdToken();

  const response = await fetch("/api/map-step-ingredients", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    let message = "Failed to map ingredients to steps";
    try {
      const errorData = await response.json();
      if (typeof errorData?.error === "string") message = errorData.error;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  const data = (await response.json()) as { mappings?: MappedStep[] };
  if (!data.mappings) {
    throw new Error("No mappings returned");
  }
  return data.mappings;
}
