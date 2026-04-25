"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/contexts/auth-context";
import { subscribeToLibrary, deleteLibraryIngredient } from "@/lib/firebase/ingredient-library";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BookMarked, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { LibraryIngredient } from "@/lib/types/recipe";

export function IngredientLibraryManager() {
  const { user } = useAuth();
  const [items, setItems] = useState<LibraryIngredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = subscribeToLibrary(user.uid, (ingredients) => {
      setItems(ingredients);
      setLoading(false);
    });
    return unsub;
  }, [user]);

  if (!user) return null;

  async function handleDelete(item: LibraryIngredient) {
    if (
      !confirm(
        `Delete "${item.name}" from your library? Recipes using it won't be affected.`
      )
    )
      return;
    setDeleting(item.id);
    try {
      await deleteLibraryIngredient(user!.uid, item.id);
      toast.success(`"${item.name}" removed from your library`);
    } catch {
      toast.error(`Failed to delete "${item.name}"`);
    } finally {
      setDeleting(null);
    }
  }

  const regular = items.filter((i) => !i.isPantryItem);
  const pantry = items.filter((i) => i.isPantryItem);

  function renderRow(item: LibraryIngredient) {
    return (
      <div
        key={item.id}
        className="flex items-center justify-between py-2 border-b last:border-0"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm truncate">{item.name}</span>
          {item.isPantryItem && (
            <Badge variant="secondary" className="text-xs shrink-0">
              Pantry
            </Badge>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
          disabled={deleting === item.id}
          onClick={() => handleDelete(item)}
          aria-label={`Delete ${item.name}`}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BookMarked className="h-5 w-5 text-primary" />
          Ingredient Library
        </CardTitle>
        <CardDescription>
          Ingredients you&apos;ve added through recipes.{" "}
          {!loading && (
            <span>
              {items.length} ingredient{items.length !== 1 ? "s" : ""} in your library.
            </span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No ingredients yet — they&apos;ll appear here as you add recipes.
          </p>
        ) : (
          <div className="space-y-4">
            {regular.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                  Ingredients ({regular.length})
                </p>
                <div>{regular.map(renderRow)}</div>
              </div>
            )}
            {pantry.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                  Pantry Items ({pantry.length})
                </p>
                <div>{pantry.map(renderRow)}</div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
