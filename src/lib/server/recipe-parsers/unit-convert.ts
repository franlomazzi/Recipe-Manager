// Post-processing: convert US/imperial weight units to metric so the draft
// the user reviews is already metric-native. Only mass units are converted —
// volume (cup/tsp/tbsp) passes through untouched because going from volume to
// weight requires density, which we don't know for an arbitrary ingredient.
//
// Every converted ingredient keeps an audit trail: "was X oz" is appended to
// the note so the user can verify the conversion during review and catch any
// bad source values before save.

import type { DraftRecipe, DraftIngredient } from "@/lib/types/import";

// factor: multiply source quantity to get target-unit quantity.
// targetUnit: must be a canonical unit from unit-standards.ts.
const MASS_TO_METRIC: Record<string, { factor: number; targetUnit: string }> = {
  oz: { factor: 28.3495, targetUnit: "g" },
  lb: { factor: 453.592, targetUnit: "g" },
};

// Round cleanly so we don't render "283.495 g flour". Resolution scales with
// magnitude: tight at low masses where precision matters, coarse at high
// masses where 5g either way doesn't change the recipe.
function roundForDisplay(value: number): number {
  if (value >= 100) return Math.round(value / 5) * 5;
  if (value >= 10) return Math.round(value);
  return Math.round(value * 10) / 10;
}

// Format the original quantity compactly for the audit note. Keeps integers
// integer and trims trailing zeros from decimals.
function formatOriginal(q: number): string {
  return q % 1 === 0 ? String(q) : q.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function convertIngredient(ing: DraftIngredient): DraftIngredient {
  if (ing.quantity == null || ing.quantity <= 0) return ing;
  const conv = MASS_TO_METRIC[ing.unit];
  if (!conv) return ing;

  const converted = roundForDisplay(ing.quantity * conv.factor);
  const audit = `was ${formatOriginal(ing.quantity)} ${ing.unit}`;
  const note = ing.note ? `${ing.note} (${audit})` : audit;
  return {
    ...ing,
    quantity: converted,
    unit: conv.targetUnit,
    note,
  };
}

export function normalizeToMetric(draft: DraftRecipe): DraftRecipe {
  return {
    ...draft,
    ingredients: draft.ingredients.map(convertIngredient),
  };
}
