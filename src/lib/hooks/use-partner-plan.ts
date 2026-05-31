"use client";

import { useEffect, useMemo, useState } from "react";
import { useHousehold } from "@/lib/contexts/household-context";
import {
  subscribeToActiveInstance,
  subscribeToAdhocInstancesReadOnly,
  getWindowMondaysISO,
} from "@/lib/firebase/meal-plans";
import type { PlanInstance } from "@/lib/types/meal-plan";

/**
 * Subscribes to the partner's meal plan (active instance + freestyle weeks)
 * read-only, mirroring the shape `useActivePlan` / `useAdhocWeek` expose for the
 * current user. Returns empty data when there is no partner.
 */
export function usePartnerPlan() {
  const { partnerUid, partnerName } = useHousehold();
  const [instance, setInstance] = useState<PlanInstance | null>(null);
  const [instanceMap, setInstanceMap] = useState<Map<string, PlanInstance>>(
    new Map()
  );

  const windowMondaysISO = useMemo(() => getWindowMondaysISO(), []);

  useEffect(() => {
    if (!partnerUid) {
      setInstance(null);
      return;
    }
    const unsub = subscribeToActiveInstance(partnerUid, setInstance);
    return unsub;
  }, [partnerUid]);

  useEffect(() => {
    if (!partnerUid) {
      setInstanceMap(new Map());
      return;
    }
    const unsub = subscribeToAdhocInstancesReadOnly(partnerUid, setInstanceMap);
    return unsub;
  }, [partnerUid]);

  const adhocWeeks: (PlanInstance | null)[] = useMemo(
    () => windowMondaysISO.map((monday) => instanceMap.get(monday) ?? null),
    [instanceMap, windowMondaysISO]
  );

  return { partnerUid, partnerName, instance, adhocWeeks };
}
