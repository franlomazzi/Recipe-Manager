"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

/**
 * Returns true when the user has opted into the experimental "Kitchen Tool"
 * redesign (light or dark variant). Guards against hydration mismatch by
 * returning false on the server / first render.
 */
export function useKitchenTool(): boolean {
  const { theme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);
  if (!mounted) return false;

  const t = theme ?? resolvedTheme ?? "";
  return t === "kitchen-tool" || t === "kitchen-tool-dark";
}
