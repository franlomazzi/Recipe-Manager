"use client";

import { useAppData } from "@/lib/contexts/app-data-context";

export function useAdhocWeek() {
  const { adhocWeeks, adhocLoading: loading, updateAdhocDay } = useAppData();
  return { adhocWeeks, loading, updateAdhocDay };
}
