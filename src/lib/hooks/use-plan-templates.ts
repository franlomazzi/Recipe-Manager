"use client";

import { useAppData } from "@/lib/contexts/app-data-context";

export function usePlanTemplates() {
  const { templates, templatesLoading: loading } = useAppData();
  return { templates, loading };
}
