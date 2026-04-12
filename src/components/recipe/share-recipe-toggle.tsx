"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Share2, Users } from "lucide-react";
import { setRecipeShared } from "@/lib/firebase/firestore";
import { useHousehold } from "@/lib/contexts/household-context";
import { toast } from "sonner";

interface ShareRecipeToggleProps {
  recipeId: string;
  shared: boolean;
  /** When false, the toggle is hidden (e.g. solo user with no partner). */
  visible?: boolean;
}

export function ShareRecipeToggle({
  recipeId,
  shared,
  visible = true,
}: ShareRecipeToggleProps) {
  const { partnerName } = useHousehold();
  const [busy, setBusy] = useState(false);

  if (!visible) return null;

  async function toggle() {
    setBusy(true);
    try {
      await setRecipeShared(recipeId, !shared);
      toast.success(shared ? "Removed from household" : "Shared with household");
    } catch {
      toast.error("Failed to update sharing");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      variant={shared ? "default" : "outline"}
      size="sm"
      className="rounded-xl"
      onClick={toggle}
      disabled={busy}
      title={
        shared
          ? `Stop sharing with ${partnerName ?? "your partner"}`
          : `Share with ${partnerName ?? "your partner"}`
      }
    >
      {busy ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : shared ? (
        <Users className="mr-2 h-4 w-4" />
      ) : (
        <Share2 className="mr-2 h-4 w-4" />
      )}
      {shared ? "Shared" : "Share"}
    </Button>
  );
}
