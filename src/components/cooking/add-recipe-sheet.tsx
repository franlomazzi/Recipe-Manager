"use client";

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRecipes } from "@/lib/hooks/use-recipes";
import { useCookingSession } from "@/lib/contexts/cooking-session-context";
import { getCookLogs } from "@/lib/firebase/firestore";
import { Search, X, Loader2, Minus, Plus, ArrowLeft } from "lucide-react";
import type { Recipe } from "@/lib/types/recipe";

interface AddRecipeSheetProps {
  onClose: () => void;
}

export function AddRecipeSheet({ onClose }: AddRecipeSheetProps) {
  const { recipes, loading } = useRecipes();
  const { sessions, addSession, setActiveSession } = useCookingSession();
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  // Serving picker step: null = recipe list, Recipe = picking servings for that recipe
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [servingCount, setServingCount] = useState(1);

  const existingIds = new Set(sessions.map((s) => s.recipeId));

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return recipes
      .filter((r) => !existingIds.has(r.id))
      .filter((r) => !q || r.title.toLowerCase().includes(q));
  }, [recipes, search, existingIds]);

  function handleSelectRecipe(recipe: Recipe) {
    setSelectedRecipe(recipe);
    setServingCount(recipe.servings);
  }

  async function handleConfirm() {
    if (!selectedRecipe) return;
    setAdding(true);
    try {
      const cookLogs = await getCookLogs(selectedRecipe.id);
      const multiplier = servingCount / selectedRecipe.servings;
      addSession(selectedRecipe, cookLogs, multiplier);
      setActiveSession(selectedRecipe.id);
      onClose();
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl border-transparent bg-card shadow-2xl flex flex-col max-h-[80vh]">

        {selectedRecipe ? (
          /* ── Serving picker ── */
          <>
            <div className="flex items-center gap-2 px-5 pt-5 pb-3">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={() => setSelectedRecipe(null)}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-lg truncate">{selectedRecipe.title}</h3>
                <p className="text-sm text-muted-foreground">How many servings?</p>
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onClose}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="px-6 py-6 flex items-center justify-center gap-4">
              <Button
                variant="outline"
                size="icon"
                className="h-10 w-10 rounded-xl"
                onClick={() => setServingCount((s) => Math.max(0.5, s - 0.5))}
                disabled={servingCount <= 0.5}
              >
                <Minus className="h-4 w-4" />
              </Button>
              <div className="text-center min-w-[100px]">
                <span className="text-3xl font-bold">{servingCount}</span>
                <p className="text-sm text-muted-foreground">
                  servings
                  {servingCount === selectedRecipe.servings && (
                    <span className="ml-1 text-primary font-medium">(default)</span>
                  )}
                </p>
              </div>
              <Button
                variant="outline"
                size="icon"
                className="h-10 w-10 rounded-xl"
                onClick={() => setServingCount((s) => s + 0.5)}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex gap-2 px-6 pb-6 pt-2">
              <Button
                variant="outline"
                className="flex-1 rounded-xl"
                onClick={() => setSelectedRecipe(null)}
              >
                Back
              </Button>
              <Button
                className="flex-1 rounded-xl"
                onClick={handleConfirm}
                disabled={adding}
              >
                {adding && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Start cooking
              </Button>
            </div>
          </>
        ) : (
          /* ── Recipe list ── */
          <>
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <h3 className="font-semibold text-lg">Add recipe to cook</h3>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="px-5 pb-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search recipes..."
                  className="pl-9 rounded-xl"
                  autoFocus
                />
              </div>
            </div>

            <div className="px-2 pb-5 overflow-y-auto flex-1">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : filtered.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8 px-3">
                  {recipes.length === 0
                    ? "No recipes yet."
                    : search
                    ? "No recipes match your search."
                    : "All your recipes are already being cooked!"}
                </p>
              ) : (
                <div className="space-y-1">
                  {filtered.map((recipe) => (
                    <button
                      key={recipe.id}
                      type="button"
                      onClick={() => handleSelectRecipe(recipe)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-muted transition-colors text-left"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{recipe.title}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {recipe.steps.length} steps · {recipe.servings} servings
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
