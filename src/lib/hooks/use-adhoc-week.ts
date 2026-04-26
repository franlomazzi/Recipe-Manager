"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useAuth } from "@/lib/contexts/auth-context";
import {
  subscribeToAdhocInstances,
  createAdhocInstance,
  updateInstanceDay,
  getWindowMondaysISO,
} from "@/lib/firebase/meal-plans";
import type { PlanInstance, PlanDay } from "@/lib/types/meal-plan";

export function useAdhocWeek() {
  const { user } = useAuth();
  const [instanceMap, setInstanceMap] = useState<Map<string, PlanInstance>>(new Map());
  const [loading, setLoading] = useState(true);

  // Stable 4-week window — computed once on mount (changes only at Monday midnight)
  const windowMondaysISO = useMemo(() => getWindowMondaysISO(), []);

  useEffect(() => {
    if (!user) {
      setInstanceMap(new Map());
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = subscribeToAdhocInstances(user.uid, (map) => {
      setInstanceMap(map);
      setLoading(false);
    });
    return unsub;
  }, [user]);

  // One entry per window week; null means no doc yet (no meals added)
  const adhocWeeks: (PlanInstance | null)[] = useMemo(
    () => windowMondaysISO.map((monday) => instanceMap.get(monday) ?? null),
    [instanceMap, windowMondaysISO]
  );

  /**
   * Write a day update for a given week index within the 4-week window.
   * Creates the Firestore doc lazily — only when adding a meal (meals.length > 0).
   */
  const updateAdhocDay = useCallback(
    async (weekIndex: number, dayIndex: number, updatedDay: PlanDay) => {
      if (!user) return;
      const mondayISO = windowMondaysISO[weekIndex];
      const existing = instanceMap.get(mondayISO);

      if (existing) {
        await updateInstanceDay(existing.id, 0, dayIndex, updatedDay);
      } else if (updatedDay.meals.length > 0) {
        const newInstance = await createAdhocInstance(user.uid, mondayISO);
        await updateInstanceDay(newInstance.id, 0, dayIndex, updatedDay);
      }
    },
    [user, instanceMap, windowMondaysISO]
  );

  return { adhocWeeks, loading, updateAdhocDay };
}
