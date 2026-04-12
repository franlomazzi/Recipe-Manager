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
import { Search, UtensilsCrossed, X } from "lucide-react";
import type { Recipe } from "@/lib/types/recipe";
import type { PlanMeal } from "@/lib/types/meal-plan";

interface MealPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category: string;
  recipes: Recipe[];
  onSelect: (meal: PlanMeal) => void;
  onRemove?: () => void;
  currentMealId?: string;
}

export function MealPickerDialog({
  open,
  onOpenChange,
  category,
  recipes,
  onSelect,
  onRemove,
  currentMealId,
}: MealPickerDialogProps) {
  const [search, setSearch] = useState("");

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
    setSearch("");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Select {category} meal</DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search recipes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>

        {currentMealId && onRemove && (
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
      </DialogContent>
    </Dialog>
  );
}
