"use client";

import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/lib/contexts/auth-context";
import { useHousehold } from "@/lib/contexts/household-context";
import { subscribeToUserWithSharedPantry } from "@/lib/firebase/ingredient-library";
import type { LibraryIngredient } from "@/lib/types/recipe";

export function useIngredientLibrary() {
  const { user } = useAuth();
  const { partnerUid } = useHousehold();
  const [items, setItems] = useState<LibraryIngredient[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = subscribeToUserWithSharedPantry(
      user.uid,
      partnerUid,
      (ingredients) => {
        setItems(ingredients);
        setLoading(false);
      }
    );
    return unsub;
  }, [user, partnerUid]);

  const search = useMemo(() => {
    return (term: string): LibraryIngredient[] => {
      if (!term.trim()) return items;
      const lower = term.toLowerCase();
      return items.filter((i) => i.name.toLowerCase().includes(lower));
    };
  }, [items]);

  return { items, loading, search };
}
