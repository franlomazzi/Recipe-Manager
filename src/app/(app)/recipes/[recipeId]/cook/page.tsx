"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { useRecipe } from "@/lib/hooks/use-recipe";
import { getCookLogs } from "@/lib/firebase/firestore";
import { useCookingSession } from "@/lib/contexts/cooking-session-context";
import { useAuth } from "@/lib/contexts/auth-context";
import { fetchScaledInstructions } from "@/lib/cooking/fetch-scaled-instructions";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function CookPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const recipeId = params.recipeId as string;
  const { recipe, loading } = useRecipe(recipeId);
  const { sessions, addSession, setActiveSession, setScaledInstructions } = useCookingSession();
  const { user } = useAuth();
  const hasHandled = useRef(false);

  useEffect(() => {
    if (!recipe || hasHandled.current) return;
    hasHandled.current = true;

    const existing = sessions.find((s) => s.recipeId === recipe.id);
    if (existing) {
      setActiveSession(recipe.id);
      router.replace("/cook");
      return;
    }

    // Read chosen servings from query param, fall back to recipe default
    const servingsParam = searchParams.get("servings");
    const chosenServings = servingsParam ? parseFloat(servingsParam) : recipe.servings;
    const servingMultiplier = chosenServings / recipe.servings;

    getCookLogs(recipe.id).then((cookLogs) => {
      addSession(recipe, cookLogs, servingMultiplier);
      setActiveSession(recipe.id);
      if (servingMultiplier !== 1 && recipe.steps.length > 0) {
        fetchScaledInstructions(recipe.steps, servingMultiplier, user, recipe.id, setScaledInstructions);
      }
      router.replace("/cook");
    });
  }, [recipe, sessions, addSession, setActiveSession, setScaledInstructions, user, router, searchParams]);

  if (loading || !recipe) {
    return (
      <div className="flex h-screen items-center justify-center">
        {loading ? (
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        ) : (
          <div className="flex flex-col items-center gap-4">
            <p className="text-muted-foreground">Recipe not found</p>
            <Button variant="outline" render={<Link href="/recipes" />}>
              Back to Recipes
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-screen items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}
