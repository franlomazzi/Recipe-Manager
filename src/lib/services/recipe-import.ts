// Client-side helpers for /api/import-recipe and /api/translate-recipe.
// Mirrors the gemini-service.ts pattern: pull a fresh Firebase ID token from
// the active account, attach it as a bearer, let the server route burn the
// Gemini quota on our behalf.

import { getAuth } from "@/lib/firebase/config";
import type {
  DraftRecipe,
  ImportRecipeResponse,
  ImportSource,
} from "@/lib/types/import";

export async function importRecipe(source: ImportSource): Promise<DraftRecipe> {
  const currentUser = getAuth().currentUser;
  if (!currentUser) {
    throw new Error("You must be signed in to import recipes.");
  }
  const idToken = await currentUser.getIdToken();

  const response = await fetch("/api/import-recipe", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ source }),
  });

  if (!response.ok) {
    let message = "Failed to import recipe.";
    try {
      const err = await response.json();
      if (typeof err?.error === "string") message = err.error;
    } catch {
      // fall through
    }
    throw new Error(message);
  }

  const data = (await response.json()) as ImportRecipeResponse;
  if (!data?.draft) throw new Error("Import returned no draft.");
  return data.draft;
}

export async function translateImportedRecipe(
  draft: DraftRecipe,
  targetLanguage: "en" | "es"
): Promise<DraftRecipe> {
  const currentUser = getAuth().currentUser;
  if (!currentUser) {
    throw new Error("You must be signed in to translate recipes.");
  }
  const idToken = await currentUser.getIdToken();

  const response = await fetch("/api/translate-recipe", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ draft, targetLanguage }),
  });

  if (!response.ok) {
    let message = "Translation failed.";
    try {
      const err = await response.json();
      if (typeof err?.error === "string") message = err.error;
    } catch {
      // fall through
    }
    throw new Error(message);
  }

  const data = (await response.json()) as ImportRecipeResponse;
  if (!data?.draft) throw new Error("Translation returned no draft.");
  return data.draft;
}
