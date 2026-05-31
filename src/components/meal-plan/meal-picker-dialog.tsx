"use client";

import { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, UtensilsCrossed, X, Minus, Plus, ChevronLeft } from "lucide-react";
import type { Recipe } from "@/lib/types/recipe";
import type { PlanMeal } from "@/lib/types/meal-plan";
import { macrosForServingAmount } from "@/lib/utils/plan-macros";

interface MealPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category: string;
  recipes: Recipe[];
  onSelect: (meal: PlanMeal) => void;
  onRemove?: () => void;
  currentMealId?: string;
  /**
   * "replace" (default) swaps the single meal in a category slot.
   * "add" appends a component to a multi-recipe meal — no current selection is
   * highlighted and the "remove current" affordance is hidden.
   */
  mode?: "replace" | "add";
  /**
   * When true, picking a recipe opens a "how many servings?" step (defaulting to
   * the recipe's own servings) before committing. The chosen amount is stored as
   * `servingAmount` and macros are scaled to it, so ingredient/shopping
   * quantities adjust. When false, the recipe is added at its full default.
   */
  askServings?: boolean;
}

export function MealPickerDialog({
  open,
  onOpenChange,
  category,
  recipes,
  onSelect,
  onRemove,
  currentMealId,
  mode = "replace",
  askServings = false,
}: MealPickerDialogProps) {
  const [search, setSearch] = useState("");
  // When askServings is on, holds the recipe awaiting a servings choice.
  const [pending, setPending] = useState<Recipe | null>(null);
  const [pendingServings, setPendingServings] = useState(1);

  const filtered = useMemo(() => {
    if (!search.trim()) return recipes;
    const lower = search.toLowerCase();
    return recipes.filter(
      (r) =>
        r.title.toLowerCase().includes(lower) ||
        r.categories.some((c) => c.toLowerCase().includes(lower))
    );
  }, [recipes, search]);

  function handleSelect(recipe: Recipe) {
    if (askServings) {
      // Two-step: choose servings before committing.
      setPending(recipe);
      setPendingServings(recipe.servings || 1);
      return;
    }
    // One-step: add at the recipe's full default (no servingAmount).
    const totalMacros = recipe.ingredients.reduce(
      (acc, ing) => ({
        calories: acc.calories + (ing.calories ?? 0),
        protein: acc.protein + (ing.protein ?? 0),
        carbs: acc.carbs + (ing.carbs ?? 0),
        fat: acc.fat + (ing.fat ?? 0),
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    );

    onSelect({
      category,
      mealId: recipe.id,
      mealName: recipe.title,
      ...(recipe.photoURL ? { mealPhoto: recipe.photoURL } : {}),
      macros: totalMacros,
    });
    close();
  }

  function confirmServings() {
    if (!pending) return;
    onSelect({
      category,
      mealId: pending.id,
      mealName: pending.title,
      ...(pending.photoURL ? { mealPhoto: pending.photoURL } : {}),
      macros: macrosForServingAmount(pending, pendingServings),
      servingAmount: pendingServings,
    });
    close();
  }

  function close() {
    setSearch("");
    setPending(null);
    onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setSearch("");
          setPending(null);
        }
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-md max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {pending
              ? "How many servings?"
              : mode === "add"
                ? `Add to ${category}`
                : `Select ${category} meal`}
          </DialogTitle>
        </DialogHeader>

        {pending ? (
          <div className="flex flex-col gap-4 pt-1">
            <div className="flex items-center gap-3">
              {pending.photoURL ? (
                <img
                  src={pending.photoURL}
                  alt=""
                  className="h-12 w-12 rounded-md object-cover shrink-0"
                />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-md bg-muted shrink-0">
                  <UtensilsCrossed className="h-5 w-5 text-muted-foreground" />
                </div>
              )}
              <div className="min-w-0">
                <p className="font-medium truncate">{pending.title}</p>
                <p className="text-xs text-muted-foreground">
                  Ingredient &amp; shopping quantities scale to this amount.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-center gap-4 py-2">
              <Button
                variant="outline"
                size="icon"
                className="h-10 w-10 rounded-xl"
                disabled={pendingServings <= 0.5}
                onClick={() =>
                  setPendingServings((s) => Math.max(0.5, s - 0.5))
                }
              >
                <Minus className="h-4 w-4" />
              </Button>
              <div className="text-center min-w-[100px]">
                <span className="text-3xl font-bold">{pendingServings}</span>
                <p className="text-sm text-muted-foreground">
                  servings
                  {pendingServings === (pending.servings || 1) && (
                    <span className="ml-1 text-primary font-medium">
                      (default)
                    </span>
                  )}
                </p>
              </div>
              <Button
                variant="outline"
                size="icon"
                className="h-10 w-10 rounded-xl"
                onClick={() => setPendingServings((s) => s + 0.5)}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1 rounded-xl"
                onClick={() => setPending(null)}
              >
                <ChevronLeft className="mr-1 h-4 w-4" />
                Back
              </Button>
              <Button className="flex-1 rounded-xl" onClick={confirmServings}>
                {mode === "add" ? "Add to meal" : "Add to plan"}
              </Button>
            </div>
          </div>
        ) : (
          <>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search recipes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>

        {mode === "replace" && currentMealId && onRemove && (
          <Button
            variant="outline"
            size="sm"
            className="w-full text-destructive hover:text-destructive"
            onClick={() => {
              onRemove();
              onOpenChange(false);
            }}
          >
            <X className="mr-2 h-3.5 w-3.5" />
            Remove current meal
          </Button>
        )}

        <div className="flex-1 overflow-y-auto space-y-1 min-h-0">
          {filtered.length === 0 && (
            <div className="py-8 text-center text-muted-foreground text-sm">
              No recipes found
            </div>
          )}
          {filtered.map((recipe) => (
            <button
              key={recipe.id}
              type="button"
              className={`flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm transition-colors hover:bg-accent ${
                recipe.id === currentMealId
                  ? "bg-primary/10 ring-1 ring-primary/20"
                  : ""
              }`}
              onClick={() => handleSelect(recipe)}
            >
              {recipe.photoURL ? (
                <img
                  src={recipe.photoURL}
                  alt=""
                  className="h-10 w-10 rounded-md object-cover shrink-0"
                />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-muted shrink-0">
                  <UtensilsCrossed className="h-4 w-4 text-muted-foreground" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="font-medium truncate">{recipe.title}</p>
                {recipe.categories.length > 0 && (
                  <p className="text-xs text-muted-foreground truncate">
                    {recipe.categories.slice(0, 3).join(", ")}
                  </p>
                )}
              </div>
              {recipe.totalTime > 0 && (
                <span className="text-xs text-muted-foreground shrink-0">
                  {recipe.totalTime}m
                </span>
              )}
            </button>
          ))}
        </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
