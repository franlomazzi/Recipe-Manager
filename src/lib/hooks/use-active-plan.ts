"use client";

import { useAppData } from "@/lib/contexts/app-data-context";

export function useActivePlan() {
  const { instance, planLoading: loading, todayIndices } = useAppData();
  return { instance, loading, todayIndices };
}
