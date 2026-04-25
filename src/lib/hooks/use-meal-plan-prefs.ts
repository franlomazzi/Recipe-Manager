"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/lib/contexts/auth-context";
import {
  subscribeMealPlanPrefs,
  setForceShowCategory,
  type MealPlanPrefs,
} from "@/lib/firebase/meal-plan-prefs";

export function useMealPlanPrefs() {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<MealPlanPrefs>({ forceShowCategories: [] });

  useEffect(() => {
    if (!user) return;
    return subscribeMealPlanPrefs(user.uid, setPrefs);
  }, [user]);

  const toggleForceShow = useCallback(
    (category: string, on: boolean) => {
      if (!user) return;
      setForceShowCategory(user.uid, category, on);
    },
    [user]
  );

  const forceShow = new Set(prefs.forceShowCategories);

  return { forceShow, toggleForceShow };
}
