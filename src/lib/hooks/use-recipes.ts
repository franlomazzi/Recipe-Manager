"use client";

import { useEffect, useState } from "react";
import { subscribeToRecipes } from "@/lib/firebase/firestore";
import { useAuth } from "@/lib/contexts/auth-context";
import { useHousehold } from "@/lib/contexts/household-context";
import type { Recipe } from "@/lib/types/recipe";

export function useRecipes() {
  const { user } = useAuth();
  const { partnerUid } = useHousehold();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setRecipes([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsubscribe = subscribeToRecipes(user.uid, partnerUid, (data) => {
      setRecipes(data);
      setLoading(false);
    });

    return unsubscribe;
  }, [user, partnerUid]);

  return { recipes, loading };
}
