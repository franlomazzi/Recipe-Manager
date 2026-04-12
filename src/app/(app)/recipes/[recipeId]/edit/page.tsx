"use client";

import { useParams, useSearchParams } from "next/navigation";
import { useState, useEffect } from "react";
import { useRecipe } from "@/lib/hooks/use-recipe";
import { subscribeToCookLogs } from "@/lib/firebase/firestore";
import { RecipeForm } from "@/components/recipe/recipe-form";
import { Loader2 } from "lucide-react";
import type { CookLog } from "@/lib/types/recipe";

export default function EditRecipePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const recipeId = params.recipeId as string;
  const { recipe, loading } = useRecipe(recipeId);
  const [cookLogs, setCookLogs] = useState<CookLog[]>([]);

  const applyImprovements = searchParams.get("applyImprovements") === "true";

  useEffect(() => {
    if (!recipeId || !applyImprovements) return;
    return subscribeToCookLogs(recipeId, setCookLogs);
  }, [recipeId, applyImprovements]);

  const unappliedImprovements = cookLogs.filter(
    (log) => log.improvements?.trim() && log.appliedToVersion === null
  );

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!recipe) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-muted-foreground">Recipe not found</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl 2xl:max-w-4xl p-4 md:p-6 lg:p-8">
      <h1 className="mb-6 text-2xl font-bold tracking-tight">Edit Recipe</h1>
      <RecipeForm
        recipe={recipe}
        improvements={applyImprovements ? unappliedImprovements : undefined}
      />
    </div>
  );
}
