"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
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
  pantryItems: PantryItem[];
  pantryCheckedIds: string[];
  pantryCheckedProvenance: Map<string, ProvenanceStamp | null>;
  individualPantryCheckedIds: string[];
  partnerUid: string | null;
  household: Household | null;
  onConfirm: (opts: {
    addedHousehold: string[];
    addedIndividual: string[];
    skippedHousehold: string[];
    skippedIndividual: string[];
  }) => Promise<void>;
}

/**
 * Diff-confirm dialog for the pantry → shopping-list commit step.
 *
 * Shows the items that will be added, grouped by household/individual, with
 * checkboxes pre-selected so users can deselect any last-minute additions.
 * Deselected items are recorded as "skipped this week" so the partner sees
 * the decision and the items don't reappear next time.
 *
 * For transparency, items the partner already skipped are listed as a separate
 * informational footer with the partner's avatar — not actionable here, but
 * makes the cross-member context visible at the decision point.
 */
export function CommitPantryDialog({
  open,
  onOpenChange,
  pantryItems,
  pantryCheckedIds,
  pantryCheckedProvenance,
  individualPantryCheckedIds,
  partnerUid,
  household,
  onConfirm,
}: Props) {
  const candidateHousehold = useMemo(
    () =>
      pantryItems.filter(
        (p) => p.scope === "household" && !pantryCheckedIds.includes(p.id)
      ),
    [pantryItems, pantryCheckedIds]
  );
  const candidateIndividual = useMemo(
    () =>
      pantryItems.filter(
        (p) => p.scope === "individual" && !individualPantryCheckedIds.includes(p.id)
      ),
    [pantryItems, individualPantryCheckedIds]
  );

  // Items the partner skipped — informational footer; already filtered out of candidates.
  const partnerSkipped = useMemo(() => {
    if (!partnerUid) return [];
    return pantryItems.filter((p) => {
      if (p.scope !== "household") return false;
      const stamp = pantryCheckedProvenance.get(p.id);
      return !!stamp && stamp.uid === partnerUid;
    });
  }, [pantryItems, partnerUid, pantryCheckedProvenance]);

  // Track which candidate ids the user has deselected for this commit.
  const [deselected, setDeselected] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (open) setDeselected(new Set());
  }, [open]);

  function toggle(id: string) {
    setDeselected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const addedHousehold = candidateHousehold
    .filter((p) => !deselected.has(p.id))
    .map((p) => p.id);
  const addedIndividual = candidateIndividual
    .filter((p) => !deselected.has(p.id))
    .map((p) => p.id);
  const skippedHousehold = candidateHousehold
    .filter((p) => deselected.has(p.id))
    .map((p) => p.id);
  const skippedIndividual = candidateIndividual
    .filter((p) => deselected.has(p.id))
    .map((p) => p.id);

  const totalToAdd = addedHousehold.length + addedIndividual.length;
  const totalCandidates = candidateHousehold.length + candidateIndividual.length;

  async function handleSubmit() {
    onOpenChange(false);
    await onConfirm({
      addedHousehold,
      addedIndividual,
      skippedHousehold,
      skippedIndividual,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add to shopping list</DialogTitle>
          <DialogDescription>
            {totalCandidates === 0
              ? "Nothing to add — every pantry item is marked as in stock."
              : "Uncheck anything you don't actually need this week."}
          </DialogDescription>
        </DialogHeader>

        {totalCandidates > 0 && (
          <div className="max-h-[55vh] overflow-y-auto -mx-1 space-y-4">
            {candidateHousehold.length > 0 && (
              <Section
                title="Household"
                titleBadgeClass="bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-900/20 dark:text-violet-400 dark:border-violet-800"
                items={candidateHousehold}
                deselected={deselected}
                onToggle={toggle}
              />
            )}
            {candidateIndividual.length > 0 && (
              <Section
                title="Personal"
                titleBadgeClass="bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800/50 dark:text-slate-400 dark:border-slate-700"
                items={candidateIndividual}
                deselected={deselected}
                onToggle={toggle}
              />
            )}
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

function Section({
  title,
  titleBadgeClass,
  items,
  deselected,
  onToggle,
}: {
  title: string;
  titleBadgeClass: string;
  items: PantryItem[];
  deselected: Set<string>;
  onToggle: (id: string) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 px-1">
        <Badge
          className={`h-4 px-1.5 text-[10px] font-medium ${titleBadgeClass}`}
        >
          {title}
        </Badge>
        <span className="text-[11px] text-muted-foreground">
          {items.length - items.filter((i) => deselected.has(i.id)).length}/
          {items.length} selected
        </span>
      </div>
      <div className="rounded-lg border divide-y">
        {items.map((p) => {
          const selected = !deselected.has(p.id);
          return (
            <label
              key={p.id}
              className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/40"
            >
              <Checkbox
                checked={selected}
                onCheckedChange={() => onToggle(p.id)}
              />
              <span
                className={`text-sm flex-1 min-w-0 ${
                  selected ? "" : "line-through text-muted-foreground/60"
                }`}
              >
                {p.name}
              </span>
              {p.shoppingPrice !== null && p.shoppingPrice !== undefined && (
                <span className="text-xs text-muted-foreground shrink-0">
                  ${p.shoppingPrice.toFixed(2)}
                </span>
              )}
            </label>
          );
        })}
      </div>
    </div>
  );
}
