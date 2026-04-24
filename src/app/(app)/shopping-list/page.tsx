"use client";

import { useState, useMemo, useEffect } from "react";
import { useAuth } from "@/lib/contexts/auth-context";
import { useKitchenTool } from "@/lib/hooks/use-kitchen-tool";
import { useHousehold } from "@/lib/contexts/household-context";
import { useShoppingList } from "@/lib/hooks/use-shopping-list";
import { useShoppingOrganization } from "@/lib/hooks/use-shopping-organization";
import { getIndicesForDate } from "@/lib/firebase/meal-plans";
import {
  toggleCheckedKey,
  addRecipeToWeek,
  removeExtraEntry,
  updateCustomItems,
  clearAllChecked,
  setOneOffMeta,
} from "@/lib/firebase/shopping-list";
import {
  updateLibraryIngredient,
  createPantryLibraryIngredient,
} from "@/lib/firebase/shopping-organization";
import {
  setPantryCheckedForWeek,
  commitPantryForWeek,
  reopenPantryForWeek,
  toggleSharedPantryCheckedKey,
  addPantryItemId,
  removePantryItemId,
} from "@/lib/firebase/household-pantry";
import { usePantryItems } from "@/lib/hooks/use-pantry-items";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ShoppingCart,
  Plus,
  X,
  Loader2,
  Search,
  Trash2,
  CalendarDays,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Tag,
  MapPin,
  Pencil,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Package,
  RotateCcw,
} from "lucide-react";
import { addDays, format, parseISO } from "date-fns";
import { useActivePlan } from "@/lib/hooks/use-active-plan";
import type { ShoppingItem, CustomShoppingItem } from "@/lib/types/shopping-list";
import { toast } from "sonner";

type GroupBy = "category" | "location";
const UNASSIGNED = "__unassigned__";

export default function ShoppingListPage() {
  const { user } = useAuth();
  const isKT = useKitchenTool();
  const { householdId } = useHousehold();
  const { instance } = useActivePlan();
  const { locations, categories } = useShoppingOrganization();

  const [weekIndex, setWeekIndex] = useState(() => {
    if (!instance) return 0;
    return getIndicesForDate(instance, new Date())?.weekIndex ?? 0;
  });

  const {
    items,
    customItems,
    checkedKeys,
    extraByWeek,
    oneOffByWeek,
    extraEntries,
    availableRecipes,
    planRecipes,
    extraRecipes,
    pantryCheckedByWeek,
    pantryProcessedByWeek,
    pantryAddedByWeek,
    pantryCheckedIds,
    pantryProcessed,
    sharedPantryCheckedByWeek,
    loading,
    hasActivePlan,
  } = useShoppingList(weekIndex);

  const { pantryItems } = usePantryItems();

  const [groupBy, setGroupBy] = useState<GroupBy>("category");
  const [addRecipeOpen, setAddRecipeOpen] = useState(false);
  const [recipeSearch, setRecipeSearch] = useState("");
  const [customInput, setCustomInput] = useState("");
  const [assigning, setAssigning] = useState<ShoppingItem | null>(null);
  const [editPantryOpen, setEditPantryOpen] = useState(false);
  const [pantryNewName, setPantryNewName] = useState("");

  const weekRange = useMemo(() => {
    if (!instance) return null;
    const start = addDays(parseISO(instance.startDate), weekIndex * 7);
    const end = addDays(start, 6);
    return { start, end };
  }, [instance, weekIndex]);

  // Lookup map
  const locationMap = useMemo(
    () => new Map(locations.map((l) => [l.id, l])),
    [locations]
  );

  // Unmapped depends on current grouping mode
  const unmappedItems = useMemo(() => {
    return items.filter((i) =>
      groupBy === "category" ? !i.categoryId : !i.locationId
    );
  }, [items, groupBy]);

  // Group items
  const grouped = useMemo(() => {
    if (groupBy === "category") {
      const map = new Map<string, ShoppingItem[]>();
      for (const item of items) {
        const key = item.categoryId ?? UNASSIGNED;
        const list = map.get(key) ?? [];
        list.push(item);
        map.set(key, list);
      }
      return map;
    } else {
      const map = new Map<string, ShoppingItem[]>();
      for (const item of items) {
        const key = item.locationId ?? UNASSIGNED;
        const list = map.get(key) ?? [];
        list.push(item);
        map.set(key, list);
      }
      return map;
    }
  }, [items, groupBy]);

  // Active items only — checked items disappear into the "Completed" section
  function activeSortItems(list: ShoppingItem[]) {
    return list
      .filter((i) => !i.checked)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  // All checked items (for the collapsed "Completed" section)
  const completedItems = useMemo(
    () =>
      items
        .filter((i) => i.checked)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [items]
  );
  const completedCustomItems = useMemo(
    () => customItems.filter((i) => i.checked),
    [customItems]
  );
  const completedTotal = completedItems.length + completedCustomItems.length;
  const [completedOpen, setCompletedOpen] = useState(false);

  // Active custom items (unchecked)
  const activeCustomItems = useMemo(
    () => customItems.filter((i) => !i.checked),
    [customItems]
  );

  const totalItems = items.length + customItems.length;
  const checkedCount =
    items.filter((i) => i.checked).length +
    customItems.filter((i) => i.checked).length;

  // Total cost across all (non-completed-aware — just reflects loaded prices)
  const priceStats = useMemo(() => {
    let total = 0;
    let priced = 0;
    for (const it of items) {
      if (it.price !== null) {
        total += it.price;
        priced += 1;
      }
    }
    return { total, priced, totalCount: items.length };
  }, [items]);

  const filteredAvailable = availableRecipes.filter((r) =>
    r.title.toLowerCase().includes(recipeSearch.toLowerCase())
  );

  async function handleToggle(key: string) {
    if (!user) return;
    // Pantry-originated items are checked off in the shared household doc
    // so the tick syncs live to the partner.
    const item = items.find((it) => it.key === key);
    if (item?.fromPantry && householdId) {
      await toggleSharedPantryCheckedKey(
        householdId,
        weekIndex,
        key,
        sharedPantryCheckedByWeek
      );
      return;
    }
    await toggleCheckedKey(user.uid, checkedKeys, key);
  }

  async function handleToggleCustom(itemId: string) {
    if (!user) return;
    await updateCustomItems(
      user.uid,
      customItems.map((i) =>
        i.id === itemId ? { ...i, checked: !i.checked } : i
      )
    );
  }

  async function handleAddRecipe(recipeId: string) {
    if (!user) return;
    await addRecipeToWeek(
      user.uid,
      weekIndex,
      { recipeId, servingMultiplier: 1 },
      extraByWeek
    );
    setAddRecipeOpen(false);
    setRecipeSearch("");
  }

  async function handleRemoveExtra(entryId: string) {
    if (!user) return;
    await removeExtraEntry(user.uid, weekIndex, entryId, extraByWeek);
  }

  async function handleAddCustom() {
    if (!user || !customInput.trim()) return;
    const item: CustomShoppingItem = {
      id: crypto.randomUUID(),
      name: customInput.trim(),
      checked: false,
    };
    await updateCustomItems(user.uid, [...customItems, item]);
    setCustomInput("");
  }

  async function handleRemoveCustom(itemId: string) {
    if (!user) return;
    await updateCustomItems(
      user.uid,
      customItems.filter((i) => i.id !== itemId)
    );
  }

  async function handleClearChecked() {
    if (!user) return;
    await clearAllChecked(user.uid);
    if (customItems.some((i) => i.checked)) {
      await updateCustomItems(
        user.uid,
        customItems.map((i) => ({ ...i, checked: false }))
      );
    }
  }

  /** Persist metadata for an item — globally if linked, one-off if not */
  async function saveAssignment(
    item: ShoppingItem,
    next: {
      categoryId: string | null;
      locationId: string | null;
      sectionId: string | null;
      note: string | null;
      price: number | null;
    }
  ) {
    if (!user) return;
    try {
      if (item.isLinked && item.linkedLibraryId) {
        await updateLibraryIngredient(user.uid, item.linkedLibraryId, {
          shoppingCategoryId: next.categoryId,
          shoppingLocationId: next.locationId,
          shoppingSectionId: next.sectionId,
          shoppingNote: next.note,
          shoppingPrice: next.price,
        });
      } else {
        await setOneOffMeta(
          user.uid,
          weekIndex,
          item.key,
          {
            categoryId: next.categoryId,
            locationId: next.locationId,
            sectionId: next.sectionId,
            note: next.note,
            price: next.price,
          },
          oneOffByWeek
        );
      }
      toast.success("Updated");
      setAssigning(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    }
  }

  // ----- Pantry helpers -----
  async function handleTogglePantry(libraryId: string) {
    if (!householdId) return;
    const next = pantryCheckedIds.includes(libraryId)
      ? pantryCheckedIds.filter((id) => id !== libraryId)
      : [...pantryCheckedIds, libraryId];
    await setPantryCheckedForWeek(
      householdId,
      weekIndex,
      next,
      pantryCheckedByWeek
    );
  }

  async function handleCommitPantry() {
    if (!householdId) return;
    // Items NOT checked are the ones that need shopping
    const toAdd = pantryItems
      .filter((p) => !pantryCheckedIds.includes(p.id))
      .map((p) => p.id);
    await commitPantryForWeek(
      householdId,
      weekIndex,
      toAdd,
      pantryAddedByWeek,
      pantryProcessedByWeek
    );
    toast.success(
      toAdd.length
        ? `Added ${toAdd.length} pantry item${toAdd.length === 1 ? "" : "s"}`
        : "Pantry check complete"
    );
  }

  async function handleReopenPantry() {
    if (!householdId) return;
    await reopenPantryForWeek(householdId, weekIndex, pantryProcessedByWeek);
  }

  async function handleRemoveFromPantry(libraryId: string) {
    if (!householdId) return;
    await removePantryItemId(
      householdId,
      pantryItems.map((p) => p.id),
      libraryId
    );
  }

  async function handleAddPantryItem() {
    if (!user || !householdId || !pantryNewName.trim()) return;
    // Create the library ingredient under the current user, then register it
    // as a pantry item at the household level so both partners see it.
    const newId = await createPantryLibraryIngredient(user.uid, pantryNewName.trim());
    await addPantryItemId(
      householdId,
      pantryItems.map((p) => p.id),
      newId
    );
    setPantryNewName("");
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const isEmpty = items.length === 0 && customItems.length === 0;

  // Build ordered render plan for groups
  const renderGroups: Array<{
    id: string;
    label: string;
    items: ShoppingItem[];
    sublabel?: string | null;
    sections?: Array<{ id: string; label: string; items: ShoppingItem[] }>;
  }> = [];

  if (groupBy === "category") {
    for (const cat of categories) {
      const list = grouped.get(cat.id);
      const active = activeSortItems(list ?? []);
      if (active.length) {
        renderGroups.push({ id: cat.id, label: cat.name, items: active });
      }
    }
    const unassigned = activeSortItems(grouped.get(UNASSIGNED) ?? []);
    if (unassigned.length) {
      renderGroups.push({
        id: UNASSIGNED,
        label: "Unassigned",
        items: unassigned,
      });
    }
  } else {
    for (const loc of locations) {
      const list = grouped.get(loc.id);
      if (!list?.length) continue;
      // Sub-group by section
      const sectionsMap = new Map<string, ShoppingItem[]>();
      for (const it of list) {
        const sk = it.sectionId ?? UNASSIGNED;
        const arr = sectionsMap.get(sk) ?? [];
        arr.push(it);
        sectionsMap.set(sk, arr);
      }
      const orderedSections: Array<{ id: string; label: string; items: ShoppingItem[] }> = [];
      for (const sec of loc.sections) {
        const active = activeSortItems(sectionsMap.get(sec.id) ?? []);
        if (active.length) {
          orderedSections.push({ id: sec.id, label: sec.name, items: active });
        }
      }
      const noSection = activeSortItems(sectionsMap.get(UNASSIGNED) ?? []);
      if (noSection.length) {
        orderedSections.push({
          id: UNASSIGNED,
          label: "No section",
          items: noSection,
        });
      }
      // Skip the whole location if every item is checked
      if (orderedSections.length === 0) continue;
      const allActive = activeSortItems(list);
      renderGroups.push({
        id: loc.id,
        label: loc.name,
        items: allActive,
        sections: orderedSections,
      });
    }
    const unassigned = activeSortItems(grouped.get(UNASSIGNED) ?? []);
    if (unassigned.length) {
      renderGroups.push({
        id: UNASSIGNED,
        label: "Unassigned",
        items: unassigned,
      });
    }
  }

  return (
    <div className={`p-4 md:p-6 lg:p-8 space-y-5${isKT ? " kt-shop" : ""}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          {isKT && (
            <div className="kt-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
              Kitchen &middot; List
            </div>
          )}
          <h1 className={isKT ? "kt-serif text-3xl font-medium md:text-4xl mt-1" : "text-2xl font-bold tracking-tight"}>Shopping List</h1>
          {totalItems > 0 && (
            <p className="text-sm text-muted-foreground mt-0.5">
              {checkedCount}/{totalItems} items checked
            </p>
          )}
          {priceStats.priced > 0 && (
            <p className="text-sm font-semibold text-primary mt-0.5">
              Total ${priceStats.total.toFixed(2)}
              {priceStats.priced < priceStats.totalCount && (
                <span className="ml-1 text-xs font-normal text-muted-foreground">
                  ({priceStats.priced} of {priceStats.totalCount} priced)
                </span>
              )}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          {checkedCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl"
              onClick={handleClearChecked}
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              Clear checked
            </Button>
          )}
          <Dialog open={addRecipeOpen} onOpenChange={setAddRecipeOpen}>
            <DialogTrigger render={<Button size="sm" className="rounded-xl" />}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add Recipe
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add recipe to shopping list</DialogTitle>
              </DialogHeader>
              {hasActivePlan && weekRange && (
                <p className="text-xs text-muted-foreground -mt-1">
                  Adding to week {weekIndex + 1} ·{" "}
                  {format(weekRange.start, "MMM d")} –{" "}
                  {format(weekRange.end, "MMM d")}
                </p>
              )}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search recipes..."
                  value={recipeSearch}
                  onChange={(e) => setRecipeSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="max-h-64 overflow-y-auto space-y-1">
                {filteredAvailable.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No recipes available to add
                  </p>
                ) : (
                  filteredAvailable.map((recipe) => (
                    <button
                      key={recipe.id}
                      type="button"
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-muted/60"
                      onClick={() => handleAddRecipe(recipe.id)}
                    >
                      {recipe.photoURL ? (
                        <img
                          src={recipe.photoURL}
                          alt=""
                          className="h-10 w-10 rounded-lg object-cover shrink-0"
                        />
                      ) : (
                        <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                          <BookOpen className="h-4 w-4 text-muted-foreground/40" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {recipe.title}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {recipe.ingredients.length} ingredients
                        </p>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Week selector */}
      {hasActivePlan && instance && weekRange && (
        <Card className="pt-0">
          <CardContent className="flex items-center gap-3 px-3 py-2">
            <CalendarDays className="h-4 w-4 text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-muted-foreground">
                {instance.templateName} · Week {weekIndex + 1}/
                {instance.snapshot.length}
              </p>
              <p className="text-sm font-semibold truncate">
                {format(weekRange.start, "MMM d")} –{" "}
                {format(weekRange.end, "MMM d")}
              </p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                disabled={weekIndex === 0}
                onClick={() => setWeekIndex((i) => i - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                disabled={weekIndex >= instance.snapshot.length - 1}
                onClick={() => setWeekIndex((i) => i + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sources summary */}
      {(planRecipes.length > 0 || extraRecipes.length > 0) && (
        <div className="flex flex-wrap gap-2">
          {planRecipes.length > 0 && (
            <Badge variant="secondary" className="rounded-lg gap-1.5">
              <CalendarDays className="h-3 w-3" />
              {planRecipes.length} recipe{planRecipes.length === 1 ? "" : "s"}{" "}
              from meal plan
            </Badge>
          )}
          {extraRecipes.map(({ entry, recipe: r }) => (
            <Badge
              key={entry.id}
              variant="outline"
              className="rounded-lg gap-1 pr-1"
            >
              {r.title}
              {entry.servingMultiplier !== 1 && ` ×${entry.servingMultiplier}`}
              <button
                type="button"
                className="ml-1 rounded-full p-0.5 hover:bg-muted transition-colors"
                onClick={() => handleRemoveExtra(entry.id)}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      {/* Group-by toggle */}
      {!isEmpty && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Group by:</span>
          <div className="inline-flex rounded-lg border border-border bg-card p-0.5">
            <button
              type="button"
              onClick={() => setGroupBy("category")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                groupBy === "category"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Tag className="h-3 w-3" />
              Category
            </button>
            <button
              type="button"
              onClick={() => setGroupBy("location")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                groupBy === "location"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <MapPin className="h-3 w-3" />
              Location
            </button>
          </div>
        </div>
      )}

      {/* Unmapped heads-up */}
      {unmappedItems.length > 0 && (
        <Card className="pt-0 border-amber-500/40 bg-amber-500/5">
          <CardContent className="flex items-start gap-3 px-4 py-3">
            <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">
                {unmappedItems.length} item
                {unmappedItems.length === 1 ? "" : "s"} without a{" "}
                {groupBy === "category" ? "category" : "location"}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Click the pencil next to any item to assign it. Linked
                ingredients are saved for future recipes; one-off items get a
                weekly override.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Add custom item */}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          handleAddCustom();
        }}
      >
        <Input
          placeholder="Add a custom item..."
          value={customInput}
          onChange={(e) => setCustomInput(e.target.value)}
          className="rounded-xl bg-card border-transparent card-elevated"
        />
        <Button
          type="submit"
          size="icon"
          variant="outline"
          className="rounded-xl shrink-0"
          disabled={!customInput.trim()}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </form>

      {/* Empty state */}
      {isEmpty && (
        <Card className="pt-0">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted mb-4">
              <ShoppingCart className="h-8 w-8 text-muted-foreground/40" />
            </div>
            <h2 className="text-lg font-semibold">No items yet</h2>
            <p className="text-sm text-muted-foreground mt-1 max-w-xs">
              {hasActivePlan
                ? "Your meal plan recipes don't have ingredients yet. Add recipes with ingredients or type custom items above."
                : "Start a meal plan to auto-populate your shopping list, or add recipes manually."}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Custom items (active only) */}
      {activeCustomItems.length > 0 && (
        <div className="space-y-1.5">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            📝 Custom Items
          </h3>
          <Card className="pt-0">
            <CardContent className="divide-y p-0">
              {activeCustomItems.map((item) => (
                <div key={item.id} className="flex items-center gap-3 px-4 py-2.5">
                  <Checkbox
                    checked={item.checked}
                    onCheckedChange={() => handleToggleCustom(item.id)}
                  />
                  <span className="flex-1 text-sm">{item.name}</span>
                  <button
                    type="button"
                    className="text-muted-foreground/40 hover:text-destructive transition-colors"
                    onClick={() => handleRemoveCustom(item.id)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Grouped ingredient items */}
      {renderGroups.map((group) => (
        <div key={group.id} className="space-y-1.5">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            {groupBy === "location" ? (
              <MapPin className="h-3 w-3" />
            ) : (
              <Tag className="h-3 w-3" />
            )}
            {group.label}
            <span className="text-muted-foreground/50 font-normal normal-case">
              ({group.items.length})
            </span>
          </h3>
          <Card className="pt-0">
            <CardContent className="p-0">
              {group.sections && group.sections.length > 0 ? (
                group.sections.map((sec, i) => (
                  <div key={sec.id}>
                    {(group.sections!.length > 1 || sec.id !== UNASSIGNED) && (
                      <div
                        className={`px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 bg-muted/30 ${
                          i > 0 ? "border-t" : ""
                        }`}
                      >
                        {sec.label}
                      </div>
                    )}
                    <div className="divide-y">
                      {sec.items.map((item) => (
                        <ItemRow
                          key={item.key}
                          item={item}
                          onToggle={() => handleToggle(item.key)}
                          onAssign={() => setAssigning(item)}
                        />
                      ))}
                    </div>
                  </div>
                ))
              ) : (
                <div className="divide-y">
                  {group.items.map((item) => (
                    <ItemRow
                      key={item.key}
                      item={item}
                      onToggle={() => handleToggle(item.key)}
                      onAssign={() => setAssigning(item)}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      ))}

      {/* Completed (collapsed) */}
      {completedTotal > 0 && (
        <div className="space-y-1.5">
          <button
            type="button"
            onClick={() => setCompletedOpen((o) => !o)}
            className="flex w-full items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronDown
              className={`h-3 w-3 transition-transform ${
                completedOpen ? "" : "-rotate-90"
              }`}
            />
            <CheckCircle2 className="h-3 w-3 text-green-600 dark:text-green-500" />
            Completed
            <span className="text-muted-foreground/50 font-normal normal-case">
              ({completedTotal})
            </span>
          </button>
          {completedOpen && (
            <Card className="pt-0">
              <CardContent className="divide-y p-0">
                {completedItems.map((item) => (
                  <div
                    key={item.key}
                    className="flex items-center gap-3 px-4 py-2.5 opacity-70"
                  >
                    <Checkbox
                      checked
                      onCheckedChange={() => handleToggle(item.key)}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span className="text-sm font-medium line-through text-muted-foreground">
                          {item.name}
                        </span>
                        {item.quantity !== null ? (
                          <span className="text-xs text-muted-foreground/70 shrink-0">
                            {item.quantity} {item.unit}
                          </span>
                        ) : item.unit ? (
                          <span className="text-xs text-muted-foreground/70 shrink-0">
                            {item.unit}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
                {completedCustomItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 px-4 py-2.5 opacity-70"
                  >
                    <Checkbox
                      checked
                      onCheckedChange={() => handleToggleCustom(item.id)}
                    />
                    <span className="flex-1 text-sm line-through text-muted-foreground">
                      {item.name}
                    </span>
                    <button
                      type="button"
                      className="text-muted-foreground/40 hover:text-destructive transition-colors"
                      onClick={() => handleRemoveCustom(item.id)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Pantry Check section (bottom) */}
      <div className="space-y-1.5 pt-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <Package className="h-3 w-3" />
            Pantry &amp; household check
            {!pantryProcessed && pantryItems.length > 0 && (
              <span className="text-muted-foreground/50 font-normal normal-case">
                ({pantryItems.length - pantryCheckedIds.length} need shopping)
              </span>
            )}
          </h3>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setEditPantryOpen(true)}
            >
              <Pencil className="mr-1 h-3 w-3" />
              Edit
            </Button>
            {pantryProcessed && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={handleReopenPantry}
              >
                <RotateCcw className="mr-1 h-3 w-3" />
                Reopen
              </Button>
            )}
          </div>
        </div>

        {pantryProcessed ? (
          <Card className="pt-0 border-dashed">
            <CardContent className="px-4 py-3 text-xs text-muted-foreground">
              Pantry check complete for this week. Reopen if you need to revise.
            </CardContent>
          </Card>
        ) : pantryItems.length === 0 ? (
          <Card className="pt-0 border-dashed">
            <CardContent className="px-4 py-3 text-xs text-muted-foreground">
              No pantry items yet. Click <strong>Edit</strong> to add the staples
              you check before each shop.
            </CardContent>
          </Card>
        ) : (
          <Card className="pt-0">
            <CardContent className="p-0">
              <div className="px-4 py-2 text-[11px] text-muted-foreground border-b bg-muted/30">
                Tick the items you have enough of. The rest will be added to
                your shopping list.
              </div>
              <div className="divide-y">
                {pantryItems.map((p) => {
                  const skip = pantryCheckedIds.includes(p.id);
                  return (
                    <div
                      key={p.id}
                      className="flex items-center gap-3 px-4 py-2.5"
                    >
                      <Checkbox
                        checked={skip}
                        onCheckedChange={() => handleTogglePantry(p.id)}
                      />
                      <span
                        className={`flex-1 text-sm ${
                          skip ? "line-through text-muted-foreground/60" : ""
                        }`}
                      >
                        {p.name}
                      </span>
                      {p.shoppingPrice !== null &&
                        p.shoppingPrice !== undefined && (
                          <span className="text-xs text-muted-foreground shrink-0">
                            ${p.shoppingPrice.toFixed(2)}
                          </span>
                        )}
                    </div>
                  );
                })}
              </div>
              <div className="px-4 py-3 border-t flex justify-end">
                <Button
                  size="sm"
                  className="rounded-xl"
                  onClick={handleCommitPantry}
                >
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Add to shopping list
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Edit pantry dialog */}
      <Dialog open={editPantryOpen} onOpenChange={setEditPantryOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit pantry items</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground -mt-1">
            These are the staples you keep at home. They appear at the bottom of
            your shopping list each week so you can check what needs restocking.
          </p>

          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              handleAddPantryItem();
            }}
          >
            <Input
              placeholder="Add pantry item (e.g. olive oil)…"
              value={pantryNewName}
              onChange={(e) => setPantryNewName(e.target.value)}
            />
            <Button
              type="submit"
              size="icon"
              variant="outline"
              className="shrink-0"
              disabled={!pantryNewName.trim()}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </form>

          <div className="max-h-72 overflow-y-auto -mx-1">
            {pantryItems.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                No pantry items yet.
              </p>
            ) : (
              <div className="divide-y">
                {pantryItems.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center gap-3 px-2 py-2"
                  >
                    <span className="flex-1 text-sm">{p.name}</span>
                    <button
                      type="button"
                      className="text-muted-foreground/40 hover:text-destructive transition-colors"
                      onClick={() => handleRemoveFromPantry(p.id)}
                      title="Remove from pantry"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end pt-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setEditPantryOpen(false)}
            >
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Assign dialog */}
      <AssignDialog
        item={assigning}
        onClose={() => setAssigning(null)}
        onSave={saveAssignment}
        locations={locations}
        categories={categories}
        locationMap={locationMap}
      />
    </div>
  );
}

function ItemRow({
  item,
  onToggle,
  onAssign,
}: {
  item: ShoppingItem;
  onToggle: () => void;
  onAssign: () => void;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <Checkbox checked={item.checked} onCheckedChange={onToggle} />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span
            className={`text-sm font-medium ${
              item.checked ? "line-through text-muted-foreground/60" : ""
            }`}
          >
            {item.name}
          </span>
          {item.quantity !== null ? (
            <span className="text-xs text-muted-foreground shrink-0">
              {item.quantity} {item.unit}
            </span>
          ) : item.unit ? (
            <span className="text-xs text-muted-foreground shrink-0">
              {item.unit}
            </span>
          ) : null}
          {item.price !== null && (
            <span className="text-xs font-medium text-primary shrink-0 ml-auto">
              ${item.price.toFixed(2)}
            </span>
          )}
        </div>
        {item.note && (
          <p className="text-[11px] text-muted-foreground/80 italic truncate">
            {item.note}
          </p>
        )}
        {item.sources.length > 0 && (
          <p className="text-[10px] text-muted-foreground/60 truncate">
            {item.sources.map((s) => s.recipeName).join(", ")}
          </p>
        )}
      </div>
      <button
        type="button"
        className="text-muted-foreground/50 hover:text-foreground transition-colors p-1"
        onClick={onAssign}
        title="Assign location, category, note & price"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function AssignDialog({
  item,
  onClose,
  onSave,
  locations,
  categories,
  locationMap,
}: {
  item: ShoppingItem | null;
  onClose: () => void;
  onSave: (
    item: ShoppingItem,
    next: {
      categoryId: string | null;
      locationId: string | null;
      sectionId: string | null;
      note: string | null;
      price: number | null;
    }
  ) => Promise<void>;
  locations: import("@/lib/types/shopping-organization").ShoppingLocation[];
  categories: import("@/lib/types/shopping-organization").IngredientCategoryDef[];
  locationMap: Map<string, import("@/lib/types/shopping-organization").ShoppingLocation>;
}) {
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [locationId, setLocationId] = useState<string | null>(null);
  const [sectionId, setSectionId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [priceInput, setPriceInput] = useState("");
  const [saving, setSaving] = useState(false);

  // Reset on item change
  useEffect(() => {
    if (item) {
      setCategoryId(item.categoryId);
      setLocationId(item.locationId);
      setSectionId(item.sectionId);
      setNote(item.note ?? "");
      setPriceInput(item.price !== null ? String(item.price) : "");
    }
  }, [item]);

  const sections = locationId ? locationMap.get(locationId)?.sections ?? [] : [];

  async function handleSave() {
    if (!item) return;
    setSaving(true);
    try {
      // If section doesn't belong to selected location, drop it
      const validSection =
        sectionId && sections.some((s) => s.id === sectionId) ? sectionId : null;
      const trimmedNote = note.trim();
      const parsedPrice = priceInput.trim() ? Number(priceInput) : NaN;
      await onSave(item, {
        categoryId,
        locationId,
        sectionId: validSection,
        note: trimmedNote ? trimmedNote : null,
        price: Number.isFinite(parsedPrice) ? parsedPrice : null,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={!!item} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign “{item?.name}”</DialogTitle>
        </DialogHeader>
        {item && (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground -mt-2">
              {item.isLinked
                ? "This will be saved for all recipes using this ingredient."
                : "Free-text item — saved as a one-off override for this week only."}
            </p>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Category
              </label>
              <Select
                value={categoryId ?? ""}
                onValueChange={(v) => setCategoryId(v || null)}
              >
                <SelectTrigger>
                  <span className={categoryId ? "" : "text-muted-foreground"}>
                    {categoryId
                      ? (categories.find((c) => c.id === categoryId)?.name ?? "Unknown")
                      : "None"}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {categories.length === 0 && (
                <p className="text-[10px] text-muted-foreground">
                  No categories yet — create some in Settings.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Buy at
              </label>
              <Select
                value={locationId ?? ""}
                onValueChange={(v) => {
                  setLocationId(v || null);
                  setSectionId(null);
                }}
              >
                <SelectTrigger>
                  <span className={locationId ? "" : "text-muted-foreground"}>
                    {locationId
                      ? (locations.find((l) => l.id === locationId)?.name ?? "Unknown")
                      : "None"}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  {locations.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {locations.length === 0 && (
                <p className="text-[10px] text-muted-foreground">
                  No locations yet — create some in Settings.
                </p>
              )}
            </div>

            {locationId && sections.length > 0 && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  Section
                </label>
                <Select
                  value={sectionId ?? ""}
                  onValueChange={(v) => setSectionId(v || null)}
                >
                  <SelectTrigger>
                    <span className={sectionId ? "" : "text-muted-foreground"}>
                      {sectionId
                        ? (sections.find((s) => s.id === sectionId)?.name ?? "Unknown")
                        : "None"}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None</SelectItem>
                    {sections.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Note
              </label>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. organic, extra ripe…"
                rows={2}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Approximate price
              </label>
              <Input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={priceInput}
                onChange={(e) => setPriceInput(e.target.value)}
                placeholder="0.00"
              />
              {item.isLinked ? (
                <p className="text-[10px] text-muted-foreground">
                  Saved globally for this ingredient.
                </p>
              ) : (
                <p className="text-[10px] text-muted-foreground">
                  Saved as a one-off for this week only.
                </p>
              )}
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" size="sm" onClick={onClose}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                Save
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
