"use client";

import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/lib/contexts/auth-context";
import { useHousehold } from "@/lib/contexts/household-context";
import { useHouseholdPantryState } from "@/lib/hooks/use-household-pantry-state";
import { subscribeToUserWithSharedPantry } from "@/lib/firebase/ingredient-library";
import type { LibraryIngredient } from "@/lib/types/recipe";

export function useIngredientLibrary() {
  const { user } = useAuth();
  const { partnerUid } = useHousehold();
  const { state: householdPantryState } = useHouseholdPantryState();
  const [merged, setMerged] = useState<LibraryIngredient[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setMerged([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = subscribeToUserWithSharedPantry(
      user.uid,
      partnerUid,
      (ingredients) => {
        setMerged(ingredients);
        setLoading(false);
      }
    );
    return unsub;
  }, [user, partnerUid]);

  // Only the partner's *household-scope* pantry items are shared into your
  // library. The `isPantryItem` flag on an ingredient doesn't distinguish
  // household from individual ("Personal") scope — that distinction lives in
  // the shared household pantry list (`pantryItemIds`). So we keep all of your
  // own items, but drop any partner-owned item that isn't in that shared list,
  // which keeps each person's individual pantry items private.
  const items = useMemo(() => {
    if (!user) return merged;
    const householdIds = new Set(householdPantryState.pantryItemIds);
    return merged.filter(
      (i) => i.userId === user.uid || householdIds.has(i.id)
    );
  }, [merged, user, householdPantryState.pantryItemIds]);

  const search = useMemo(() => {
    return (term: string): LibraryIngredient[] => {
      if (!term.trim()) return items;
      const lower = term.toLowerCase();
      return items.filter((i) => i.name.toLowerCase().includes(lower));
    };
  }, [items]);

  return { items, loading, search };
}
