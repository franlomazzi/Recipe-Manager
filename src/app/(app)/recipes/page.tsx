"use client";

import { useState } from "react";
import { useRecipes } from "@/lib/hooks/use-recipes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Clock, ChefHat, Heart, Star } from "lucide-react";
import Link from "next/link";

export default function RecipesPage() {
  const { recipes } = useRecipes();
  const [search, setSearch] = useState("");

  const filtered = recipes.filter(
    (r) =>
      r.title.toLowerCase().includes(search.toLowerCase()) ||
      r.categories.some((c) => c.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Recipes</h1>
        <Button className="rounded-xl" render={<Link href="/recipes/new" />}>
          <Plus className="mr-2 h-4 w-4" />
          New Recipe
        </Button>
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
                    {recipe.isFavorite && (
                      <Heart className="h-3 w-3 shrink-0 fill-primary text-primary mt-px" />
                    )}
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
