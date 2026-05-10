"use client";

import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MemberAvatar } from "./member-avatar";
import type { Household, ProvenanceStamp } from "@/lib/types/household";
import type { PantryItem } from "@/lib/hooks/use-pantry-items";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Household-scope pantry items only. */
  pantryItems: PantryItem[];
  pantryCheckedIds: string[];
  pantryCheckedProvenance: Map<string, ProvenanceStamp | null>;
  partnerUid: string | null;
  household: Household | null;
  onConfirm: (opts: { addedHousehold: string[] }) => Promise<void>;
}

/**
 * Read-only confirmation dialog for the pantry → shopping-list commit step.
 *
 * Shows which items will be added, grouped by household/individual. Use the
 * pantry-check section (before opening this dialog) to mark items as "in stock".
 */
export function CommitPantryDialog({
  open,
  onOpenChange,
  pantryItems,
  pantryCheckedIds,
  pantryCheckedProvenance,
  partnerUid,
  household,
  onConfirm,
}: Props) {
  // All household-scope items that haven't been skipped yet.
  const candidates = useMemo(
    () => pantryItems.filter((p) => !pantryCheckedIds.includes(p.id)),
    [pantryItems, pantryCheckedIds]
  );

  // Items the partner already marked as "I have enough" — informational only.
  const partnerSkipped = useMemo(() => {
    if (!partnerUid) return [];
    return pantryItems.filter((p) => {
      const stamp = pantryCheckedProvenance.get(p.id);
      return !!stamp && stamp.uid === partnerUid;
    });
  }, [pantryItems, partnerUid, pantryCheckedProvenance]);

  const totalToAdd = candidates.length;

  async function handleSubmit() {
    onOpenChange(false);
    await onConfirm({ addedHousehold: candidates.map((p) => p.id) });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add to shopping list</DialogTitle>
          <DialogDescription>
            {totalToAdd === 0
              ? "Nothing to add — every pantry item is marked as in stock."
              : `${totalToAdd} item${totalToAdd === 1 ? "" : "s"} will be added to your shopping list.`}
          </DialogDescription>
        </DialogHeader>

        {totalToAdd > 0 && (
          <div className="max-h-[55vh] overflow-y-auto -mx-1">
            <Section items={candidates} />
          </div>
        )}

        {partnerSkipped.length > 0 && (
          <div className="rounded-lg border bg-muted/30 px-3 py-2.5 space-y-1.5">
            <div className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              <MemberAvatar
                household={household}
                stamp={
                  pantryCheckedProvenance.get(partnerSkipped[0]!.id) ?? null
                }
                action="Skipped"
              />
              <span>
                Already skipped by partner ({partnerSkipped.length})
              </span>
            </div>
            <div className="text-xs text-muted-foreground/80 leading-relaxed">
              {partnerSkipped.map((p) => p.name).join(", ")}
            </div>
          </div>
        )}

        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>
            Cancel
          </DialogClose>
          <Button onClick={handleSubmit}>
            {totalToAdd > 0
              ? `Add ${totalToAdd} item${totalToAdd === 1 ? "" : "s"}`
              : "Mark week complete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Section({ items }: { items: PantryItem[] }) {
  return (
    <div className="rounded-lg border divide-y">
      {items.map((p) => (
        <div key={p.id} className="flex items-center gap-3 px-3 py-2">
          <span className="text-sm flex-1 min-w-0">{p.name}</span>
          {p.shoppingPrice !== null && p.shoppingPrice !== undefined && (
            <span className="text-xs text-muted-foreground shrink-0">
              ${p.shoppingPrice.toFixed(2)}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
