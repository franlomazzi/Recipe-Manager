"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/lib/contexts/auth-context";
import {
  subscribeToAdhocInstance,
  createAdhocInstance,
} from "@/lib/firebase/meal-plans";
import type { PlanInstance } from "@/lib/types/meal-plan";

export function useAdhocWeek() {
  const { user } = useAuth();
  const [adhocInstance, setAdhocInstance] = useState<PlanInstance | null>(null);
  const [loading, setLoading] = useState(true);
  const pendingCreate = useRef<Promise<PlanInstance> | null>(null);

  useEffect(() => {
    if (!user) {
      setAdhocInstance(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = subscribeToAdhocInstance(user.uid, (inst) => {
      setAdhocInstance(inst);
      setLoading(false);
    });
    return unsub;
  }, [user]);

  const ensureAdhocInstance = useCallback(async (): Promise<PlanInstance> => {
    if (adhocInstance) return adhocInstance;
    if (pendingCreate.current) return pendingCreate.current;
    const p = createAdhocInstance(user!.uid);
    pendingCreate.current = p;
    const result = await p;
    pendingCreate.current = null;
    return result;
  }, [adhocInstance, user]);

  return { adhocInstance, loading, ensureAdhocInstance };
}
