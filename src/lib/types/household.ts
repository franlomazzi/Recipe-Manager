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

/**
 * Snapshot recorded when a household member ticks a shared pantry item off the
 * shopping list. Captures who bought it and what it cost at tick time so the
 * cost-balance view stays stable even if the underlying library price changes.
 */
export interface PantryPurchase {
  /** Auth uid of the member who completed the purchase. */
  uid: string;
  /** Cost paid in dollars at the moment of completion. */
  cost: number;
  /** Display name snapshot — keeps the balance view readable without a library lookup. */
  name: string;
}

/** Single per-week settlement: `fromUid` paid `toUid` `amount` to clear the week. */
export interface PantrySettlement {
  amount: number;
  fromUid: string;
  toUid: string;
  settledAt: Timestamp;
}

/**
 * Records who took an action and when. Empty-string `uid` is the sentinel for
 * legacy entries written before provenance was recorded — readers should treat
 * it as "unknown actor" and avoid attributing the action in the UI.
 */
export interface ProvenanceStamp {
  uid: string;
  at: Timestamp;
}

/**
 * A per-week set with optional provenance. Two shapes exist on disk:
 *  - legacy `string[]` (pre-provenance writes); readable, no actor info
 *  - current `Record<id, ProvenanceStamp>` (every new write uses this shape)
 * Always read through `idsFromProvenancedSet` / `provenanceMapFor` helpers.
 */
export type ProvenancedSet = string[] | Record<string, ProvenanceStamp>;

export interface HouseholdPantryState {
  /** Library ingredient ids that are pantry items. */
  pantryItemIds: string[];
  /** "I have enough" check state per week. Stamped with who skipped each item. */
  pantryCheckedByWeek: Record<string, ProvenancedSet>;
  /** Pantry items committed to the shopping list per week. Stamped with who added each. */
  pantryAddedByWeek: Record<string, ProvenancedSet>;
  /**
   * Whether the pantry-check section is finalized for a given week.
   * Legacy `boolean` shape is read as "processed by unknown"; new writes record the actor.
   */
  pantryProcessedByWeek: Record<string, boolean | ProvenanceStamp>;
  /** Per-week shared tick state for pantry-originated shopping items. Stamped with who ticked. */
  pantryCheckedKeysByWeek: Record<string, ProvenancedSet>;
  /**
   * Soft-delete tombstones for items removed from the shopping list this week.
   * Items in this map are still rendered (struck through with "Removed by X")
   * so the partner has a chance to restore. Auto-pruned after 24h.
   */
  pantryRemovedByWeek?: Record<string, ProvenancedSet>;
  /**
   * Per-week purchase ledger. Outer key = weekKey, inner key = shopping item key.
   * Mirrors pantryCheckedKeysByWeek but with cost + buyer attribution; a key is
   * present here iff it is currently ticked.
   */
  pantryPurchasesByWeek: Record<string, Record<string, PantryPurchase>>;
  /** One settlement record per week (latest "settle up" wins). */
  pantrySettlementsByWeek: Record<string, PantrySettlement>;
  updatedAt?: Timestamp;
}
