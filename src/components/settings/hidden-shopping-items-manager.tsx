"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/contexts/auth-context";
import {
  subscribeToShoppingListState,
  unhideShoppingItem,
} from "@/lib/firebase/shopping-list";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronDown, EyeOff, Undo2 } from "lucide-react";
import { toast } from "sonner";
import type { HiddenShoppingItem } from "@/lib/types/shopping-list";

/**
 * Items the user hid from the shopping list with the eye icon on a list row —
 * typically plan entries that aren't really groceries ("Saturday Cheat Meal").
 * Unhiding here brings them back to every week's list.
 */
export function HiddenShoppingItemsManager() {
  const { user } = useAuth();
  const [hiddenItems, setHiddenItems] = useState<HiddenShoppingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setHiddenItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    return subscribeToShoppingListState(user.uid, (state) => {
      setHiddenItems(state?.hiddenItems ?? []);
      setLoading(false);
    });
  }, [user]);

  if (!user) return null;

  async function handleUnhide(item: HiddenShoppingItem) {
    setRestoring(item.key);
    try {
      await unhideShoppingItem(user!.uid, hiddenItems, item.key);
      toast.success(`"${item.name}" is back on your shopping list`);
    } catch {
      toast.error(`Failed to unhide "${item.name}"`);
    } finally {
      setRestoring(null);
    }
  }

  return (
    <Card>
      <CardHeader
        className="cursor-pointer select-none"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <EyeOff className="h-5 w-5 text-primary" />
            Hidden Shopping Items
          </CardTitle>
          <ChevronDown
            className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${
              expanded ? "rotate-180" : ""
            }`}
          />
        </div>
        <CardDescription>
          Ingredients you&apos;ve hidden from the shopping list.{" "}
          {!loading && (
            <span>
              {hiddenItems.length} hidden item
              {hiddenItems.length !== 1 ? "s" : ""}.
            </span>
          )}
        </CardDescription>
      </CardHeader>

      {expanded && (
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : hiddenItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing hidden. Use the eye icon next to an item on the shopping
              list to hide entries that aren&apos;t real ingredients.
            </p>
          ) : (
            <div>
              {hiddenItems.map((item) => (
                <div
                  key={item.key}
                  className="flex items-center justify-between py-2 border-b last:border-0 gap-2"
                >
                  <span className="text-sm truncate min-w-0 flex-1">
                    {item.name}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 shrink-0 text-muted-foreground hover:text-foreground"
                    onClick={() => void handleUnhide(item)}
                    disabled={restoring === item.key}
                  >
                    <Undo2 className="h-4 w-4 mr-1" />
                    {restoring === item.key ? "Unhiding…" : "Unhide"}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
