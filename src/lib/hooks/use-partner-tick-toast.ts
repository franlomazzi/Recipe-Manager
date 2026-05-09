"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import type { Household, ProvenanceStamp } from "@/lib/types/household";
import type { ShoppingItem } from "@/lib/types/shopping-list";

interface Args {
  currentUid: string | undefined | null;
  household: Household | null;
  /** Map of shopping-item key → provenance for the current week (shared pantry only). */
  sharedPantryCheckedProvenance: Map<string, ProvenanceStamp | null>;
  /** Aggregated shopping items, used to look up display names for keys. */
  items: ShoppingItem[];
}

/**
 * Watches the shared pantry tick map and surfaces a throttled toast whenever
 * the *other* household member ticks an item. The first snapshot is treated
 * as the baseline (no toast) so existing ticks don't all fire on page load.
 *
 * Multiple ticks within the throttle window are batched into one toast
 * ("Alice got 3 items") to avoid spam during a fast scan at the supermarket.
 */
const TOAST_THROTTLE_MS = 1500;

export function usePartnerTickToast({
  currentUid,
  household,
  sharedPantryCheckedProvenance,
  items,
}: Args) {
  const seenKeysRef = useRef<Set<string> | null>(null);
  const bufferRef = useRef<{ key: string; uid: string }[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const currentKeys = new Set(sharedPantryCheckedProvenance.keys());

    // First run: just record the baseline. We don't want to fire a flood of
    // toasts for ticks that already existed when the user opened the page.
    if (seenKeysRef.current === null) {
      seenKeysRef.current = currentKeys;
      return;
    }

    const previouslySeen = seenKeysRef.current;
    const newlyTicked: { key: string; uid: string }[] = [];
    for (const key of currentKeys) {
      if (previouslySeen.has(key)) continue;
      const stamp = sharedPantryCheckedProvenance.get(key);
      if (!stamp || !stamp.uid) continue;
      if (stamp.uid === currentUid) continue; // self-tick — already obvious
      newlyTicked.push({ key, uid: stamp.uid });
    }
    seenKeysRef.current = currentKeys;
    if (newlyTicked.length === 0) return;

    bufferRef.current.push(...newlyTicked);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const buffered = bufferRef.current;
      bufferRef.current = [];
      timerRef.current = null;
      if (buffered.length === 0) return;
      // All ticks in a single batch should share the same actor in practice;
      // group by uid in case both partners tick simultaneously.
      const byUid = new Map<string, string[]>();
      for (const t of buffered) {
        const item = items.find((i) => i.key === t.key);
        const name = item?.name ?? "an item";
        const list = byUid.get(t.uid) ?? [];
        list.push(name);
        byUid.set(t.uid, list);
      }
      for (const [uid, names] of byUid) {
        const memberName = household?.memberNames?.[uid] ?? "Partner";
        const summary =
          names.length === 1
            ? `${memberName} got ${names[0]}`
            : `${memberName} got ${names.length} items`;
        toast(summary, { duration: 3500 });
      }
    }, TOAST_THROTTLE_MS);
  }, [sharedPantryCheckedProvenance, currentUid, household, items]);

  // Flush any pending timer on unmount.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);
}
