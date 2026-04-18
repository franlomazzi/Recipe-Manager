"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { RecipeForm } from "@/components/recipe/recipe-form";
import {
  consumeImportDraft,
  draftToRecipeForForm,
} from "@/lib/utils/session-draft";
import type { Recipe } from "@/lib/types/recipe";

export default function NewRecipePage() {
  const params = useSearchParams();
  const fromImport = params.get("from") === "import";

  // `undefined` = we haven't decided yet (still reading sessionStorage on
  // mount); `null` = no draft, render a blank form; `Recipe` = pre-fill.
  // The three-state dance prevents a flash of empty form before hydration
  // when arriving via ?from=import.
  const [draftRecipe, setDraftRecipe] = useState<Recipe | null | undefined>(
    fromImport ? undefined : null
  );
  // React Strict Mode (enabled by default in Next 16 dev) runs effects twice
  // on mount. consumeImportDraft clears sessionStorage on first read, so the
  // second run would stomp the hydrated draft back to null. This ref makes
  // the consumption idempotent for the page's lifetime.
  const hasConsumed = useRef(false);

  useEffect(() => {
    if (!fromImport) return;
    if (hasConsumed.current) return;
    hasConsumed.current = true;
    const draft = consumeImportDraft();
    setDraftRecipe(draft ? draftToRecipeForForm(draft) : null);
  }, [fromImport]);

  if (draftRecipe === undefined) {
    return (
      <div className="mx-auto max-w-3xl 2xl:max-w-4xl p-4 md:p-6 lg:p-8">
        <h1 className="mb-6 text-2xl font-bold tracking-tight">New Recipe</h1>
        <p className="text-sm text-muted-foreground">Preparing imported recipe…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl 2xl:max-w-4xl p-4 md:p-6 lg:p-8">
      <h1 className="mb-6 text-2xl font-bold tracking-tight">
        {draftRecipe ? "Review imported recipe" : "New Recipe"}
      </h1>
      <RecipeForm
        recipe={draftRecipe ?? undefined}
        needsIngredientReview={fromImport && !!draftRecipe}
      />
    </div>
  );
}
