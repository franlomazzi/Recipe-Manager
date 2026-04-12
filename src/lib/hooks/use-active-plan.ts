"use client";

import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/lib/contexts/auth-context";
import {
  subscribeToActiveInstance,
  getIndicesForDate,
} from "@/lib/firebase/meal-plans";
import type { PlanInstance } from "@/lib/types/meal-plan";

export function useActivePlan() {
  const { user } = useAuth();
  const [instance, setInstance] = useState<PlanInstance | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setInstance(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = subscribeToActiveInstance(user.uid, (inst) => {
      setInstance(inst);
      setLoading(false);
    });
    return unsub;
  }, [user]);

  const todayIndices = useMemo(() => {
    if (!instance) return null;
    return getIndicesForDate(instance, new Date());
  }, [instance]);

  return { instance, loading, todayIndices };
}
