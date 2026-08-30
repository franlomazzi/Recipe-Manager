"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { setRecipeHiddenFromList } from "@/lib/firebase/firestore";
import { toast } from "sonner";

interface HideRecipeToggleProps {
  recipeId: string;
  hidden: boolean;
  /** When false, the toggle is hidden (e.g. someone else's recipe). */
  visible?: boolean;
}

/**
 * Hides a recipe from the recipe library list. It stays available in the meal
 * plan picker, planned meals and shopping list — this only keeps it out of the
 * browse/cook list.
 */
export function HideRecipeToggle({
  recipeId,
  hidden,
  visible = true,
}: HideRecipeToggleProps) {
  const [busy, setBusy] = useState(false);

  if (!visible) return null;

  async function toggle() {
    setBusy(true);
    try {
      await setRecipeHiddenFromList(recipeId, !hidden);
      toast.success(hidden ? "Shown in recipe list" : "Hidden from recipe list");
    } catch {
      toast.error("Failed to update visibility");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      variant={hidden ? "default" : "outline"}
      size="sm"
      className="rounded-xl"
      onClick={toggle}
      disabled={busy}
      title={
        hidden
          ? "Show again in the recipe list"
          : "Hide from the recipe list (stays available in meal plans)"
      }
    >
      {busy ? (
        <Loader2 className="h-4 w-4 animate-spin sm:mr-2" />
      ) : hidden ? (
        <EyeOff className="h-4 w-4 sm:mr-2" />
      ) : (
        <Eye className="h-4 w-4 sm:mr-2" />
      )}
      <span className="hidden sm:inline">{hidden ? "Hidden" : "Hide"}</span>
    </Button>
  );
}
