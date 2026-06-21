import type { LibraryIngredient, PriceEntry } from "@/lib/types/recipe";

/** Price per single unit (of the ingredient's servingUnit). Infinity if qty <= 0. */
export function perUnit(entry: PriceEntry): number {
  return entry.qty > 0 ? entry.price / entry.qty : Infinity;
}

/**
 * A synthetic entry derived from the legacy single-price fields
 * (`shoppingPrice` / `shoppingPriceQty` / `shoppingLocationId`), used so prices
 * recorded before this feature — e.g. from the shopping-list edit dialog — still
 * appear here. Returns null when there's no usable legacy price. The id is stable
 * (`"legacy"`) so it persists as a normal entry on the first edit.
 */
export function legacyEntry(item: LibraryIngredient): PriceEntry | null {
  if (item.shoppingPrice == null) return null;
  return {
    id: "legacy",
    locationId: item.shoppingLocationId ?? null,
    locationName: "",
    price: item.shoppingPrice,
    qty: item.shoppingPriceQty ?? 1,
    unit: item.servingUnit || "unit",
  };
}

/**
 * The entries to show for an ingredient: its real `priceEntries`, or a single
 * synthetic legacy entry when none have been recorded yet.
 */
export function effectiveEntries(item: LibraryIngredient): PriceEntry[] {
  const entries = item.priceEntries ?? [];
  if (entries.length > 0) return entries;
  const legacy = legacyEntry(item);
  return legacy ? [legacy] : [];
}

/** The cheapest entry by per-unit price, or null if there are none. */
export function cheapestEntry(entries: PriceEntry[]): PriceEntry | null {
  if (entries.length === 0) return null;
  return entries.reduce((best, e) => (perUnit(e) < perUnit(best) ? e : best));
}

/**
 * The entry currently mirrored into the ingredient's active shopping price.
 * Prefers the explicit `activePriceEntryId`; falls back to value-matching for
 * ingredients priced before this feature existed.
 */
export function activeEntry(item: LibraryIngredient): PriceEntry | null {
  const entries = effectiveEntries(item);
  if (entries.length === 0) return null;
  if (item.activePriceEntryId) {
    const byId = entries.find((e) => e.id === item.activePriceEntryId);
    if (byId) return byId;
  }
  if (item.shoppingPrice != null) {
    const match = entries.find(
      (e) =>
        e.price === item.shoppingPrice &&
        (item.shoppingPriceQty == null || e.qty === item.shoppingPriceQty)
    );
    if (match) return match;
  }
  // A lone legacy entry is the active one by definition.
  if (entries.length === 1 && entries[0].id === "legacy") return entries[0];
  return null;
}

export interface SwapSavings {
  /** Per-unit price difference (current − candidate); positive means cheaper. */
  perUnitDelta: number;
  /** Percentage cheaper relative to the current entry; positive means cheaper. */
  percent: number;
  fromPerUnit: number;
  toPerUnit: number;
}

/**
 * Savings from switching the active entry to `candidate`. Returns null when
 * there is no current active entry to compare against.
 */
export function swapSavings(
  current: PriceEntry | null,
  candidate: PriceEntry
): SwapSavings | null {
  if (!current) return null;
  const fromPerUnit = perUnit(current);
  const toPerUnit = perUnit(candidate);
  const perUnitDelta = fromPerUnit - toPerUnit;
  const percent =
    fromPerUnit > 0 && Number.isFinite(fromPerUnit)
      ? (perUnitDelta / fromPerUnit) * 100
      : 0;
  return { perUnitDelta, percent, fromPerUnit, toPerUnit };
}
