import type { Timestamp } from "firebase/firestore";
import type { Household } from "@/lib/types/household";

/** Resolve a uid to its cached household display name + photo + initial. */
export function memberInfo(
  household: Household | null,
  uid: string
): { name: string; photo: string | undefined; initial: string } {
  const name = household?.memberNames?.[uid] || "Member";
  const photo = household?.memberPhotos?.[uid] || undefined;
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return { name, photo, initial };
}

/**
 * Best-effort short relative time ("just now", "12m ago", "3h ago", "yesterday", "4d ago").
 * Accepts a Firestore Timestamp, plain Date, or null/undefined.
 */
export function relativeTime(
  at: Timestamp | Date | null | undefined
): string {
  if (!at) return "";
  let ms = 0;
  if (at instanceof Date) ms = at.getTime();
  else if (typeof (at as Timestamp).toMillis === "function") ms = (at as Timestamp).toMillis();
  else if (typeof (at as { seconds?: number }).seconds === "number") {
    ms = (at as { seconds: number }).seconds * 1000;
  }
  if (!ms) return "";
  const diff = Date.now() - ms;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  const days = Math.floor(diff / 86_400_000);
  return days === 1 ? "yesterday" : `${days}d ago`;
}
