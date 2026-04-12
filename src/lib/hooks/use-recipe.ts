"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { getDb } from "@/lib/firebase/config";
import { firestoreDocToRecipe } from "@/lib/utils/meal-mapper";
import type { Recipe } from "@/lib/types/recipe";

export function useRecipe(recipeId: string | null) {
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!recipeId) {
      setRecipe(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsubscribe = onSnapshot(
      doc(getDb(), "nutrition_meals", recipeId),
      (snap) => {
        if (snap.exists()) {
          setRecipe(firestoreDocToRecipe(snap.id, snap.data()));
        } else {
          setRecipe(null);
        }
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [recipeId]);

  return { recipe, loading };
}
