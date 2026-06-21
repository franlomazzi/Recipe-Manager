"use client";

import { useEffect, useMemo, useState } from "react";
import { parseISO } from "date-fns";
import { useAuth } from "@/lib/contexts/auth-context";
import { useAppData } from "@/lib/contexts/app-data-context";
import { useRecipes } from "./use-recipes";
import { useIngredientLibrary } from "./use-ingredient-library";
import { weeklyConsumptionCost } from "./use-shopping-list";
import { subscribeToShoppingListState } from "@/lib/firebase/shopping-list";
import { isoWeekKey, isoWeekKeyForOffset } from "@/lib/utils/week-keys";
import type { ExtraRecipeEntry } from "@/lib/types/shopping-list";

export interface WeeklyGroceryCost {
  /** Mean consumption cost across the counted weeks. */
  average: number;
  /** How many planned weeks (with at least one meal) went into the average. */
  weeksCounted: number;
  /** Per-week totals, in plan order — handy for a breakdown or sparkline. */
  perWeek: { label: string; total: number }[];
  /** Where the figure came from: the recurring plan, freestyle weeks, or nothing. */
  basis: "plan" | "freestyle" | "none";
  loading: boolean;
}

/**
 * Average weekly grocery cost based on what the meal plan actually consumes.
 * Each week's cost is proportional to the ingredients its recipes use, so
 * bulk-buying never distorts a single week, and items not bought weekly are
 * handled for free. Averages only weeks that have meals planned.
 */
export function useWeeklyGroceryCost(): WeeklyGroceryCost {
  const { user } = useAuth();
  const { recipes, loading: recipesLoading } = useRecipes();
  const { items: libraryItems } = useIngredientLibrary();
  const { instance, adhocWeeks, planLoading, adhocLoading } = useAppData();

  const [extraByWeek, setExtraByWeek] = useState<
    Record<string, ExtraRecipeEntry[]>
  >({});

  useEffect(() => {
    if (!user) return;
    return subscribeToShoppingListState(user.uid, (s) =>
      setExtraByWeek(s?.extraByWeek ?? {})
    );
  }, [user]);

  const recipesMap = useMemo(
    () => new Map(recipes.map((r) => [r.id, r])),
    [recipes]
  );
  const libraryMap = useMemo(
    () => new Map(libraryItems.map((li) => [li.id, li])),
    [libraryItems]
  );
  const recipeServings = useMemo(
    () => new Map(recipes.map((r) => [r.id, r.servings || 1])),
    [recipes]
  );

  return useMemo<WeeklyGroceryCost>(() => {
    const perWeek: { label: string; total: number }[] = [];

    const evalWeek = (
      inst: Parameters<typeof weeklyConsumptionCost>[0],
      offset: number,
      isoKey: string,
      label: string
    ) => {
      const extras = extraByWeek[isoKey] ?? [];
      const { total, mealCount } = weeklyConsumptionCost(
        inst,
        offset,
        recipesMap,
        libraryMap,
        recipeServings,
        extras
      );
      if (mealCount > 0) perWeek.push({ label, total });
    };

    let basis: WeeklyGroceryCost["basis"] = "none";

    if (instance) {
      basis = "plan";
      for (let o = 0; o < instance.snapshot.length; o++) {
        evalWeek(
          instance,
          o,
          isoWeekKeyForOffset(instance.startDate, o),
          `Week ${o + 1}`
        );
      }
    } else {
      const present = adhocWeeks.filter((w) => w != null);
      if (present.length > 0) basis = "freestyle";
      for (const w of present) {
        if (!w) continue;
        evalWeek(w, 0, isoWeekKey(parseISO(w.startDate)), w.startDate);
      }
    }

    const weeksCounted = perWeek.length;
    const sum = perWeek.reduce((s, w) => s + w.total, 0);
    const average = weeksCounted > 0 ? sum / weeksCounted : 0;

    return {
      average,
      weeksCounted,
      perWeek,
      basis: weeksCounted > 0 ? basis : "none",
      loading: recipesLoading || planLoading || adhocLoading,
    };
  }, [
    instance,
    adhocWeeks,
    extraByWeek,
    recipesMap,
    libraryMap,
    recipeServings,
    recipesLoading,
    planLoading,
    adhocLoading,
  ]);
}
