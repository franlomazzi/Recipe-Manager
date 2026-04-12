import type { Timestamp } from "firebase/firestore";

export interface Household {
  id: string;
  ownerId: string;
  /** Auth uids of household members. Max 2 in v1. */
  members: string[];
  /** Cached display names per uid for UI without extra reads. */
  memberNames: Record<string, string>;
  /** Cached avatar URLs per uid (may be empty strings). */
  memberPhotos?: Record<string, string>;
  name: string;
  /** 6-character A–Z0–9 invite code. Regenerable by the owner. */
  inviteCode: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface HouseholdPantryState {
  /** Library ingredient ids that are pantry items. */
  pantryItemIds: string[];
  /** "I have enough" check state per week (ids checked off). */
  pantryCheckedByWeek: Record<string, string[]>;
  /** Pantry items committed to the shopping list per week. */
  pantryAddedByWeek: Record<string, string[]>;
  /** Whether the pantry-check section is finalized for a given week. */
  pantryProcessedByWeek: Record<string, boolean>;
  /** Per-week shared tick state for pantry-originated shopping items. */
  pantryCheckedKeysByWeek: Record<string, string[]>;
  updatedAt?: Timestamp;
}
