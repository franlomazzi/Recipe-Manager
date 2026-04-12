import type { Ingredient, IngredientCategory } from "@/lib/types/recipe";

const UNIT_MAP: Record<string, string> = {
  tablespoon: "tbsp",
  tablespoons: "tbsp",
  tbsp: "tbsp",
  tbs: "tbsp",
  teaspoon: "tsp",
  teaspoons: "tsp",
  tsp: "tsp",
  cup: "cup",
  cups: "cup",
  ounce: "oz",
  ounces: "oz",
  oz: "oz",
  pound: "lb",
  pounds: "lb",
  lb: "lb",
  lbs: "lb",
  gram: "g",
  grams: "g",
  g: "g",
  kilogram: "kg",
  kilograms: "kg",
  kg: "kg",
  milliliter: "ml",
  milliliters: "ml",
  ml: "ml",
  liter: "l",
  liters: "l",
  l: "l",
  pinch: "pinch",
  dash: "dash",
  clove: "clove",
  cloves: "clove",
  can: "can",
  cans: "can",
  slice: "slice",
  slices: "slice",
  piece: "piece",
  pieces: "piece",
};

export function normalizeUnit(unit: string): string {
  return UNIT_MAP[unit.toLowerCase().trim()] || unit.toLowerCase().trim();
}

interface CombinedIngredient {
  name: string;
  quantity: number | null;
  unit: string;
  category: IngredientCategory;
  sourceRecipeIds: string[];
}

export function combineIngredients(
  ingredients: (Ingredient & { recipeId: string })[]
): CombinedIngredient[] {
  const grouped = new Map<string, CombinedIngredient[]>();

  for (const ing of ingredients) {
    const key = ing.name.toLowerCase().trim();
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key)!.push({
      name: ing.name,
      quantity: ing.quantity,
      unit: normalizeUnit(ing.unit),
      category: ing.category,
      sourceRecipeIds: [ing.recipeId],
    });
  }

  const result: CombinedIngredient[] = [];

  for (const [, items] of grouped) {
    const byUnit = new Map<string, CombinedIngredient>();

    for (const item of items) {
      const unitKey = item.unit;
      const existing = byUnit.get(unitKey);

      if (existing) {
        if (existing.quantity !== null && item.quantity !== null) {
          existing.quantity += item.quantity;
        } else if (item.quantity !== null) {
          existing.quantity = item.quantity;
        }
        existing.sourceRecipeIds.push(...item.sourceRecipeIds);
      } else {
        byUnit.set(unitKey, { ...item });
      }
    }

    result.push(...byUnit.values());
  }

  return result.sort((a, b) => a.category.localeCompare(b.category));
}

export function generateSearchTerms(title: string, categories: string[]): string[] {
  const titleWords = title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 1);

  const categoryTerms = categories.map((c) => c.toLowerCase());

  return [...new Set([...titleWords, ...categoryTerms])];
}
