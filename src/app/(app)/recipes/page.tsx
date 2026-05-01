"use client";

import { useState } from "react";
import { useRecipes } from "@/lib/hooks/use-recipes";
import { useKitchenTool } from "@/lib/hooks/use-kitchen-tool";
import { useAuth } from "@/lib/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Clock, ChefHat, Heart, Star, LayoutGrid, List, Users } from "lucide-react";
import Link from "next/link";
import { ImportRecipeModal } from "@/components/recipe/import-recipe-modal";
import type { Recipe } from "@/lib/types/recipe";

export default function RecipesPage() {
  const { recipes } = useRecipes();
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const isKT = useKitchenTool();

  const filtered = recipes.filter(
    (r) =>
      r.title.toLowerCase().includes(search.toLowerCase()) ||
      r.categories.some((c) => c.toLowerCase().includes(search.toLowerCase()))
  );

  if (isKT) {
    return (
      <KitchenToolRecipes
        recipes={filtered}
        search={search}
        setSearch={setSearch}
        view={view}
        setView={setView}
        uid={user?.uid}
      />
    );
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Recipes</h1>
        <div className="flex items-center gap-2">
          <ImportRecipeModal />
          <Button className="rounded-xl" render={<Link href="/recipes/new" />}>
            <Plus className="mr-2 h-4 w-4" />
            New Recipe
          </Button>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search recipes..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10 h-11 rounded-xl bg-card border-transparent card-elevated"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-muted mb-5">
            <ChefHat className="h-10 w-10 text-muted-foreground/40" />
          </div>
          <h2 className="text-xl font-semibold">No recipes yet</h2>
          <p className="text-sm text-muted-foreground mt-1 mb-5">
            Add your first recipe to get started
          </p>
          <Button size="lg" className="rounded-xl" render={<Link href="/recipes/new" />}>
            <Plus className="mr-2 h-4 w-4" />
            Add Recipe
          </Button>
        </div>
      ) : (
        <div style={{display:"grid", gap:"12px", gridTemplateColumns:"repeat(auto-fill, minmax(160px, 1fr))"}}>
          {filtered.map((recipe) => (
            <Link key={recipe.id} href={`/recipes/${recipe.id}`}>
              <Card className="card-elevated cursor-pointer overflow-hidden transition-all hover:scale-[1.02] border-transparent pt-0">
                {recipe.photoURL ? (
                  <div className="aspect-[4/3] w-full overflow-hidden">
                    <img
                      src={recipe.photoURL}
                      alt={recipe.title}
                      className="h-full w-full object-cover transition-transform hover:scale-105"
                    />
                  </div>
                ) : (
                  <div className="flex aspect-[4/3] w-full items-center justify-center bg-gradient-to-br from-muted/60 to-muted p-3">
                    <p className="text-center text-xs font-semibold text-foreground/60 line-clamp-3 leading-snug">
                      {recipe.title}
                    </p>
                  </div>
                )}
                <CardContent className="p-2.5">
                  <div className="flex items-start justify-between gap-1">
                    <h3 className="font-semibold text-xs line-clamp-1">{recipe.title}</h3>
                    <div className="flex items-center gap-1 shrink-0">
                      {recipe.userId !== user?.uid && (
                        <Users className="h-3 w-3 text-muted-foreground" title="Shared with you" />
                      )}
                      {recipe.isFavorite && (
                        <Heart className="h-3 w-3 fill-primary text-primary mt-px" />
                      )}
                    </div>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-0.5">
                      <Clock className="h-3 w-3" />
                      {recipe.totalTime} min
                    </span>
                    <Badge variant="secondary" className="text-[10px] rounded-md px-1.5 py-0">
                      {recipe.difficulty}
                    </Badge>
                    {recipe.rating !== null && recipe.rating !== undefined && (
                      <span className="flex items-center gap-0.5 ml-auto">
                        <Star className="h-3 w-3 fill-primary text-primary" />
                        <span className="font-medium">{recipe.rating.toFixed(1)}</span>
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/* =====================================================================
   Kitchen Tool — recipes index (magazine grid + ledger table)
   ===================================================================== */
function KitchenToolRecipes({
  recipes,
  search,
  setSearch,
  view,
  setView,
  uid,
}: {
  recipes: Recipe[];
  search: string;
  setSearch: (s: string) => void;
  view: "grid" | "list";
  setView: (v: "grid" | "list") => void;
  uid?: string;
}) {
  return (
    <div className="mx-auto max-w-7xl p-4 md:p-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 border-b kt-hair pb-4">
        <div>
          <div className="kt-eyebrow">Library · {recipes.length} recipe{recipes.length === 1 ? "" : "s"}</div>
          <h1 className="kt-serif text-4xl md:text-5xl font-semibold tracking-tight mt-1">
            Recipes
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex border kt-hair" style={{ borderRadius: "var(--radius-sm)" }}>
            <button
              onClick={() => setView("grid")}
              className={`px-2.5 py-1.5 ${view === "grid" ? "bg-primary text-primary-foreground" : "hover:bg-secondary"}`}
              aria-label="Grid view"
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setView("list")}
              className={`px-2.5 py-1.5 border-l kt-hair ${view === "list" ? "bg-primary text-primary-foreground" : "hover:bg-secondary"}`}
              aria-label="List view"
            >
              <List className="h-3.5 w-3.5" />
            </button>
          </div>
          <ImportRecipeModal />
          <Button render={<Link href="/recipes/new" />}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            New recipe
          </Button>
        </div>
      </div>

      <div className="relative max-w-xl">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search recipes…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 h-10 bg-card"
        />
      </div>

      {recipes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center border kt-hair" style={{ borderRadius: "var(--radius)" }}>
          <ChefHat className="h-10 w-10 text-muted-foreground/50" />
          <h2 className="kt-serif text-2xl font-semibold mt-4">No recipes yet</h2>
          <p className="text-sm text-muted-foreground mt-1 mb-4">
            Add your first recipe to get started.
          </p>
          <Button render={<Link href="/recipes/new" />}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add recipe
          </Button>
        </div>
      ) : view === "grid" ? (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {recipes.map((r) => (
            <Link
              key={r.id}
              href={`/recipes/${r.id}`}
              className="group block border kt-hair bg-card overflow-hidden hover:border-primary/40 transition-colors"
              style={{ borderRadius: "var(--radius)" }}
            >
              {r.photoURL ? (
                <div className="aspect-[4/3] overflow-hidden">
                  <img
                    src={r.photoURL}
                    alt={r.title}
                    className="h-full w-full object-cover"
                  />
                </div>
              ) : (
                <div
                  className="aspect-[4/3] flex items-center justify-center kt-mono text-[10px] uppercase tracking-wider text-muted-foreground"
                  style={{
                    background:
                      "repeating-linear-gradient(135deg, var(--kt-paper-deep) 0 6px, var(--background) 6px 12px)",
                  }}
                >
                  {r.title.slice(0, 24)} · photo
                </div>
              )}
              <div className="p-4 border-t kt-hair">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="kt-serif text-lg font-semibold leading-tight flex-1">
                    {r.title}
                  </h3>
                  <div className="flex items-center gap-1.5 shrink-0 mt-1">
                    {r.userId !== uid && (
                      <Users className="h-3.5 w-3.5 text-muted-foreground" title="Shared with you" />
                    )}
                    {r.isFavorite && (
                      <Heart className="h-3.5 w-3.5 fill-primary text-primary" />
                    )}
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-3 text-[11px] text-muted-foreground kt-mono">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {r.totalTime}m
                  </span>
                  <span className="opacity-60">·</span>
                  <span className="uppercase">{r.difficulty}</span>
                  {r.rating != null && (
                    <span className="ml-auto flex items-center gap-0.5">
                      <Star className="h-3 w-3 fill-primary text-primary" />
                      {r.rating.toFixed(1)}
                    </span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="border kt-hair overflow-hidden" style={{ borderRadius: "var(--radius)" }}>
          <div className="grid grid-cols-[1fr_90px_90px_70px] gap-4 px-4 py-2 border-b kt-hair bg-secondary/50 kt-eyebrow">
            <div>Recipe</div>
            <div className="text-right">Time</div>
            <div className="text-right">Difficulty</div>
            <div className="text-right">Rating</div>
          </div>
          {recipes.map((r, i) => (
            <Link
              key={r.id}
              href={`/recipes/${r.id}`}
              className={`grid grid-cols-[1fr_90px_90px_70px] gap-4 px-4 py-3 items-center hover:bg-secondary/40 transition-colors ${
                i !== 0 ? "border-t kt-hair" : ""
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                {r.isFavorite && <Heart className="h-3 w-3 shrink-0 fill-primary text-primary" />}
                {r.userId !== uid && <Users className="h-3 w-3 shrink-0 text-muted-foreground" title="Shared with you" />}
                <span className="kt-serif text-base font-medium truncate">{r.title}</span>
              </div>
              <div className="text-right kt-mono text-xs text-muted-foreground">{r.totalTime}m</div>
              <div className="text-right kt-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                {r.difficulty}
              </div>
              <div className="text-right kt-mono text-xs">
                {r.rating != null ? (
                  <span className="flex items-center justify-end gap-0.5">
                    <Star className="h-3 w-3 fill-primary text-primary" />
                    {r.rating.toFixed(1)}
                  </span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
