"use client";

import { useEffect, useRef, useState } from "react";
import { getAuth } from "@/lib/firebase/config";
import {
  getMealCombo,
  comboKeyFor,
  type MealCombo,
} from "@/lib/firebase/meal-combos";
import { generateMealCombo } from "@/lib/services/meal-combo-service";

// Module-level caches shared across every cell so the same combo (e.g. the
// steak+salad+potatoes plate that recurs all week) is fetched/generated once.
const resultCache = new Map<string, MealCombo | null>();
const inflight = new Map<string, Promise<MealCombo>>();
// Combos whose auto-generation failed this session. Prevents an endless retry
// loop (and repeated Imagen charges) when generation can't complete — e.g. the
// recipe_meal_combos Firestore rule isn't deployed yet. A manual `regenerate()`
// clears the flag so the user can try again on demand.
const failed = new Set<string>();

interface UseMealComboArgs {
  /** The category's component recipe ids (a combo needs ≥ 2). */
  mealIds: string[];
  /** Component recipe titles, used by the AI to name/draw the plate. */
  titles: string[];
  category?: string;
  /** Gate: only resolve/generate when true (e.g. multi-recipe mode + ≥2 ids). */
  enabled: boolean;
  /** Auto-generate the image when missing (vs. waiting for a manual trigger). */
  autoGenerate: boolean;
}

export function useMealCombo({
  mealIds,
  titles,
  category,
  enabled,
  autoGenerate,
}: UseMealComboArgs) {
  const [combo, setCombo] = useState<MealCombo | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Latest args without retriggering the effect on every render.
  const argsRef = useRef({ mealIds, titles, category });
  argsRef.current = { mealIds, titles, category };

  const key = enabled && mealIds.length >= 2 ? comboKeyFor(mealIds) : "";

  useEffect(() => {
    if (!key) {
      setCombo(null);
      setError(null);
      return;
    }
    const uid = getAuth().currentUser?.uid;
    if (!uid) return;
    const cacheKey = `${uid}_${key}`;
    let cancelled = false;

    async function resolve(uid: string) {
      // 1. In-memory cache.
      if (resultCache.has(cacheKey)) {
        const cached = resultCache.get(cacheKey) ?? null;
        if (!cancelled) setCombo(cached);
        if (cached || !autoGenerate) return;
      } else {
        // 2. Firestore lookup.
        let existing: MealCombo | null = null;
        try {
          existing = await getMealCombo(uid, argsRef.current.mealIds);
        } catch {
          // fall through to generation / empty
        }
        if (cancelled) return;
        resultCache.set(cacheKey, existing);
        setCombo(existing);
        if (existing || !autoGenerate) return;
      }

      // 3. Generate once (single-flight across all subscribers).
      // Don't retry a combo that already failed this session.
      if (failed.has(cacheKey)) return;
      if (!cancelled) setGenerating(true);
      try {
        let p = inflight.get(cacheKey);
        if (!p) {
          const { mealIds: ids, titles: t, category: c } = argsRef.current;
          p = generateMealCombo(uid, ids, t, c);
          inflight.set(cacheKey, p);
        }
        const made = await p;
        inflight.delete(cacheKey);
        resultCache.set(cacheKey, made);
        if (!cancelled) setCombo(made);
      } catch (e) {
        inflight.delete(cacheKey);
        failed.add(cacheKey);
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to generate photo");
        }
      } finally {
        if (!cancelled) setGenerating(false);
      }
    }

    void resolve(uid);
    return () => {
      cancelled = true;
    };
  }, [key, autoGenerate]);

  /** Force a fresh image for the same components, overwriting the cache/doc. */
  async function regenerate() {
    const uid = getAuth().currentUser?.uid;
    if (!uid || !key) return;
    const cacheKey = `${uid}_${key}`;
    failed.delete(cacheKey); // allow a fresh attempt
    setError(null);
    setGenerating(true);
    try {
      const { mealIds: ids, titles: t, category: c } = argsRef.current;
      const made = await generateMealCombo(uid, ids, t, c);
      resultCache.set(cacheKey, made);
      setCombo(made);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate photo");
    } finally {
      setGenerating(false);
    }
  }

  return { combo, generating, error, regenerate };
}
