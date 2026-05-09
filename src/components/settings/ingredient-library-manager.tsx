"use client";

import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/lib/contexts/auth-context";
import { useHousehold } from "@/lib/contexts/household-context";
import { useHouseholdPantryState } from "@/lib/hooks/use-household-pantry-state";
import {
  subscribeToLibrary,
  deleteLibraryIngredient,
  updateLibraryIngredient,
} from "@/lib/firebase/ingredient-library";
import {
  addPantryItemId,
  removePantryItemId,
} from "@/lib/firebase/household-pantry";
import {
  subscribeToShoppingListState,
  addIndividualPantryItemId,
  removeIndividualPantryItemId,
} from "@/lib/firebase/shopping-list";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { BookMarked, ChevronDown, Pencil, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { LibraryIngredient } from "@/lib/types/recipe";
import type { PantryScope } from "@/lib/hooks/use-pantry-items";

interface EditForm {
  name: string;
  brand: string;
  servingSize: string;
  servingUnit: string;
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
  fiber: string;
  isPantryItem: boolean;
  pantryScope: PantryScope;
}

function toForm(
  item: LibraryIngredient,
  currentScope: PantryScope
): EditForm {
  return {
    name: item.name,
    brand: item.brand ?? "",
    servingSize: String(item.servingSize),
    servingUnit: item.servingUnit,
    calories: String(item.calories),
    protein: String(item.protein),
    carbs: String(item.carbs),
    fat: String(item.fat),
    fiber: item.fiber != null ? String(item.fiber) : "",
    isPantryItem: item.isPantryItem ?? false,
    pantryScope: currentScope,
  };
}

function parseNum(val: string): number {
  const n = parseFloat(val);
  return isNaN(n) ? 0 : n;
}

export function IngredientLibraryManager() {
  const { user } = useAuth();
  const { householdId, partnerUid } = useHousehold();
  const { state: householdPantryState } = useHouseholdPantryState();

  const [items, setItems] = useState<LibraryIngredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [search, setSearch] = useState("");
  const [individualPantryIds, setIndividualPantryIds] = useState<string[]>([]);

  const [editItem, setEditItem] = useState<LibraryIngredient | null>(null);
  const [form, setForm] = useState<EditForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

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

  useEffect(() => {
    if (!user) return;
    return subscribeToShoppingListState(user.uid, (state) => {
      setIndividualPantryIds(state?.individualPantryItemIds ?? []);
    });
  }, [user]);

  const householdPantryIds = useMemo(
    () => new Set(householdPantryState.pantryItemIds),
    [householdPantryState.pantryItemIds]
  );
  const individualPantryIdSet = useMemo(
    () => new Set(individualPantryIds),
    [individualPantryIds]
  );

  function getScopeForItem(id: string): PantryScope {
    if (householdPantryIds.has(id)) return "household";
    return "individual";
  }

  if (!user) return null;

  function openEdit(item: LibraryIngredient) {
    const scope = getScopeForItem(item.id);
    setEditItem(item);
    setForm(toForm(item, scope));
    setConfirmDelete(false);
  }

  function closeEdit() {
    if (saving || deleting) return;
    setEditItem(null);
    setForm(null);
    setConfirmDelete(false);
  }

  function setField<K extends keyof EditForm>(key: K, value: EditForm[K]) {
    setForm((f) => (f ? { ...f, [key]: value } : f));
  }

  async function handleSave() {
    if (!editItem || !form) return;
    const trimmedName = form.name.trim();
    if (!trimmedName) return;
    setSaving(true);
    try {
      const wasAPantryItem = editItem.isPantryItem ?? false;
      const originalScope = getScopeForItem(editItem.id);

      // 1. Update the library ingredient fields
      await updateLibraryIngredient(user!.uid, editItem.id, {
        name: trimmedName,
        brand: form.brand.trim() || undefined,
        servingSize: parseNum(form.servingSize),
        servingUnit: form.servingUnit.trim(),
        calories: parseNum(form.calories),
        protein: parseNum(form.protein),
        carbs: parseNum(form.carbs),
        fat: parseNum(form.fat),
        fiber: form.fiber.trim() !== "" ? parseNum(form.fiber) : undefined,
        isPantryItem: form.isPantryItem,
      });

      // 2. Sync pantry scope lists
      const hasPartner = !!partnerUid && !!householdId;
      const newScope = hasPartner ? form.pantryScope : "individual";

      if (form.isPantryItem && !wasAPantryItem) {
        // Newly added to pantry
        if (newScope === "household" && householdId) {
          await addPantryItemId(
            householdId,
            householdPantryState.pantryItemIds,
            editItem.id
          );
        } else {
          await addIndividualPantryItemId(
            user!.uid,
            individualPantryIds,
            editItem.id
          );
        }
      } else if (!form.isPantryItem && wasAPantryItem) {
        // Removed from pantry — clear from whichever list it was in
        if (householdPantryIds.has(editItem.id) && householdId) {
          await removePantryItemId(
            householdId,
            householdPantryState.pantryItemIds,
            editItem.id
          );
        }
        if (individualPantryIdSet.has(editItem.id)) {
          await removeIndividualPantryItemId(
            user!.uid,
            individualPantryIds,
            editItem.id
          );
        }
      } else if (form.isPantryItem && wasAPantryItem && hasPartner && newScope !== originalScope) {
        // Scope changed
        if (newScope === "household") {
          await removeIndividualPantryItemId(
            user!.uid,
            individualPantryIds,
            editItem.id
          );
          await addPantryItemId(
            householdId!,
            householdPantryState.pantryItemIds,
            editItem.id
          );
        } else {
          await removePantryItemId(
            householdId!,
            householdPantryState.pantryItemIds,
            editItem.id
          );
          await addIndividualPantryItemId(
            user!.uid,
            individualPantryIds,
            editItem.id
          );
        }
      }

      toast.success(`"${trimmedName}" updated`);
      closeEdit();
    } catch {
      toast.error("Failed to save changes");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!editItem) return;
    setDeleting(true);
    try {
      // Remove from both pantry lists before deleting
      if (householdPantryIds.has(editItem.id) && householdId) {
        await removePantryItemId(
          householdId,
          householdPantryState.pantryItemIds,
          editItem.id
        );
      }
      if (individualPantryIdSet.has(editItem.id)) {
        await removeIndividualPantryItemId(
          user!.uid,
          individualPantryIds,
          editItem.id
        );
      }
      await deleteLibraryIngredient(user!.uid, editItem.id);
      toast.success(`"${editItem.name}" removed from your library`);
      setEditItem(null);
      setForm(null);
      setConfirmDelete(false);
    } catch {
      toast.error(`Failed to delete "${editItem.name}"`);
    } finally {
      setDeleting(false);
    }
  }

  const q = search.trim().toLowerCase();
  const filtered = q ? items.filter((i) => i.name.toLowerCase().includes(q)) : items;
  const regular = filtered.filter((i) => !i.isPantryItem);
  const pantry = filtered.filter((i) => i.isPantryItem);
  const hasPartner = !!partnerUid;

  function renderRow(item: LibraryIngredient) {
    return (
      <div
        key={item.id}
        className="flex items-center justify-between py-2 border-b last:border-0 gap-2"
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="text-sm truncate">{item.name}</span>
          {item.isPantryItem && (
            <>
              <Badge variant="secondary" className="text-xs shrink-0">Pantry</Badge>
              {hasPartner && (
                <Badge
                  variant="outline"
                  className={`text-xs shrink-0 ${
                    householdPantryIds.has(item.id)
                      ? "border-violet-400 text-violet-700 dark:text-violet-300"
                      : "border-slate-400 text-slate-600 dark:text-slate-400"
                  }`}
                >
                  {householdPantryIds.has(item.id) ? "Household" : "Individual"}
                </Badge>
              )}
            </>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
          onClick={() => openEdit(item)}
          aria-label={`Edit ${item.name}`}
        >
          <Pencil className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <>
      <Card>
        <CardHeader
          className="cursor-pointer select-none"
          onClick={() => setExpanded((v) => !v)}
        >
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <BookMarked className="h-5 w-5 text-primary" />
              Ingredient Library
            </CardTitle>
            <ChevronDown
              className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
            />
          </div>
          <CardDescription>
            Ingredients you&apos;ve added through recipes.{" "}
            {!loading && (
              <span>{items.length} ingredient{items.length !== 1 ? "s" : ""} in your library.</span>
            )}
          </CardDescription>
        </CardHeader>

        {expanded && (
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : items.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No ingredients yet — they&apos;ll appear here as you add recipes.
              </p>
            ) : (
              <div className="space-y-4">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input
                    placeholder="Search ingredients…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    className="pl-8 h-8 text-sm"
                  />
                </div>
                {filtered.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No ingredients match &quot;{search}&quot;.
                  </p>
                ) : (
                  <>
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
                  </>
                )}
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* Edit dialog */}
      <Dialog open={!!editItem} onOpenChange={(open) => { if (!open) closeEdit(); }}>
        {editItem && form && (
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Edit Ingredient</DialogTitle>
            </DialogHeader>

            {confirmDelete ? (
              <div className="space-y-4 py-2">
                <p className="text-sm">
                  Permanently delete <strong>{editItem.name}</strong> from your library?
                  Recipes using it won&apos;t be affected.
                </p>
                <div className="flex gap-2 justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setConfirmDelete(false)}
                    disabled={deleting}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleDelete}
                    disabled={deleting}
                  >
                    {deleting ? "Deleting…" : "Delete permanently"}
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <div className="space-y-4 py-1">
                  {/* Name & Brand */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2 space-y-1.5">
                      <Label htmlFor="ing-name">Name</Label>
                      <Input
                        id="ing-name"
                        value={form.name}
                        onChange={(e) => setField("name", e.target.value)}
                      />
                    </div>
                    <div className="col-span-2 space-y-1.5">
                      <Label htmlFor="ing-brand">
                        Brand{" "}
                        <span className="text-muted-foreground font-normal">(optional)</span>
                      </Label>
                      <Input
                        id="ing-brand"
                        value={form.brand}
                        onChange={(e) => setField("brand", e.target.value)}
                        placeholder="e.g. Heinz"
                      />
                    </div>
                  </div>

                  {/* Serving */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="ing-serving-size">Serving size</Label>
                      <Input
                        id="ing-serving-size"
                        type="number"
                        min={0}
                        step="any"
                        value={form.servingSize}
                        onChange={(e) => setField("servingSize", e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="ing-serving-unit">Unit</Label>
                      <Input
                        id="ing-serving-unit"
                        value={form.servingUnit}
                        onChange={(e) => setField("servingUnit", e.target.value)}
                        placeholder="g, ml, cup…"
                      />
                    </div>
                  </div>

                  {/* Macros */}
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                      Nutrition{" "}
                      <span className="normal-case font-normal">per serving</span>
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      {(
                        [
                          { id: "ing-cal", label: "Calories", key: "calories" },
                          { id: "ing-pro", label: "Protein (g)", key: "protein" },
                          { id: "ing-carb", label: "Carbs (g)", key: "carbs" },
                          { id: "ing-fat", label: "Fat (g)", key: "fat" },
                          { id: "ing-fiber", label: "Fiber (g)", key: "fiber" },
                        ] as const
                      ).map(({ id, label, key }) => (
                        <div key={key} className="space-y-1.5">
                          <Label htmlFor={id}>{label}</Label>
                          <Input
                            id={id}
                            type="number"
                            min={0}
                            step="any"
                            value={form[key]}
                            onChange={(e) => setField(key, e.target.value)}
                            placeholder={key === "fiber" ? "optional" : undefined}
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Pantry toggle */}
                  <div className="flex items-center justify-between">
                    <Label htmlFor="ing-pantry" className="cursor-pointer">
                      Pantry item
                      <span className="block text-xs text-muted-foreground font-normal">
                        Always available at home
                      </span>
                    </Label>
                    <Switch
                      id="ing-pantry"
                      checked={form.isPantryItem}
                      onCheckedChange={(v) => setField("isPantryItem", v)}
                    />
                  </div>

                  {/* Pantry scope — only shown when pantry is on and a partner exists */}
                  {form.isPantryItem && hasPartner && (
                    <div className="space-y-1.5">
                      <Label>Visibility</Label>
                      <div className="flex gap-2">
                        {(["household", "individual"] as PantryScope[]).map((s) => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => setField("pantryScope", s)}
                            className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-colors text-left ${
                              form.pantryScope === s
                                ? s === "household"
                                  ? "border-violet-400 bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 dark:border-violet-600"
                                  : "border-slate-400 bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-600"
                                : "border-border text-muted-foreground hover:bg-muted"
                            }`}
                          >
                            {s === "household" ? "Household" : "Individual"}
                            <div className="text-[10px] font-normal mt-0.5 opacity-70">
                              {s === "household" ? "Shared with partner" : "Only visible to you"}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <DialogFooter className="gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive mr-auto"
                    onClick={() => setConfirmDelete(true)}
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    Delete
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={closeEdit}
                    disabled={saving}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSave}
                    disabled={saving || !form.name.trim()}
                  >
                    {saving ? "Saving…" : "Save changes"}
                  </Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}
