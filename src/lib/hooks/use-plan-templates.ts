"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/contexts/auth-context";
import { subscribeToTemplates } from "@/lib/firebase/meal-plans";
import type { PlanTemplate } from "@/lib/types/meal-plan";

export function usePlanTemplates() {
  const { user } = useAuth();
  const [templates, setTemplates] = useState<PlanTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setTemplates([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = subscribeToTemplates(user.uid, (items) => {
      setTemplates(items);
      setLoading(false);
    });
    return unsub;
  }, [user]);

  return { templates, loading };
}
