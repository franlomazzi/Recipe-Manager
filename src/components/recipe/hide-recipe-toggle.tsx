"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { setRecipeHiddenFromList } from "@/lib/firebase/firestore";
import { setRecipeHiddenForUser } from "@/lib/firebase/user-recipe-prefs";
import { useAuth } from "@/lib/contexts/auth-context";
import { toast } from "sonner";

interface HideRecipeToggleProps {
  recipeId: string;
  hidden: boolean;
  /**
   * Whether the signed-in user created this recipe. Owners write the flag on
   * the recipe itself; everyone else hides it only from their own library.
   */
  isOwner: boolean;
  /**
   * Set when a partner's recipe is already hidden by its creator — nothing this
   * user toggles can bring it back, so the button is shown but inert.
   */
  lockedByOwner?: boolean;
  /** When false, the toggle is not rendered. */
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
  isOwner,
  lockedByOwner = false,
  visible = true,
}: HideRecipeToggleProps) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);

  if (!visible) return null;

  async function toggle() {
    if (!isOwner && !user) return;
    setBusy(true);
    try {
      if (isOwner) {
        await setRecipeHiddenFromList(recipeId, !hidden);
      } else {
        await setRecipeHiddenForUser(user!.uid, recipeId, !hidden);
      }
      toast.success(hidden ? "Shown in recipe list" : "Hidden from recipe list");
    } catch {
      toast.error("Failed to update visibility");
    } finally {
      setBusy(false);
    }
  }

  const title = lockedByOwner
    ? "Hidden by whoever shared this recipe"
    : hidden
      ? "Show again in your recipe list"
      : isOwner
        ? "Hide from the recipe list (stays available in meal plans)"
        : "Hide from your recipe list (stays available in meal plans)";

  return (
    <Button
      variant={hidden ? "default" : "outline"}
      size="sm"
      className="rounded-xl"
      onClick={toggle}
      disabled={busy || lockedByOwner}
      title={title}
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
