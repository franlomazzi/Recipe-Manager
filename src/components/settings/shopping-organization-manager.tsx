"use client";

import { useState } from "react";
import { useAuth } from "@/lib/contexts/auth-context";
import { useShoppingOrganization } from "@/lib/hooks/use-shopping-organization";
import {
  saveLocations,
  saveCategories,
} from "@/lib/firebase/shopping-organization";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, MapPin, Tag, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import type {
  ShoppingLocation,
  ShoppingSection,
  IngredientCategoryDef,
} from "@/lib/types/shopping-organization";

export function ShoppingOrganizationManager() {
  const { user } = useAuth();
  const { locations, categories } = useShoppingOrganization();

  const [newLocationName, setNewLocationName] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [sectionInputs, setSectionInputs] = useState<Record<string, string>>({});

  if (!user) return null;

  function persistLocations(updated: ShoppingLocation[]) {
    if (!user) return Promise.resolve();
    return saveLocations(user.uid, updated).catch((err) => {
      toast.error(err instanceof Error ? err.message : "Failed to save locations");
    });
  }

  function persistCategories(updated: IngredientCategoryDef[]) {
    if (!user) return Promise.resolve();
    return saveCategories(user.uid, updated).catch((err) => {
      toast.error(err instanceof Error ? err.message : "Failed to save categories");
    });
  }

  async function addLocation() {
    const name = newLocationName.trim();
    if (!name) return;
    const next: ShoppingLocation = {
      id: crypto.randomUUID(),
      name,
      sections: [],
    };
    await persistLocations([...locations, next]);
    setNewLocationName("");
    setExpanded((s) => new Set(s).add(next.id));
  }

  async function renameLocation(id: string, name: string) {
    await persistLocations(
      locations.map((l) => (l.id === id ? { ...l, name } : l))
    );
  }

  async function deleteLocation(id: string) {
    await persistLocations(locations.filter((l) => l.id !== id));
  }

  async function addSection(locationId: string) {
    const name = (sectionInputs[locationId] ?? "").trim();
    if (!name) return;
    const newSection: ShoppingSection = { id: crypto.randomUUID(), name };
    await persistLocations(
      locations.map((l) =>
        l.id === locationId ? { ...l, sections: [...l.sections, newSection] } : l
      )
    );
    setSectionInputs((s) => ({ ...s, [locationId]: "" }));
  }

  async function deleteSection(locationId: string, sectionId: string) {
    await persistLocations(
      locations.map((l) =>
        l.id === locationId
          ? { ...l, sections: l.sections.filter((s) => s.id !== sectionId) }
          : l
      )
    );
  }

  async function addCategory() {
    const name = newCategoryName.trim();
    if (!name) return;
    const next: IngredientCategoryDef = { id: crypto.randomUUID(), name };
    await persistCategories([...categories, next]);
    setNewCategoryName("");
  }

  async function deleteCategory(id: string) {
    await persistCategories(categories.filter((c) => c.id !== id));
  }

  function toggleExpanded(id: string) {
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <>
      {/* Locations */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            Shopping Locations
          </CardTitle>
          <CardDescription>
            Places you buy things (e.g. Supermarket, Butcher) — each can have sections
            for how you walk the aisles.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              addLocation();
            }}
          >
            <Input
              placeholder="New location name..."
              value={newLocationName}
              onChange={(e) => setNewLocationName(e.target.value)}
            />
            <Button type="submit" size="sm" disabled={!newLocationName.trim()}>
              <Plus className="mr-1.5 h-4 w-4" />
              Add
            </Button>
          </form>

          {locations.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No locations yet — add one above to start organizing.
            </p>
          )}

          <div className="space-y-2">
            {locations.map((loc) => {
              const isOpen = expanded.has(loc.id);
              return (
                <div
                  key={loc.id}
                  className="rounded-lg border border-border bg-muted/30"
                >
                  <div className="flex items-center gap-2 px-3 py-2">
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground"
                      onClick={() => toggleExpanded(loc.id)}
                    >
                      {isOpen ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </button>
                    <Input
                      value={loc.name}
                      onChange={(e) => renameLocation(loc.id, e.target.value)}
                      className="h-8 flex-1 bg-background"
                    />
                    <Badge variant="secondary" className="rounded-md">
                      {loc.sections.length}{" "}
                      {loc.sections.length === 1 ? "section" : "sections"}
                    </Badge>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => deleteLocation(loc.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  {isOpen && (
                    <div className="border-t border-border px-3 py-2 space-y-2">
                      {loc.sections.length > 0 && (
                        <div className="space-y-1">
                          {loc.sections.map((s) => (
                            <div
                              key={s.id}
                              className="flex items-center gap-2 rounded-md bg-background px-2 py-1.5"
                            >
                              <span className="text-sm flex-1">{s.name}</span>
                              <button
                                type="button"
                                className="text-muted-foreground/60 hover:text-destructive transition-colors"
                                onClick={() => deleteSection(loc.id, s.id)}
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                      <form
                        className="flex gap-2"
                        onSubmit={(e) => {
                          e.preventDefault();
                          addSection(loc.id);
                        }}
                      >
                        <Input
                          placeholder="New section (e.g. Produce, Dairy)..."
                          value={sectionInputs[loc.id] ?? ""}
                          onChange={(e) =>
                            setSectionInputs((s) => ({
                              ...s,
                              [loc.id]: e.target.value,
                            }))
                          }
                          className="h-8 bg-background"
                        />
                        <Button
                          type="submit"
                          size="sm"
                          variant="outline"
                          disabled={!(sectionInputs[loc.id] ?? "").trim()}
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </Button>
                      </form>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Categories */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Tag className="h-5 w-5 text-primary" />
            Ingredient Categories
          </CardTitle>
          <CardDescription>
            Your own categories (e.g. Meat, Vegetable, Dairy, Seasoning) for grouping
            the shopping list.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              addCategory();
            }}
          >
            <Input
              placeholder="New category name..."
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
            />
            <Button type="submit" size="sm" disabled={!newCategoryName.trim()}>
              <Plus className="mr-1.5 h-4 w-4" />
              Add
            </Button>
          </form>

          {categories.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No categories yet — add one above.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {categories.map((cat) => (
                <Badge
                  key={cat.id}
                  variant="secondary"
                  className="rounded-md gap-1 pr-1"
                >
                  {cat.name}
                  <button
                    type="button"
                    className="ml-1 rounded-full p-0.5 hover:bg-muted transition-colors"
                    onClick={() => deleteCategory(cat.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
