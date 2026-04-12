"use client";

import { useEffect, useState } from "react";
import { useHousehold } from "@/lib/contexts/household-context";
import {
  emptyPantryState,
  subscribeToHouseholdPantryState,
} from "@/lib/firebase/household-pantry";
import type { HouseholdPantryState } from "@/lib/types/household";

export function useHouseholdPantryState() {
  const { householdId } = useHousehold();
  const [state, setState] = useState<HouseholdPantryState>(emptyPantryState);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!householdId) {
      setState(emptyPantryState());
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = subscribeToHouseholdPantryState(householdId, (s) => {
      setState(s);
      setLoading(false);
    });
    return unsub;
  }, [householdId]);

  return { state, loading, householdId };
}
