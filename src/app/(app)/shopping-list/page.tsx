"use client";

import React, { useState, useMemo, useEffect, useRef } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/contexts/auth-context";
import { useKitchenTool } from "@/lib/hooks/use-kitchen-tool";
import { useHousehold } from "@/lib/contexts/household-context";
import { useShoppingList } from "@/lib/hooks/use-shopping-list";
import { useShoppingOrganization } from "@/lib/hooks/use-shopping-organization";
import {
  toggleCheckedKey,
  addRecipeToWeek,
  removeExtraEntry,
  updateCustomItems,
  clearAllChecked,
  setOneOffMeta,
  clearExtraRecipesForWeek,
} from "@/lib/firebase/shopping-list";
import {
  updateLibraryIngredient,
  createPantryLibraryIngredient,
} from "@/lib/firebase/shopping-organization";
import {
  setSharedPantryCheck,
  commitPantryForWeek,
  reopenPantryForWeek,
  undoLastPantryCommit,
  toggleSharedPantryCheckedKey,
  addPantryItemId,
  removePantryItemId,
  softRemovePantryItem,
  restorePantryItem,
} from "@/lib/firebase/household-pantry";
import {
  addIndividualPantryItemId,
  removeIndividualPantryItemId,
  setIndividualPantryCheckedForWeek,
  commitIndividualPantryForWeek,
  reopenIndividualPantryForWeek,
  removeIndividualPantryItemFromWeek,
  excludeItemForWeek,
  undoLastIndividualPantryCommit,
} from "@/lib/firebase/shopping-list";
import { usePantryItems, type PantryScope, type PantryItem } from "@/lib/hooks/use-pantry-items";
import { MemberAvatar } from "@/components/shopping/member-avatar";
import { CommitPantryDialog } from "@/components/shopping/commit-pantry-dialog";
import { usePartnerTickToast } from "@/lib/hooks/use-partner-tick-toast";
import { useIngredientLibrary } from "@/lib/hooks/use-ingredient-library";
import type { LibraryIngredient } from "@/lib/types/recipe";
import type { Household, ProvenanceStamp } from "@/lib/types/household";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
  GripVertical,
  Wallet,
} from "lucide-react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  addDays,
  format,
  parseISO,
  startOfWeek,
  differenceInCalendarDays,
} from "date-fns";
import { getUnitOptions } from "@/lib/unit-standards";
import { useActivePlan } from "@/lib/hooks/use-active-plan";
import { useAdhocWeek } from "@/lib/hooks/use-adhoc-week";
import { currentWeekMonday } from "@/lib/firebase/meal-plans";
import type { PlanInstance } from "@/lib/types/meal-plan";
import type { ShoppingItem, CustomShoppingItem } from "@/lib/types/shopping-list";
import { toast } from "sonner";

type GroupBy = "category" | "location";
const UNASSIGNED = "__unassigned__";

export default function ShoppingListPage() {
  const { user } = useAuth();
  const isKT = useKitchenTool();
  const { household, householdId, partnerUid } = useHousehold();
  const { instance } = useActivePlan();
  const { adhocWeeks } = useAdhocWeek();
  const { locations, categories } = useShoppingOrganization();

  // Build a virtual 4-week freestyle instance when there's no active plan.
  // Mirrors the same construction used on the meal plan page.
  const freestyleInstance = useMemo<PlanInstance>(() => {
    const monday = currentWeekMonday();
    return {
      id: "freestyle",
      userId: user?.uid ?? "",
      templateId: "",
      templateName: "Freestyle",
      snapshot: adhocWeeks.map((w) => w?.snapshot[0] ?? { days: Array.from({ length: 7 }, () => ({ meals: [] })) }),
      startDate: monday,
      endDate: format(addDays(parseISO(monday), 27), "yyyy-MM-dd"),
      status: "adhoc",
    };
  }, [adhocWeeks, user?.uid]);

  // Use the active plan if one exists, otherwise fall back to the freestyle window.
  const effectiveInstance = instance ?? freestyleInstance;

  // Calendar-week offset: 0 = Monday of the week containing plan start.
  // Computed the same way as weekly-view so the two pages stay in sync.
  const calendarWeekMeta = useMemo(() => {
    const planStart = parseISO(effectiveInstance.startDate);
    const planEnd = addDays(planStart, effectiveInstance.snapshot.length * 7 - 1);
    const firstMonday = startOfWeek(planStart, { weekStartsOn: 1 });
    const lastMonday = startOfWeek(planEnd, { weekStartsOn: 1 });
    const totalWeeks = differenceInCalendarDays(lastMonday, firstMonday) / 7 + 1;
    return { firstMonday, totalWeeks };
  }, [effectiveInstance]);

  const [weekIndex, setWeekIndex] = useState(0);

  // Seed weekIndex to today's week once the active plan instance loads.
  // The useState initializer above can't do this reliably because `instance`
  // arrives asynchronously — it's null on first render, so effectiveInstance
  // would point at the freestyle fallback and compute an incorrect offset.
  const seededFromInstance = useRef(false);
  useEffect(() => {
    if (!instance || seededFromInstance.current) return;
    seededFromInstance.current = true;
    const planStart = parseISO(instance.startDate);
    const firstMonday = startOfWeek(planStart, { weekStartsOn: 1 });
    const planEnd = addDays(planStart, instance.snapshot.length * 7 - 1);
    const lastMonday = startOfWeek(planEnd, { weekStartsOn: 1 });
    const totalWeeks = differenceInCalendarDays(lastMonday, firstMonday) / 7 + 1;
    const todayMonday = startOfWeek(new Date(), { weekStartsOn: 1 });
    const offset = differenceInCalendarDays(todayMonday, firstMonday) / 7;
    setWeekIndex(Math.max(0, Math.min(totalWeeks - 1, offset)));
  }, [instance]);

  const {
    weekKey,
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
    pantryAddedIds,
    pantryCheckedIds,
    pantryProcessed,
    pantryAddedRawForWeek,
    pantryCheckedRawForWeek,
    pantryRemovedRawForWeek,
    pantryAddedProvenance,
    pantryCheckedProvenance,
    pantryProcessedStamp,
    sharedPantryCheckedRawForWeek,
    sharedPantryCheckedByWeek,
    sharedPantryCheckedProvenance,
    individualPantryItemIds,
    individualPantryCheckedByWeek,
    individualPantryAddedByWeek,
    individualPantryAddedIds,
    individualPantryProcessedByWeek,
    individualPantryCheckedIds,
    individualPantryProcessed,
    exclusionsByWeek,
    loading,
    hasActivePlan,
  } = useShoppingList(weekIndex, effectiveInstance);

  const { pantryItems } = usePantryItems(individualPantryItemIds);
  const { items: libraryItems } = useIngredientLibrary();

  // Surface a brief toast when the partner ticks a shared item off the list
  // (throttled so a fast scan at the supermarket doesn't spam notifications).
  usePartnerTickToast({
    currentUid: user?.uid,
    household,
    sharedPantryCheckedProvenance,
    items,
  });

  const [groupBy, setGroupBy] = useState<GroupBy>("category");
  const [addRecipeOpen, setAddRecipeOpen] = useState(false);
  const [recipeSearch, setRecipeSearch] = useState("");
  const [customInput, setCustomInput] = useState("");
  const [assigning, setAssigning] = useState<ShoppingItem | null>(null);
  const [editPantryOpen, setEditPantryOpen] = useState(false);
  const [commitPantryConfirmOpen, setCommitPantryConfirmOpen] = useState(false);
  const [undoConfirmOpen, setUndoConfirmOpen] = useState(false);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  type ResetScope = "extraRecipes" | "pantryIndividual" | "pantryHousehold" | "everything";
  const [resetScope, setResetScope] = useState<ResetScope>("everything");
  const [pantryNewName, setPantryNewName] = useState("");
  const [pantryAssigning, setPantryAssigning] = useState<PantryItem | null>(null);
  // Pending scope selection when a partner exists: holds the item to add until
  // the user picks Household or Individual.
  const [pendingAdd, setPendingAdd] = useState<{
    name: string;
    existing?: LibraryIngredient;
  } | null>(null);
  const [pendingScope, setPendingScope] = useState<PantryScope>("household");
  // Name of a brand-new ingredient being created via the creation dialog
  const [creatingPantryIngredient, setCreatingPantryIngredient] = useState<string | null>(null);

  const weekRange = useMemo(() => {
    const start = addDays(calendarWeekMeta.firstMonday, weekIndex * 7);
    const end = addDays(start, 6);
    return { start, end };
  }, [weekIndex, calendarWeekMeta]);

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

  // Active items only — checked items disappear into the "Completed" section.
  // When grouping by location, sort by user-defined section position (asc); items
  // without a position sink to the bottom in alpha order so they stay predictable
  // until the user drags them.
  function activeSortItems(list: ShoppingItem[]) {
    const active = list.filter((i) => !i.checked);
    if (groupBy !== "location") {
      return active.sort((a, b) => a.name.localeCompare(b.name));
    }
    return active.sort((a, b) => {
      const ap = a.sectionPosition;
      const bp = b.sectionPosition;
      if (ap !== null && bp !== null) return ap - bp;
      if (ap !== null) return -1;
      if (bp !== null) return 1;
      return a.name.localeCompare(b.name);
    });
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

  // Soft-removed items are still rendered (so the partner can restore) but
  // shouldn't contribute to totals, counts, or cost summaries.
  const activeItems = useMemo(() => items.filter((i) => !i.removedStamp), [items]);
  const totalItems = activeItems.length + customItems.length;
  const checkedCount =
    activeItems.filter((i) => i.checked).length +
    customItems.filter((i) => i.checked).length;

  // Total estimated cost broken down by origin.
  // Recipe items use `cost` (proportional: qty/priceQty × price).
  // Pantry items use `cost` when calculable, otherwise fall back to raw `price`
  // (since a pantry item represents buying the full unit, not a scaled portion).
  const priceStats = useMemo(() => {
    let recipeTotal = 0;
    let recipePriced = 0;
    let pantryTotal = 0;
    let pantryPriced = 0;
    for (const it of activeItems) {
      if (it.fromPantry) {
        const amt = it.cost ?? it.price; // cost first, raw price as fallback
        if (amt !== null) {
          pantryTotal += amt;
          pantryPriced++;
        }
      } else {
        if (it.cost !== null) {
          recipeTotal += it.cost;
          recipePriced++;
        }
      }
    }
    return {
      total: recipeTotal + pantryTotal,
      totalPriced: recipePriced + pantryPriced,
      totalCount: activeItems.length,
      recipeTotal,
      recipePriced,
      pantryTotal,
      pantryPriced,
    };
  }, [activeItems]);

  const filteredAvailable = availableRecipes.filter((r) =>
    r.title.toLowerCase().includes(recipeSearch.toLowerCase())
  );

  async function handleToggle(key: string) {
    if (!user) return;
    const item = items.find((it) => it.key === key);
    // Household pantry items tick against the shared household doc so both
    // partners see the update live. Individual and recipe items use personal state.
    if (item?.fromPantry && item.pantryShared && householdId) {
      // Snapshot cost at tick time so the cost-balance view doesn't drift if
      // the library price changes later. Falls back through cost → price → 0.
      const snapshotCost = item.cost ?? item.price ?? 0;
      await toggleSharedPantryCheckedKey(
        householdId,
        weekKey,
        key,
        user.uid,
        sharedPantryCheckedRawForWeek,
        { uid: user.uid, cost: snapshotCost, name: item.name }
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
      weekKey,
      { recipeId, servingMultiplier: 1 },
      extraByWeek
    );
    setAddRecipeOpen(false);
    setRecipeSearch("");
  }

  async function handleRemoveExtra(entryId: string) {
    if (!user) return;
    await removeExtraEntry(user.uid, weekKey, entryId, extraByWeek);
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

  // Drag-and-drop reorder within a section (location grouping only).
  const dragSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  async function handleSectionDragEnd(
    event: DragEndEvent,
    sectionItems: ShoppingItem[],
    locationId: string,
    sectionId: string
  ) {
    if (!user) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = sectionItems.findIndex((i) => i.key === active.id);
    const newIndex = sectionItems.findIndex((i) => i.key === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const reordered = arrayMove(sectionItems, oldIndex, newIndex);
    const posKey = `${locationId}:${sectionId}`;

    const writes = reordered.flatMap((item, idx) => {
      if (!item.linkedLibraryId) return [];
      const lib = libraryItems.find((li) => li.id === item.linkedLibraryId);
      if (!lib) return [];
      return [updateLibraryIngredient(user.uid, lib.id, {
        sectionPositions: { ...(lib.sectionPositions ?? {}), [posKey]: idx },
      })];
    });

    try {
      await Promise.all(writes);
    } catch {
      toast.error("Failed to save new order");
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
      priceQty: number | null;
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
          shoppingPriceQty: next.priceQty,
        });
      } else {
        // One-off items: priceQty doesn't apply (no library ingredient to link quantities to)
        await setOneOffMeta(
          user.uid,
          weekKey,
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

  async function handleSetPantryQuantity(item: ShoppingItem, qty: number | null) {
    if (!user) return;
    const existing = (oneOffByWeek[weekKey] ?? {})[item.key] ?? {};
    await setOneOffMeta(user.uid, weekKey, item.key, { ...existing, quantity: qty }, oneOffByWeek);
  }

  async function handleRemoveFromShoppingList(item: ShoppingItem) {
    if (!user) return;
    if (item.fromPantry && item.linkedLibraryId) {
      if (item.pantryShared) {
        if (!householdId) return;
        // Soft-remove: leaves an inline tombstone the partner can restore.
        await softRemovePantryItem(
          householdId,
          weekKey,
          item.linkedLibraryId,
          user.uid,
          pantryRemovedRawForWeek
        );
      } else {
        await removeIndividualPantryItemFromWeek(user.uid, weekKey, item.linkedLibraryId, individualPantryAddedIds);
      }
    } else {
      const currentExclusions = exclusionsByWeek[weekKey] ?? [];
      await excludeItemForWeek(user.uid, weekKey, item.key, currentExclusions);
    }
    setAssigning(null);
    toast.success("Removed from shopping list");
  }

  async function handleRestoreFromShoppingList(item: ShoppingItem) {
    if (!householdId || !item.linkedLibraryId) return;
    await restorePantryItem(
      householdId,
      weekKey,
      item.linkedLibraryId,
      pantryRemovedRawForWeek
    );
    toast.success("Restored");
  }

  // ----- Pantry helpers -----
  async function handleTogglePantry(libraryId: string, scope: PantryScope) {
    if (scope === "household") {
      if (!householdId || !user) return;
      const isCurrentlyChecked = pantryCheckedIds.includes(libraryId);
      const willBeSkipped = !isCurrentlyChecked;
      // If the user is marking "I have enough" on an item that's already on
      // the shopping list (re-opened week), also pull it from the list so the
      // two pieces of state stay coherent. Soft-remove keeps it restorable.
      const alsoRemove =
        willBeSkipped && pantryAddedIds.includes(libraryId);
      await Promise.all([
        setSharedPantryCheck(
          householdId,
          weekKey,
          libraryId,
          willBeSkipped,
          user.uid,
          pantryCheckedRawForWeek
        ),
        alsoRemove
          ? softRemovePantryItem(
              householdId,
              weekKey,
              libraryId,
              user.uid,
              pantryRemovedRawForWeek
            )
          : Promise.resolve(),
      ]);
    } else {
      if (!user) return;
      const willBeSkipped = !individualPantryCheckedIds.includes(libraryId);
      const next = willBeSkipped
        ? [...individualPantryCheckedIds, libraryId]
        : individualPantryCheckedIds.filter((id) => id !== libraryId);
      // Same coherency rule as household scope (no soft-delete for individual —
      // it's user-only, so a hard remove is fine).
      const alsoRemove =
        willBeSkipped && individualPantryAddedIds.includes(libraryId);
      await Promise.all([
        setIndividualPantryCheckedForWeek(user.uid, weekKey, next),
        alsoRemove
          ? removeIndividualPantryItemFromWeek(
              user.uid,
              weekKey,
              libraryId,
              individualPantryAddedIds
            )
          : Promise.resolve(),
      ]);
    }
  }

  async function handleConfirmCommit(opts: {
    addedHousehold: string[];
    addedIndividual: string[];
    skippedHousehold: string[];
    skippedIndividual: string[];
  }) {
    if (!householdId || !user) return;
    const { addedHousehold, addedIndividual, skippedHousehold, skippedIndividual } = opts;
    const nextIndividualSkips = Array.from(
      new Set([...individualPantryCheckedIds, ...skippedIndividual])
    );
    await Promise.all([
      commitPantryForWeek(
        householdId,
        weekKey,
        addedHousehold,
        user.uid,
        skippedHousehold,
        pantryCheckedRawForWeek,
        pantryRemovedRawForWeek
      ),
      commitIndividualPantryForWeek(user.uid, weekKey, addedIndividual),
      skippedIndividual.length > 0
        ? setIndividualPantryCheckedForWeek(user.uid, weekKey, nextIndividualSkips)
        : Promise.resolve(),
    ]);
    const total = addedHousehold.length + addedIndividual.length;
    toast.success(
      total
        ? `Added ${total} pantry item${total === 1 ? "" : "s"}`
        : "Pantry check complete"
    );
  }

  async function handleReopenPantry() {
    if (!householdId || !user) return;
    await Promise.all([
      reopenPantryForWeek(householdId, weekKey),
      reopenIndividualPantryForWeek(user.uid, weekKey),
    ]);
  }

  async function handleUndoCommit() {
    if (!user) return;
    await Promise.all([
      householdId ? undoLastPantryCommit(householdId, weekKey) : Promise.resolve(),
      undoLastIndividualPantryCommit(user.uid, weekKey),
    ]);
    setUndoConfirmOpen(false);
    toast.success("Commit undone");
  }

  async function handleReset() {
    if (!user) return;
    setResetDialogOpen(false);
    if (resetScope === "extraRecipes" || resetScope === "everything") {
      await clearExtraRecipesForWeek(user.uid, weekKey);
    }
    if (resetScope === "pantryIndividual" || resetScope === "everything") {
      await undoLastIndividualPantryCommit(user.uid, weekKey);
    }
    if ((resetScope === "pantryHousehold" || resetScope === "everything") && householdId) {
      await undoLastPantryCommit(householdId, weekKey);
    }
    if (resetScope === "everything") {
      await clearAllChecked(user.uid);
      if (customItems.some((i) => i.checked)) {
        await updateCustomItems(user.uid, customItems.map((i) => ({ ...i, checked: false })));
      }
    }
    toast.success("Week reset");
  }

  async function handleRemoveFromPantry(libraryId: string, scope: PantryScope) {
    if (!user) return;
    if (scope === "household") {
      if (!householdId) return;
      await removePantryItemId(householdId, pantryItems.filter((p) => p.scope === "household").map((p) => p.id), libraryId);
    } else {
      await removeIndividualPantryItemId(user.uid, individualPantryItemIds, libraryId);
    }
    // Clear the isPantryItem flag only if no pantry list still holds this item.
    const item = pantryItems.find((p) => p.id === libraryId);
    const stillInOtherScope = pantryItems.some((p) => p.id === libraryId && p.scope !== scope);
    if (!stillInOtherScope && item?.userId === user.uid) {
      await updateLibraryIngredient(user.uid, libraryId, { isPantryItem: false });
    }
  }

  async function handleChangePantryScope(libraryId: string, from: PantryScope, to: PantryScope) {
    if (from === to || !householdId || !user) return;
    if (to === "household") {
      await removeIndividualPantryItemId(user.uid, individualPantryItemIds, libraryId);
      await addPantryItemId(householdId, pantryItems.filter((p) => p.scope === "household").map((p) => p.id), libraryId);
    } else {
      await removePantryItemId(householdId, pantryItems.filter((p) => p.scope === "household").map((p) => p.id), libraryId);
      await addIndividualPantryItemId(user.uid, individualPantryItemIds, libraryId);
    }
  }

  async function commitAddPantryItem(
    existing: LibraryIngredient | undefined,
    name: string,
    scope: PantryScope
  ) {
    if (!user) return;
    const pantryIdSet = new Set(pantryItems.map((p) => p.id));
    const match =
      existing ??
      libraryItems.find((i) => i.name.trim().toLowerCase() === name.toLowerCase());

    if (match) {
      if (pantryIdSet.has(match.id)) {
        toast.info(`${match.name} is already in your pantry`);
        setPantryNewName("");
        return;
      }
      if (!match.isPantryItem) {
        await updateLibraryIngredient(user.uid, match.id, { isPantryItem: true });
      }
      if (scope === "household") {
        if (!householdId) return;
        await addPantryItemId(householdId, pantryItems.filter((p) => p.scope === "household").map((p) => p.id), match.id);
      } else {
        await addIndividualPantryItemId(user.uid, individualPantryItemIds, match.id);
      }
      toast.success(`Added ${match.name} from your ingredient library`);
      setPantryNewName("");
      return;
    }

    const newId = await createPantryLibraryIngredient(user.uid, name);
    if (scope === "household") {
      if (!householdId) return;
      await addPantryItemId(householdId, pantryItems.filter((p) => p.scope === "household").map((p) => p.id), newId);
    } else {
      await addIndividualPantryItemId(user.uid, individualPantryItemIds, newId);
    }
    setPantryNewName("");
  }

  async function commitCreateNewPantryIngredient(
    name: string,
    scope: PantryScope,
    fields: {
      servingUnit: string;
      shoppingCategoryId: string | null;
      shoppingLocationId: string | null;
      shoppingSectionId: string | null;
      shoppingNote: string | null;
      shoppingPrice: number | null;
      shoppingPriceQty: number | null;
    }
  ) {
    if (!user) return;
    const newId = await createPantryLibraryIngredient(user.uid, name, fields);
    if (scope === "household") {
      if (!householdId) return;
      await addPantryItemId(householdId, pantryItems.filter((p) => p.scope === "household").map((p) => p.id), newId);
    } else {
      await addIndividualPantryItemId(user.uid, individualPantryItemIds, newId);
    }
    setCreatingPantryIngredient(null);
    toast.success(`Added ${name} to your pantry`);
  }

  function handleAddPantryItem(existing?: LibraryIngredient) {
    const name = pantryNewName.trim();
    if (!existing && !name) return;

    const match =
      existing ??
      libraryItems.find((i) => i.name.trim().toLowerCase() === name.toLowerCase());

    if (match) {
      // Existing library ingredient — keep the old flow
      if (partnerUid) {
        setPantryNewName("");
        setPendingAdd({ name: match.name, existing: match });
        setPendingScope("household");
      } else {
        void commitAddPantryItem(match, match.name, "individual");
      }
    } else {
      // Brand-new ingredient — open the creation dialog
      setCreatingPantryIngredient(name);
      setPantryNewName("");
    }
  }

  async function confirmPendingAdd() {
    if (!pendingAdd) return;
    await commitAddPantryItem(pendingAdd.existing, pendingAdd.name, pendingScope);
    setPendingAdd(null);
  }

  const pantryAssignItem = useMemo(() => {
    if (!pantryAssigning) return null;
    return {
      key: pantryAssigning.id,
      name: pantryAssigning.name,
      unit: pantryAssigning.servingUnit ?? "",
      isLinked: true,
      categoryId: pantryAssigning.shoppingCategoryId ?? null,
      locationId: pantryAssigning.shoppingLocationId ?? null,
      sectionId: pantryAssigning.shoppingSectionId ?? null,
      note: pantryAssigning.shoppingNote ?? null,
      price: pantryAssigning.shoppingPrice ?? null,
      priceQty: pantryAssigning.shoppingPriceQty ?? null,
      libraryId: pantryAssigning.id,
      scope: pantryAssigning.scope,
    };
  }, [pantryAssigning]);

  async function savePantryAssignment(
    item: { libraryId: string },
    next: {
      categoryId: string | null;
      locationId: string | null;
      sectionId: string | null;
      note: string | null;
      price: number | null;
      priceQty: number | null;
    }
  ) {
    if (!user) return;
    try {
      await updateLibraryIngredient(user.uid, item.libraryId, {
        shoppingCategoryId: next.categoryId,
        shoppingLocationId: next.locationId,
        shoppingSectionId: next.sectionId,
        shoppingNote: next.note,
        shoppingPrice: next.price,
        shoppingPriceQty: next.priceQty,
      });
      toast.success("Updated");
      setPantryAssigning(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    }
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
    <div className={`p-4 md:p-6 lg:p-8 space-y-5 overflow-x-hidden${isKT ? " kt-shop" : ""}`}>
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
          {priceStats.totalPriced > 0 && (
            <div className="mt-0.5">
              <p className="text-sm font-semibold text-primary">
                Total ≈ ${priceStats.total.toFixed(2)}
                {priceStats.totalPriced < priceStats.totalCount && (
                  <span className="ml-1 text-xs font-normal text-muted-foreground">
                    ({priceStats.totalPriced} of {priceStats.totalCount} priced)
                  </span>
                )}
              </p>
              {priceStats.recipePriced > 0 && priceStats.pantryPriced > 0 && (
                <p className="text-xs text-muted-foreground">
                  Recipes ≈ ${priceStats.recipeTotal.toFixed(2)}
                  {" · "}
                  Pantry ${priceStats.pantryTotal.toFixed(2)}
                </p>
              )}
            </div>
          )}
        </div>
        <div className="flex gap-2">
          {partnerUid && (
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl"
              render={<Link href="/shopping-list/balance" />}
            >
              <Wallet className="mr-1.5 h-3.5 w-3.5" />
              Cost balance
            </Button>
          )}
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
          <Button
            variant="outline"
            size="sm"
            className="rounded-xl"
            onClick={() => setResetDialogOpen(true)}
          >
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
            Reset week
          </Button>
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
      {weekRange && (
        <Card className="pt-0">
          <CardContent className="flex items-center gap-3 px-3 py-2">
            <CalendarDays className="h-4 w-4 text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-muted-foreground">
                {effectiveInstance.templateName} · Week {weekIndex + 1}/
                {calendarWeekMeta.totalWeeks}
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
                disabled={weekIndex >= calendarWeekMeta.totalWeeks - 1}
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
              from {effectiveInstance.status === "adhoc" ? "freestyle" : "meal plan"}
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
                group.sections.map((sec, i) => {
                  const sortable =
                    groupBy === "location" &&
                    group.id !== UNASSIGNED &&
                    sec.id !== UNASSIGNED;
                  const rows = sec.items.map((item) =>
                    sortable ? (
                      <SortableItemRow
                        key={item.key}
                        item={item}
                        onToggle={() => handleToggle(item.key)}
                        onAssign={() => setAssigning(item)}
                        onSetQuantity={item.fromPantry ? (qty) => void handleSetPantryQuantity(item, qty) : undefined}
                        onRestore={
                          item.removedStamp
                            ? () => void handleRestoreFromShoppingList(item)
                            : undefined
                        }
                        household={household}
                        addedStamp={
                          item.fromPantry && item.pantryShared && item.linkedLibraryId
                            ? pantryAddedProvenance.get(item.linkedLibraryId) ?? null
                            : null
                        }
                        tickedStamp={
                          item.fromPantry && item.pantryShared && item.checked
                            ? sharedPantryCheckedProvenance.get(item.key) ?? null
                            : null
                        }
                      />
                    ) : (
                      <ItemRow
                        key={item.key}
                        item={item}
                        onToggle={() => handleToggle(item.key)}
                        onAssign={() => setAssigning(item)}
                        onSetQuantity={item.fromPantry ? (qty) => void handleSetPantryQuantity(item, qty) : undefined}
                        onRestore={
                          item.removedStamp
                            ? () => void handleRestoreFromShoppingList(item)
                            : undefined
                        }
                        household={household}
                        addedStamp={
                          item.fromPantry && item.pantryShared && item.linkedLibraryId
                            ? pantryAddedProvenance.get(item.linkedLibraryId) ?? null
                            : null
                        }
                        tickedStamp={
                          item.fromPantry && item.pantryShared && item.checked
                            ? sharedPantryCheckedProvenance.get(item.key) ?? null
                            : null
                        }
                      />
                    )
                  );
                  const inner = (
                    <div className="divide-y">{rows}</div>
                  );
                  return (
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
                      {sortable ? (
                        <DndContext
                          sensors={dragSensors}
                          collisionDetection={closestCenter}
                          onDragEnd={(e) =>
                            void handleSectionDragEnd(e, sec.items, group.id, sec.id)
                          }
                        >
                          <SortableContext
                            items={sec.items.map((it) => it.key)}
                            strategy={verticalListSortingStrategy}
                          >
                            {inner}
                          </SortableContext>
                        </DndContext>
                      ) : (
                        inner
                      )}
                    </div>
                  );
                })
              ) : (
                <div className="divide-y">
                  {group.items.map((item) => (
                    <ItemRow
                      key={item.key}
                      item={item}
                      onToggle={() => handleToggle(item.key)}
                      onAssign={() => setAssigning(item)}
                      onSetQuantity={item.fromPantry ? (qty) => void handleSetPantryQuantity(item, qty) : undefined}
                      onRestore={
                        item.removedStamp
                          ? () => void handleRestoreFromShoppingList(item)
                          : undefined
                      }
                      household={household}
                      addedStamp={
                        item.fromPantry && item.pantryShared && item.linkedLibraryId
                          ? pantryAddedProvenance.get(item.linkedLibraryId) ?? null
                          : null
                      }
                      tickedStamp={
                        item.fromPantry && item.pantryShared && item.checked
                          ? sharedPantryCheckedProvenance.get(item.key) ?? null
                          : null
                      }
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
                {completedItems.map((item) => {
                  const tickedStamp =
                    item.fromPantry && item.pantryShared
                      ? sharedPantryCheckedProvenance.get(item.key) ?? null
                      : null;
                  return (
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
                      {tickedStamp && (
                        <MemberAvatar
                          household={household}
                          stamp={tickedStamp}
                          action="Ticked"
                        />
                      )}
                    </div>
                  );
                })}
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
            Pantry check
            {!pantryProcessed && pantryItems.length > 0 && (
              <span className="text-muted-foreground/50 font-normal normal-case">
                ({pantryItems.length - pantryCheckedIds.length - individualPantryCheckedIds.length} need shopping)
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
          </div>
        </div>

        {pantryProcessed ? (
          <Card className="pt-0 border-dashed">
            <CardContent className="px-4 py-3 flex items-center gap-3">
              {pantryProcessedStamp ? (
                <MemberAvatar
                  household={household}
                  stamp={pantryProcessedStamp}
                  action="Committed"
                />
              ) : null}
              <div className="flex-1 min-w-0 text-xs text-muted-foreground leading-relaxed">
                {pantryProcessedStamp && pantryProcessedStamp.uid ? (
                  <>
                    {pantryProcessedStamp.uid === user?.uid
                      ? "You"
                      : (household?.memberNames?.[pantryProcessedStamp.uid] ?? "Partner")}
                    {" committed this week"}
                    {(() => {
                      const when = pantryProcessedStamp.at && typeof pantryProcessedStamp.at.toMillis === "function"
                        ? new Date(pantryProcessedStamp.at.toMillis()).toLocaleString(undefined, {
                            hour: "numeric",
                            minute: "2-digit",
                          })
                        : null;
                      return when ? ` at ${when}` : "";
                    })()}
                    {"."}
                  </>
                ) : (
                  "Pantry check complete for this week."
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={handleReopenPantry}
                  title="Re-open the pantry-check section so you can change skips"
                >
                  <RotateCcw className="mr-1 h-3 w-3" />
                  Re-open
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                  onClick={() => setUndoConfirmOpen(true)}
                  title="Reverse the commit and remove these items from the shopping list"
                >
                  <X className="mr-1 h-3 w-3" />
                  Undo
                </Button>
              </div>
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
                  const skip =
                    p.scope === "household"
                      ? pantryCheckedIds.includes(p.id)
                      : individualPantryCheckedIds.includes(p.id);
                  // Provenance is only meaningful for household items — show
                  // who skipped it so the partner doesn't have to ask.
                  const skipStamp =
                    p.scope === "household" && skip
                      ? pantryCheckedProvenance.get(p.id)
                      : null;
                  return (
                    <div
                      key={`${p.scope}:${p.id}`}
                      className="flex items-center gap-3 px-4 py-2.5"
                    >
                      <Checkbox
                        checked={skip}
                        onCheckedChange={() => handleTogglePantry(p.id, p.scope)}
                      />
                      <div className="flex-1 min-w-0">
                        <span
                          className={`text-sm ${
                            skip ? "line-through text-muted-foreground/60" : ""
                          }`}
                        >
                          {p.name}
                        </span>
                        {partnerUid && (
                          <div className="mt-0.5">
                            {p.scope === "household" ? (
                              <Badge className="h-4 px-1.5 text-[10px] font-medium bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-900/20 dark:text-violet-400 dark:border-violet-800">
                                Household
                              </Badge>
                            ) : (
                              <Badge className="h-4 px-1.5 text-[10px] font-medium bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800/50 dark:text-slate-400 dark:border-slate-700">
                                Individual
                              </Badge>
                            )}
                          </div>
                        )}
                      </div>
                      {skipStamp && (
                        <MemberAvatar
                          household={household}
                          stamp={skipStamp}
                          action="Skipped"
                        />
                      )}
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
                  onClick={() => setCommitPantryConfirmOpen(true)}
                >
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Add to shopping list
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Confirm undo of last pantry commit */}
      <Dialog open={undoConfirmOpen} onOpenChange={setUndoConfirmOpen}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Undo this week&rsquo;s pantry commit?</DialogTitle>
            <DialogDescription>
              All pantry items committed for this week will be removed from the
              shopping list. Skipped items stay marked as &ldquo;in stock&rdquo;.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              Cancel
            </DialogClose>
            <Button
              variant="destructive"
              onClick={() => void handleUndoCommit()}
            >
              Undo commit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset this week dialog */}
      <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <DialogContent showCloseButton={false} className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Reset this week</DialogTitle>
            <DialogDescription>
              Choose what to clear for week {weekIndex + 1}. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {(["extraRecipes", "pantryIndividual", "pantryHousehold", "everything"] as const)
              .filter((s) => {
                if (s === "pantryHousehold" && !householdId) return false;
                return true;
              })
              .map((s) => {
                const labels: Record<string, string> = {
                  extraRecipes: "Extra recipes only",
                  pantryIndividual: "My pantry only (individual)",
                  pantryHousehold: "Household pantry only",
                  everything: "Everything this week",
                };
                const descriptions: Record<string, string> = {
                  extraRecipes: "Removes manually-added recipes from the list",
                  pantryIndividual: "Undoes your personal pantry commit",
                  pantryHousehold: "Undoes the shared pantry commit (affects partner too)",
                  everything: "Clears recipes, pantry commits, and all checked items",
                };
                return (
                  <label
                    key={s}
                    className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors ${
                      resetScope === s
                        ? "border-primary bg-primary/5"
                        : "border-border hover:bg-muted/40"
                    }`}
                  >
                    <input
                      type="radio"
                      name="reset-scope"
                      value={s}
                      checked={resetScope === s}
                      onChange={() => setResetScope(s)}
                      className="mt-0.5 accent-primary"
                    />
                    <div>
                      <div className="text-sm font-medium">{labels[s]}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{descriptions[s]}</div>
                    </div>
                  </label>
                );
              })}
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              Cancel
            </DialogClose>
            <Button variant="destructive" onClick={() => void handleReset()}>
              Reset
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm add pantry to shopping list dialog */}
      <CommitPantryDialog
        open={commitPantryConfirmOpen}
        onOpenChange={setCommitPantryConfirmOpen}
        pantryItems={pantryItems}
        pantryCheckedIds={pantryCheckedIds}
        pantryCheckedProvenance={pantryCheckedProvenance}
        individualPantryCheckedIds={individualPantryCheckedIds}
        partnerUid={partnerUid}
        household={household}
        onConfirm={handleConfirmCommit}
      />

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

          <PantryAddCombobox
            value={pantryNewName}
            onChange={setPantryNewName}
            libraryItems={libraryItems}
            pantryIds={pantryItems.map((p) => p.id)}
            onSubmitNew={() => handleAddPantryItem()}
            onPickExisting={(lib) => handleAddPantryItem(lib)}
          />

          {/* Scope prompt — shown when user has a partner and just picked an item */}
          {pendingAdd && partnerUid && (
            <div className="rounded-lg border bg-muted/40 px-4 py-3 space-y-3">
              <p className="text-xs font-medium">
                Add &ldquo;{pendingAdd.existing?.name ?? pendingAdd.name}&rdquo; to:
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPendingScope("household")}
                  className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                    pendingScope === "household"
                      ? "border-violet-400 bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 dark:border-violet-600"
                      : "border-border text-muted-foreground hover:bg-muted"
                  }`}
                >
                  Household
                  <div className="text-[10px] font-normal mt-0.5 opacity-70">Shared with partner</div>
                </button>
                <button
                  type="button"
                  onClick={() => setPendingScope("individual")}
                  className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                    pendingScope === "individual"
                      ? "border-slate-400 bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-600"
                      : "border-border text-muted-foreground hover:bg-muted"
                  }`}
                >
                  Individual
                  <div className="text-[10px] font-normal mt-0.5 opacity-70">Only visible to you</div>
                </button>
              </div>
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setPendingAdd(null)}>
                  Cancel
                </Button>
                <Button size="sm" className="h-7 px-3 text-xs rounded-lg" onClick={() => void confirmPendingAdd()}>
                  Add
                </Button>
              </div>
            </div>
          )}

          <div className="max-h-72 overflow-y-auto -mx-1">
            {pantryItems.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                No pantry items yet.
              </p>
            ) : (
              <div className="divide-y">
                {pantryItems.map((p) => {
                  const loc = p.shoppingLocationId
                    ? locationMap.get(p.shoppingLocationId)
                    : null;
                  return (
                    <div
                      key={`${p.scope}:${p.id}`}
                      className="flex items-center gap-2 px-2 py-2"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-sm truncate">{p.name}</div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {partnerUid && (
                            p.scope === "household" ? (
                              <Badge className="h-4 px-1.5 text-[10px] font-medium bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-900/20 dark:text-violet-400 dark:border-violet-800">
                                Household
                              </Badge>
                            ) : (
                              <Badge className="h-4 px-1.5 text-[10px] font-medium bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800/50 dark:text-slate-400 dark:border-slate-700">
                                Individual
                              </Badge>
                            )
                          )}
                          {loc && (
                            <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                              <MapPin className="h-2.5 w-2.5" />
                              {loc.name}
                            </div>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="text-muted-foreground/60 hover:text-foreground transition-colors p-1"
                        onClick={() => setPantryAssigning(p)}
                        title="Edit"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        className="text-muted-foreground/40 hover:text-destructive transition-colors p-1"
                        onClick={() => handleRemoveFromPantry(p.id, p.scope)}
                        title="Remove from pantry"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
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

      {/* Pantry assign dialog */}
      <AssignDialog
        item={pantryAssignItem}
        onClose={() => setPantryAssigning(null)}
        onSave={savePantryAssignment}
        locations={locations}
        categories={categories}
        locationMap={locationMap}
        scopeSection={(() => {
          if (!pantryAssigning || !partnerUid) return undefined;
          // Read the live scope from pantryItems rather than from pantryAssigning,
          // so the toggle reflects Firestore state without mutating pantryAssigning
          // (mutating it would change the item reference and reset the form).
          const liveScope =
            pantryItems.find((p) => p.id === pantryAssigning.id)?.scope ??
            pantryAssigning.scope;
          return (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Visibility</label>
              <div className="flex gap-2">
                {(["household", "individual"] as PantryScope[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => void handleChangePantryScope(pantryAssigning.id, liveScope, s)}
                    className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                      liveScope === s
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
          );
        })()}
      />

      {/* Assign dialog */}
      <AssignDialog
        item={assigning}
        onClose={() => setAssigning(null)}
        onSave={saveAssignment}
        onRemove={assigning ? () => handleRemoveFromShoppingList(assigning) : undefined}
        locations={locations}
        categories={categories}
        locationMap={locationMap}
      />

      {/* Create new pantry ingredient dialog */}
      {creatingPantryIngredient !== null && (
        <CreatePantryIngredientDialog
          name={creatingPantryIngredient}
          partnerUid={partnerUid}
          locations={locations}
          categories={categories}
          locationMap={locationMap}
          onCancel={() => setCreatingPantryIngredient(null)}
          onConfirm={(scope, fields) => commitCreateNewPantryIngredient(creatingPantryIngredient, scope, fields)}
        />
      )}
    </div>
  );
}

function SortableItemRow({
  item,
  onToggle,
  onAssign,
  onSetQuantity,
  onRestore,
  household,
  addedStamp,
  tickedStamp,
}: {
  item: ShoppingItem;
  onToggle: () => void;
  onAssign: () => void;
  onSetQuantity?: (qty: number | null) => void;
  onRestore?: () => void;
  household?: Household | null;
  addedStamp?: ProvenanceStamp | null;
  tickedStamp?: ProvenanceStamp | null;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.key });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    background: isDragging ? "var(--muted)" : undefined,
  };
  return (
    <div ref={setNodeRef} style={style}>
      <ItemRow
        item={item}
        onToggle={onToggle}
        onAssign={onAssign}
        onSetQuantity={onSetQuantity}
        onRestore={onRestore}
        household={household}
        addedStamp={addedStamp}
        tickedStamp={tickedStamp}
        dragHandleProps={{ ...attributes, ...listeners }}
      />
    </div>
  );
}

function ItemRow({
  item,
  onToggle,
  onAssign,
  onSetQuantity,
  onRestore,
  dragHandleProps,
  household,
  addedStamp,
  tickedStamp,
}: {
  item: ShoppingItem;
  onToggle: () => void;
  onAssign: () => void;
  onSetQuantity?: (qty: number | null) => void;
  onRestore?: () => void;
  dragHandleProps?: React.HTMLAttributes<HTMLButtonElement>;
  household?: Household | null;
  addedStamp?: ProvenanceStamp | null;
  tickedStamp?: ProvenanceStamp | null;
}) {
  const isRemoved = !!item.removedStamp;
  // Decide which avatar (if any) to show on the right edge of the row.
  // Priority: ticker (when item is checked) → committer (when not yet ticked).
  const displayStamp = item.checked && tickedStamp ? tickedStamp : addedStamp;
  const displayAction = item.checked && tickedStamp ? "Ticked" : "Added";
  const [editingQty, setEditingQty] = useState(false);
  const [qtyInput, setQtyInput] = useState("");

  function startEditQty() {
    setQtyInput(item.quantity !== null ? String(item.quantity) : "");
    setEditingQty(true);
  }

  function commitQty() {
    setEditingQty(false);
    if (!onSetQuantity) return;
    const parsed = parseFloat(qtyInput);
    onSetQuantity(isNaN(parsed) || parsed <= 0 ? null : parsed);
  }

  return (
    <div className={`flex items-center gap-3 px-4 py-2.5 ${isRemoved ? "bg-muted/20" : ""}`}>
      {dragHandleProps && (
        <button
          type="button"
          aria-label="Reorder"
          className="text-muted-foreground/40 hover:text-foreground transition-colors cursor-grab active:cursor-grabbing -ml-1 p-0.5 touch-none"
          disabled={isRemoved}
          {...dragHandleProps}
        >
          <GripVertical className="h-4 w-4" />
        </button>
      )}
      <Checkbox
        checked={item.checked}
        onCheckedChange={onToggle}
        disabled={isRemoved}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span
            className={`text-sm font-medium ${
              isRemoved
                ? "line-through text-muted-foreground/50"
                : item.checked
                ? "line-through text-muted-foreground/60"
                : ""
            }`}
          >
            {item.name}
          </span>
          {/* Quantity display / inline editor */}
          {onSetQuantity && editingQty ? (
            <div className="flex items-baseline gap-1 shrink-0">
              <input
                type="number"
                min="0"
                step="any"
                value={qtyInput}
                autoFocus
                onChange={(e) => setQtyInput(e.target.value)}
                onBlur={commitQty}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); commitQty(); }
                  if (e.key === "Escape") { setEditingQty(false); }
                }}
                className="w-16 h-5 text-xs border border-input rounded px-1 bg-background text-foreground"
              />
              {item.unit && (
                <span className="text-xs text-muted-foreground">{item.unit}</span>
              )}
            </div>
          ) : item.quantity !== null ? (
            <button
              type="button"
              onClick={onSetQuantity ? startEditQty : undefined}
              title={onSetQuantity ? "Edit quantity (this week only)" : undefined}
              className={`text-xs text-muted-foreground shrink-0 ${onSetQuantity ? "hover:text-foreground hover:underline transition-colors" : ""}`}
            >
              {item.quantity} {item.unit}
            </button>
          ) : onSetQuantity ? (
            <button
              type="button"
              onClick={startEditQty}
              title="Set quantity (this week only)"
              className="text-xs text-muted-foreground/50 shrink-0 hover:text-foreground transition-colors"
            >
              {item.unit ? `+ qty (${item.unit})` : "+ qty"}
            </button>
          ) : item.unit ? (
            <span className="text-xs text-muted-foreground shrink-0">
              {item.unit}
            </span>
          ) : null}
          {item.cost !== null ? (
            <span className="text-xs font-medium text-primary shrink-0 ml-auto">
              ≈ ${item.cost.toFixed(2)}
            </span>
          ) : item.fromPantry && item.price !== null ? (
            <span className="text-xs text-muted-foreground shrink-0 ml-auto">
              ${item.price.toFixed(2)}
            </span>
          ) : null}
        </div>
        {item.note && (
          <p className="text-[11px] text-muted-foreground/80 italic truncate">
            {item.note}
          </p>
        )}
        {(item.fromPantry || item.sources.length > 0) && (
          <div className="flex items-center gap-1.5 mt-0.5">
            {item.fromPantry ? (
              <Badge className="h-4 px-1.5 text-[10px] font-medium bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800">
                {item.pantryShared ? "Pantry – Household" : "Pantry – Individual"}
              </Badge>
            ) : (
              <Badge className="h-4 px-1.5 text-[10px] font-medium bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-900/20 dark:text-sky-400 dark:border-sky-800">
                Plan
              </Badge>
            )}
            {item.sources.length > 0 && (
              <span className="text-[10px] text-muted-foreground/60 truncate">
                {item.sources.map((s) => s.recipeName).join(", ")}
              </span>
            )}
          </div>
        )}
      </div>
      {isRemoved ? (
        <div className="flex items-center gap-2 shrink-0">
          <MemberAvatar
            household={household ?? null}
            stamp={item.removedStamp}
            action="Removed"
          />
          {onRestore && (
            <button
              type="button"
              onClick={onRestore}
              className="text-xs font-medium text-primary hover:underline"
              title="Restore this item to the shopping list"
            >
              Restore
            </button>
          )}
        </div>
      ) : (
        <>
          {displayStamp && (
            <MemberAvatar
              household={household ?? null}
              stamp={displayStamp}
              action={displayAction}
            />
          )}
          <button
            type="button"
            className="text-muted-foreground/50 hover:text-foreground transition-colors p-1"
            onClick={onAssign}
            title="Assign location, category, note & price"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        </>
      )}
    </div>
  );
}

type AssignDialogItem = {
  key: string;
  name: string;
  /** Ingredient unit — shown alongside the price-qty field for linked items */
  unit: string;
  isLinked: boolean;
  categoryId: string | null;
  locationId: string | null;
  sectionId: string | null;
  note: string | null;
  price: number | null;
  priceQty: number | null;
};

function AssignDialog<T extends AssignDialogItem>({
  item,
  onClose,
  onSave,
  onRemove,
  locations,
  categories,
  locationMap,
  scopeSection,
}: {
  item: T | null;
  onClose: () => void;
  onSave: (
    item: T,
    next: {
      categoryId: string | null;
      locationId: string | null;
      sectionId: string | null;
      note: string | null;
      price: number | null;
      priceQty: number | null;
    }
  ) => Promise<void>;
  onRemove?: () => Promise<void>;
  locations: import("@/lib/types/shopping-organization").ShoppingLocation[];
  categories: import("@/lib/types/shopping-organization").IngredientCategoryDef[];
  locationMap: Map<string, import("@/lib/types/shopping-organization").ShoppingLocation>;
  /** Optional extra content rendered before the Save button — used for the pantry scope toggle */
  scopeSection?: React.ReactNode;
}) {
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [locationId, setLocationId] = useState<string | null>(null);
  const [sectionId, setSectionId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [priceInput, setPriceInput] = useState("");
  const [priceQtyInput, setPriceQtyInput] = useState("");
  const [saving, setSaving] = useState(false);

  // Reset on item change
  useEffect(() => {
    if (item) {
      setCategoryId(item.categoryId);
      setLocationId(item.locationId);
      setSectionId(item.sectionId);
      setNote(item.note ?? "");
      setPriceInput(item.price !== null ? String(item.price) : "");
      setPriceQtyInput(item.priceQty !== null ? String(item.priceQty) : "");
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
      const parsedPriceQty = priceQtyInput.trim() ? Number(priceQtyInput) : NaN;
      await onSave(item, {
        categoryId,
        locationId,
        sectionId: validSection,
        note: trimmedNote ? trimmedNote : null,
        price: Number.isFinite(parsedPrice) ? parsedPrice : null,
        priceQty:
          Number.isFinite(parsedPriceQty) && parsedPriceQty > 0
            ? parsedPriceQty
            : null,
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
                Purchase price
              </label>
              <div className="flex items-center gap-2">
                {item.isLinked && (
                  <>
                    <Input
                      type="number"
                      inputMode="decimal"
                      step="any"
                      min="0"
                      value={priceQtyInput}
                      onChange={(e) => setPriceQtyInput(e.target.value)}
                      placeholder="qty"
                      className="w-24"
                    />
                    {item.unit && (
                      <span className="text-xs text-muted-foreground shrink-0">
                        {item.unit}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground shrink-0">for</span>
                  </>
                )}
                <Input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  value={priceInput}
                  onChange={(e) => setPriceInput(e.target.value)}
                  placeholder="0.00"
                  className={item.isLinked ? "flex-1" : ""}
                />
              </div>
              <p className="text-[10px] text-muted-foreground">
                {item.isLinked
                  ? "e.g. $2.00 for 500 g — used to estimate cost per recipe. Saved globally."
                  : "Saved as a one-off for this week only."}
              </p>
            </div>

            {scopeSection}

            <div className="flex items-center justify-between pt-2">
              {onRemove ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => void onRemove()}
                  disabled={saving}
                >
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                  Remove from list
                </Button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={onClose}>
                  Cancel
                </Button>
                <Button size="sm" onClick={handleSave} disabled={saving}>
                  {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                  Save
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function PantryAddCombobox({
  value,
  onChange,
  libraryItems,
  pantryIds,
  onSubmitNew,
  onPickExisting,
}: {
  value: string;
  onChange: (v: string) => void;
  libraryItems: LibraryIngredient[];
  pantryIds: string[];
  onSubmitNew: () => void;
  onPickExisting: (lib: LibraryIngredient) => void;
}) {
  const [focused, setFocused] = useState(false);
  const pantrySet = useMemo(() => new Set(pantryIds), [pantryIds]);
  const trimmed = value.trim();
  const lower = trimmed.toLowerCase();

  const suggestions = useMemo(() => {
    if (!trimmed) return [];
    return libraryItems
      .filter((i) => i.name.toLowerCase().includes(lower))
      .sort((a, b) => {
        const an = a.name.toLowerCase();
        const bn = b.name.toLowerCase();
        const ap = an.startsWith(lower) ? 0 : 1;
        const bp = bn.startsWith(lower) ? 0 : 1;
        if (ap !== bp) return ap - bp;
        return a.name.localeCompare(b.name);
      })
      .slice(0, 8);
  }, [libraryItems, lower, trimmed]);

  const exactMatch = suggestions.find(
    (i) => i.name.trim().toLowerCase() === lower
  );
  const showCreate = trimmed && !exactMatch;
  const hasPanel = focused && trimmed && (suggestions.length > 0 || showCreate);

  return (
    <div className="relative">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!trimmed) return;
          if (exactMatch) {
            if (!pantrySet.has(exactMatch.id)) onPickExisting(exactMatch);
            else onChange("");
          } else {
            onSubmitNew();
          }
        }}
      >
        <Input
          placeholder="Add pantry item (e.g. olive oil)…"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 120)}
        />
        <Button
          type="submit"
          size="icon"
          variant="outline"
          className="shrink-0"
          disabled={!trimmed}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </form>

      {hasPanel && (
        <div className="absolute left-0 right-0 top-full mt-1 z-50 rounded-md border bg-popover shadow-md max-h-60 overflow-y-auto">
          {suggestions.map((lib) => {
            const already = pantrySet.has(lib.id);
            return (
              <button
                key={lib.id}
                type="button"
                disabled={already}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  if (already) return;
                  onPickExisting(lib);
                }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors flex items-center justify-between gap-2 ${
                  already ? "opacity-60 cursor-not-allowed" : ""
                }`}
              >
                <span className="truncate">{lib.name}</span>
                <span className="text-[10px] text-muted-foreground shrink-0">
                  {already
                    ? "Already in pantry"
                    : lib.isPantryItem
                      ? "In library"
                      : "In your ingredients"}
                </span>
              </button>
            );
          })}
          {showCreate && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onSubmitNew()}
              className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors border-t flex items-center gap-2"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>
                Create new pantry item: <strong>{trimmed}</strong>
              </span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function CreatePantryIngredientDialog({
  name,
  partnerUid,
  locations,
  categories,
  locationMap,
  onCancel,
  onConfirm,
}: {
  name: string;
  partnerUid: string | null | undefined;
  locations: import("@/lib/types/shopping-organization").ShoppingLocation[];
  categories: import("@/lib/types/shopping-organization").IngredientCategoryDef[];
  locationMap: Map<string, import("@/lib/types/shopping-organization").ShoppingLocation>;
  onCancel: () => void;
  onConfirm: (
    scope: PantryScope,
    fields: {
      servingUnit: string;
      shoppingCategoryId: string | null;
      shoppingLocationId: string | null;
      shoppingSectionId: string | null;
      shoppingNote: string | null;
      shoppingPrice: number | null;
      shoppingPriceQty: number | null;
    }
  ) => Promise<void>;
}) {
  const [servingUnit, setServingUnit] = useState("unit");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [locationId, setLocationId] = useState<string | null>(null);
  const [sectionId, setSectionId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [priceInput, setPriceInput] = useState("");
  const [priceQtyInput, setPriceQtyInput] = useState("");
  const [scope, setScope] = useState<PantryScope>("household");
  const [saving, setSaving] = useState(false);

  const unitOptions = getUnitOptions();
  const sections = locationId ? locationMap.get(locationId)?.sections ?? [] : [];

  async function handleConfirm() {
    setSaving(true);
    try {
      const validSection =
        sectionId && sections.some((s) => s.id === sectionId) ? sectionId : null;
      const parsedPrice = priceInput.trim() ? Number(priceInput) : NaN;
      const parsedPriceQty = priceQtyInput.trim() ? Number(priceQtyInput) : NaN;
      await onConfirm(scope, {
        servingUnit,
        shoppingCategoryId: categoryId,
        shoppingLocationId: locationId,
        shoppingSectionId: validSection,
        shoppingNote: note.trim() || null,
        shoppingPrice: Number.isFinite(parsedPrice) ? parsedPrice : null,
        shoppingPriceQty:
          Number.isFinite(parsedPriceQty) && parsedPriceQty > 0
            ? parsedPriceQty
            : null,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New pantry item: {name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground -mt-2">
            Set up how you use and buy this ingredient. All fields except unit are optional.
          </p>

          {/* Unit */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Unit</label>
            <Select value={servingUnit} onValueChange={(v) => v && setServingUnit(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {unitOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* How much I buy + price */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              I usually buy
            </label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                inputMode="decimal"
                step="any"
                min="0"
                value={priceQtyInput}
                onChange={(e) => setPriceQtyInput(e.target.value)}
                placeholder="qty"
                className="flex-1"
              />
              <span className="text-sm text-muted-foreground shrink-0">{servingUnit}</span>
              <span className="text-xs text-muted-foreground shrink-0">for</span>
              <Input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={priceInput}
                onChange={(e) => setPriceInput(e.target.value)}
                placeholder="price"
                className="w-24"
              />
            </div>
            <p className="text-[10px] text-muted-foreground">
              e.g. 500 g for $2.50 — used to estimate cost per recipe.
            </p>
          </div>

          {/* Category */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Category</label>
            <Select value={categoryId ?? ""} onValueChange={(v) => setCategoryId(v || null)}>
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
          </div>

          {/* Buy at */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Buy at</label>
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
          </div>

          {/* Section — only when location has sections */}
          {locationId && sections.length > 0 && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Section</label>
              <Select value={sectionId ?? ""} onValueChange={(v) => setSectionId(v || null)}>
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

          {/* Note */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Note</label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. organic, extra ripe…"
              rows={2}
            />
          </div>

          {/* Scope — only when user has a partner */}
          {partnerUid && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Visibility</label>
              <div className="flex gap-2">
                {(["household", "individual"] as PantryScope[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setScope(s)}
                    className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                      scope === s
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

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={onCancel} disabled={saving}>
              Cancel
            </Button>
            <Button size="sm" onClick={() => void handleConfirm()} disabled={saving}>
              {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Add to pantry
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
