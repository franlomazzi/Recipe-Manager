"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/contexts/auth-context";
import { useHousehold } from "@/lib/contexts/household-context";
import {
  subscribeToHouseholdShoppingLocations,
  subscribeToHouseholdIngredientCategories,
} from "@/lib/firebase/shopping-organization";
import type {
  ShoppingLocation,
  IngredientCategoryDef,
} from "@/lib/types/shopping-organization";

export function useShoppingOrganization() {
  const { user } = useAuth();
  const { partnerUid } = useHousehold();
  const [locations, setLocations] = useState<ShoppingLocation[]>([]);
  const [categories, setCategories] = useState<IngredientCategoryDef[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLocations([]);
      setCategories([]);
      setLoading(false);
      return;
    }
    let locLoaded = false;
    let catLoaded = false;
    const updateLoading = () => {
      if (locLoaded && catLoaded) setLoading(false);
    };
    const u1 = subscribeToHouseholdShoppingLocations(
      user.uid,
      partnerUid,
      (locs) => {
        setLocations(locs);
        locLoaded = true;
        updateLoading();
      }
    );
    const u2 = subscribeToHouseholdIngredientCategories(
      user.uid,
      partnerUid,
      (cats) => {
        setCategories(cats);
        catLoaded = true;
        updateLoading();
      }
    );
    return () => {
      u1();
      u2();
    };
  }, [user, partnerUid]);

  return { locations, categories, loading };
}
