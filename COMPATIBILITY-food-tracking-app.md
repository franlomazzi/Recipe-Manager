# Cross-app compatibility: Recipe Manager ↔ Food Tracking App

_Last reviewed: 2026-05-31. Food tracking app at `C:\My food tracking app`._

This documents how meal-plan data flows between the two apps and what (if any)
changes are needed in the food tracking app. **No change to the food tracking
app is strictly required** — the two are already compatible. The items in
"Optional handover" are nice-to-haves only.

## Shared Firestore model (source of truth)

Both apps read/write the same collections, so plans created in either app appear
in the other:

| Concept            | Collection                  | Recipe Manager type | Food app type   |
|--------------------|-----------------------------|---------------------|-----------------|
| Recipe / meal      | `nutrition_meals`           | `Recipe`            | `CustomMeal`    |
| Ingredient library | `nutrition_ingredients`     | `LibraryIngredient` | `FoodItem`      |
| Plan template      | `nutrition_plan_templates`  | `PlanTemplate`      | `PlanTemplate`  |
| Plan instance      | `nutrition_plan_instances`  | `PlanInstance`      | `PlanInstance`  |

`PlanMeal` / `PlanDay` / `PlanWeek` and the macro shape (`PlanMealMacros` ↔
`Macronutrients`: `calories, protein, carbs, fat, fiber?, netCarbs?`) are
identical. `PlanMeal.mealId` is the `nutrition_meals` document id in both apps.

## Multiple recipes per meal — already native to both

`PlanDay.meals` has always been an **array**. The food app's `PlanEditor`
(`handleAddMealToDay`) **pushes** meals onto a day with no per-category
restriction, so a category like "Dinner" can already hold several meals. Recipe
Manager now does the same (behind the "Multiple recipes per meal" setting). A
multi-recipe dinner you build in the food app inherits directly into Recipe
Manager and vice versa.

## The one alignment that was needed: `servingAmount`

The food app stores the per-meal serving count as **`PlanMeal.servingAmount`**
(seeded from `CustomMeal.defaultLogServing`), and scales macros by
`servingAmount / servings`. Recipe Manager had briefly introduced this concept
under a different field name (`servings`); **this has been renamed to
`servingAmount`** so the two apps share the exact same field and meaning.

- Recipe Manager → food app: writes `servingAmount` and macros scaled to it
  (see `src/lib/utils/plan-macros.ts`). The food app reads both correctly.
- Food app → Recipe Manager: reads `servingAmount` for the servings badge, the
  cook-screen default, and (in multi-recipe mode) shopping-list scaling.

Shopping-list scaling in Recipe Manager is **opt-in**: only when "Multiple
recipes per meal" is enabled does `servingAmount` scale quantities
(`servingAmount / recipe.servings`). With the setting off, every planned meal
counts as one whole recipe — unchanged from before — so existing food-app plans
are never silently re-totalled.

## Recipe-Manager-only additions (the food app safely ignores these)

These exist only in Recipe Manager and do **not** break the food app, because
Firestore reads ignore unknown fields and the food app filters plans by status:

1. **`status: "adhoc"`** (freestyle weeks). The food app's active-plan query is
   `where status == 'active'`, so adhoc instances are never treated as the
   active plan.
2. **`user_preferences/{uid}_meal_plan`** (`multiRecipePerMeal`,
   `forceShowCategories`) — Recipe-Manager-only doc.
3. **`hiddenFromList: boolean`** on `nutrition_meals` docs. Keeps a recipe out
   of Recipe Manager's recipe library list only; the meal itself, its macros
   and its use in plans are untouched, so the food app is unaffected.
4. **`recipe_meal_combos`** — Recipe-Manager-only collection caching the AI
   "combined plate" photo + name for a set of recipes (see the combined-photo
   feature). The food app never reads it.

## Optional handover (only if you want to act on these in the food app)

None are required. Pick up only if the behaviour bothers you:

1. **Freestyle weeks appear in the food app's plan history.**
   `Plans.tsx` builds history from `getInstanceHistory` and filters
   `h.status !== 'active'`. Adhoc instances created in Recipe Manager have
   status `"adhoc"`, so they pass that filter and can show up as history cards.
   - _Fix in food app:_ also exclude `status === 'adhoc'`:
     `historyData.filter(h => h.status !== 'active' && h.status !== 'adhoc')`.

2. **Per-meal photos missing on Recipe-Manager-created instances.**
   To keep instance documents small, Recipe Manager strips `mealPhoto` from the
   snapshot when starting a plan (`startPlanInstance` in
   `src/lib/firebase/meal-plans.ts`); the photo is re-fetched from
   `nutrition_meals` by `mealId`. The food app's diary/plan views read
   `meal.mealPhoto` directly, so those meals would show no thumbnail.
   - _Fix in food app:_ when `meal.mealPhoto` is absent, fall back to the
     `CustomMeal.photo` looked up by `meal.mealId` (same pattern Recipe Manager
     uses).

3. **AI "combined plate" photo/name is not shown in the food app.**
   This is intentional (Recipe-Manager-only). If you ever want the food app to
   show the same unified image for a multi-recipe meal, it would read
   `recipe_meal_combos` keyed by the sorted set of `mealId`s in a category.

## How to keep them compatible going forward

- Never rename or repurpose the shared `PlanMeal` fields
  (`category, mealId, mealName, mealPhoto, macros, servingAmount`).
- New per-meal data that only one app needs should go in an app-private
  collection (as `recipe_meal_combos` and `user_preferences` do), not as new
  fields on the shared `PlanMeal`.
