import type { Recipe } from "@/lib/types/recipe";
import type { PlanMealMacros } from "@/lib/types/meal-plan";

/**
 * Sum a recipe's ingredient macros to get the whole-recipe (all `servings`)
 * totals — the same baseline the food tracking app snapshots on a `CustomMeal`.
 */
export function fullRecipeMacros(recipe: Recipe): PlanMealMacros {
  return recipe.ingredients.reduce(
    (acc, ing) => ({
      calories: acc.calories + (ing.calories ?? 0),
      protein: acc.protein + (ing.protein ?? 0),
      carbs: acc.carbs + (ing.carbs ?? 0),
      fat: acc.fat + (ing.fat ?? 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );
}

/**
 * Scale whole-recipe macros to a chosen `servingAmount`. Mirrors the food
 * tracking app's PlanEditor maths so a meal's stored macros stay consistent
 * across both apps: `scaled = base × servingAmount / recipe.servings`.
 */
export function macrosForServingAmount(
  recipe: Recipe,
  servingAmount: number
): PlanMealMacros {
  const base = fullRecipeMacros(recipe);
  const ratio = servingAmount / (recipe.servings || 1);
  return {
    calories: Math.round(base.calories * ratio),
    protein: Number((base.protein * ratio).toFixed(1)),
    carbs: Number((base.carbs * ratio).toFixed(1)),
    fat: Number((base.fat * ratio).toFixed(1)),
  };
}
