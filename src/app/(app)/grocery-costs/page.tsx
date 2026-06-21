"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/contexts/auth-context";
import { useShoppingOrganization } from "@/lib/hooks/use-shopping-organization";
import { useWeeklyGroceryCost } from "@/lib/hooks/use-weekly-grocery-cost";
import {
  subscribeToLibrary,
  updateLibraryIngredient,
} from "@/lib/firebase/ingredient-library";
import {
  activeEntry,
  cheapestEntry,
  effectiveEntries,
  perUnit,
  swapSavings,
} from "@/lib/utils/grocery-cost";
import { buildGroceryCsv } from "@/lib/utils/grocery-csv";
import type { LibraryIngredient, PriceEntry } from "@/lib/types/recipe";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Check,
  Download,
  PiggyBank,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

const CUSTOM_LOCATION = "__custom__";
const UNCATEGORIZED = "__uncat__";

/** Prices are always a generic single currency. */
const CURRENCY = "$";
function formatMoney(amount: number, fractionDigits = 2): string {
  return `${CURRENCY}${amount.toFixed(fractionDigits)}`;
}

const SELECT_CLASS =
  "h-8 rounded-md border border-input bg-transparent px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

type SortKey =
  | "name"
  | "perUnitAsc"
  | "perUnitDesc"
  | "prices"
  | "savings";
type GroupKey = "none" | "category" | "location" | "status" | "pantry";
type StatusFilter = "all" | "priced" | "unpriced" | "cheaper" | "pantry";

interface Metrics {
  entries: PriceEntry[];
  active: PriceEntry | null;
  cheapest: PriceEntry | null;
  /** Per-unit price of the active (or cheapest) entry; null when unpriced. */
  perUnitPrice: number | null;
  /** Positive per-unit saving available by swapping to the cheapest. */
  saving: number;
  priced: boolean;
}

function getMetrics(item: LibraryIngredient): Metrics {
  const entries = effectiveEntries(item);
  const active = activeEntry(item);
  const cheapest = cheapestEntry(entries);
  const perUnitPrice = active
    ? perUnit(active)
    : cheapest
      ? perUnit(cheapest)
      : null;
  const saving =
    active && cheapest ? Math.max(0, perUnit(active) - perUnit(cheapest)) : 0;
  return { entries, active, cheapest, perUnitPrice, saving, priced: entries.length > 0 };
}

/** Labels that should always sort to the bottom of a grouped view. */
const RESIDUAL_LABELS = new Set([
  "Unpriced",
  "No price",
  "Uncategorized",
  "Regular",
]);

export default function GroceryCostsPage() {
  const { user } = useAuth();
  const { locations, categories } = useShoppingOrganization();
  const weekly = useWeeklyGroceryCost();

  const [items, setItems] = useState<LibraryIngredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [groupKey, setGroupKey] = useState<GroupKey>("none");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [locationFilter, setLocationFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  useEffect(() => {
    if (!user) return;
    return subscribeToLibrary(user.uid, (ingredients) => {
      setItems(ingredients);
      setLoading(false);
    });
  }, [user]);

  const locationName = useMemo(() => {
    const map = new Map(locations.map((l) => [l.id, l.name]));
    return (entry: PriceEntry) =>
      (entry.locationId && map.get(entry.locationId)) ||
      entry.locationName ||
      "Unspecified";
  }, [locations]);

  const categoryNameById = useMemo(
    () => new Map(categories.map((c) => [c.id, c.name])),
    [categories]
  );

  const q = search.trim().toLowerCase();

  /** Filtered + sorted + grouped pipeline. */
  const groups = useMemo(() => {
    // 1. Filter
    const list = items.filter((item) => {
      if (q && !item.name.toLowerCase().includes(q)) return false;

      const m = getMetrics(item);
      if (statusFilter === "priced" && !m.priced) return false;
      if (statusFilter === "unpriced" && m.priced) return false;
      if (statusFilter === "cheaper" && m.saving <= 0) return false;
      if (statusFilter === "pantry" && !item.isPantryItem) return false;

      if (locationFilter !== "all") {
        const hasLoc = m.entries.some((e) => e.locationId === locationFilter);
        if (!hasLoc) return false;
      }

      if (categoryFilter !== "all") {
        const cat = item.shoppingCategoryId ?? null;
        if (categoryFilter === UNCATEGORIZED) {
          if (cat) return false;
        } else if (cat !== categoryFilter) {
          return false;
        }
      }
      return true;
    });

    // 2. Sort
    const metricsOf = new Map(list.map((i) => [i.id, getMetrics(i)] as const));
    const byPrice = (a: LibraryIngredient, b: LibraryIngredient, dir: 1 | -1) => {
      const pa = metricsOf.get(a.id)!.perUnitPrice;
      const pb = metricsOf.get(b.id)!.perUnitPrice;
      if (pa == null && pb == null) return a.name.localeCompare(b.name);
      if (pa == null) return 1; // unpriced always last
      if (pb == null) return -1;
      if (pa === pb) return a.name.localeCompare(b.name);
      return (pa - pb) * dir;
    };
    list.sort((a, b) => {
      switch (sortKey) {
        case "perUnitAsc":
          return byPrice(a, b, 1);
        case "perUnitDesc":
          return byPrice(a, b, -1);
        case "prices": {
          const d = metricsOf.get(b.id)!.entries.length -
            metricsOf.get(a.id)!.entries.length;
          return d !== 0 ? d : a.name.localeCompare(b.name);
        }
        case "savings": {
          const d = metricsOf.get(b.id)!.saving - metricsOf.get(a.id)!.saving;
          return d !== 0 ? d : a.name.localeCompare(b.name);
        }
        default:
          return a.name.localeCompare(b.name);
      }
    });

    // 3. Group (preserves the sorted order within each group)
    const labelOf = (item: LibraryIngredient): string => {
      const m = metricsOf.get(item.id)!;
      switch (groupKey) {
        case "category":
          return (
            (item.shoppingCategoryId &&
              categoryNameById.get(item.shoppingCategoryId)) ||
            "Uncategorized"
          );
        case "location":
          return m.active ? locationName(m.active) : "No price";
        case "status":
          return !m.priced
            ? "Unpriced"
            : m.saving > 0
              ? "Cheaper available"
              : "Priced";
        case "pantry":
          return item.isPantryItem ? "Pantry" : "Regular";
        default:
          return "";
      }
    };

    if (groupKey === "none") {
      return [{ key: "all", label: "", items: list }];
    }
    const map = new Map<string, LibraryIngredient[]>();
    for (const item of list) {
      const label = labelOf(item);
      const arr = map.get(label);
      if (arr) arr.push(item);
      else map.set(label, [item]);
    }
    return Array.from(map.entries())
      .map(([label, groupItems]) => ({ key: label, label, items: groupItems }))
      .sort((a, b) => {
        const ar = RESIDUAL_LABELS.has(a.label) ? 1 : 0;
        const br = RESIDUAL_LABELS.has(b.label) ? 1 : 0;
        if (ar !== br) return ar - br;
        return a.label.localeCompare(b.label);
      });
  }, [
    items,
    q,
    statusFilter,
    locationFilter,
    categoryFilter,
    sortKey,
    groupKey,
    categoryNameById,
    locationName,
  ]);

  const selected = useMemo(
    () => items.find((i) => i.id === selectedId) ?? null,
    [items, selectedId]
  );

  const pricedCount = useMemo(
    () => items.filter((i) => effectiveEntries(i).length > 0).length,
    [items]
  );
  const resultCount = groups.reduce((n, g) => n + g.items.length, 0);

  function handleExport() {
    if (items.length === 0) {
      toast.error("Nothing to export yet");
      return;
    }
    const csv = buildGroceryCsv(items, {
      locationLabel: locationName,
      categoryLabel: (item) =>
        (item.shoppingCategoryId &&
          categoryNameById.get(item.shoppingCategoryId)) ||
        "",
    });
    // Prepend a UTF-8 BOM so Excel reads accented characters correctly.
    const blob = new Blob(["﻿" + csv], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `grocery-costs-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${items.length} ingredients`);
  }

  if (!user) return null;

  function renderRow(item: LibraryIngredient) {
    const m = getMetrics(item);
    const canSave = m.saving > 0;
    return (
      <button
        key={item.id}
        onClick={() => setSelectedId(item.id)}
        className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left hover:bg-muted/50 transition-colors"
      >
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate">{item.name}</p>
          {m.active ? (
            <p className="text-xs text-muted-foreground">
              {formatMoney(m.active.price)} / {m.active.qty}
              {m.active.unit} · {locationName(m.active)}
              {m.active.minQty != null && m.active.minQty > 0 && (
                <span className="text-amber-600 dark:text-amber-400">
                  {" "}
                  · min {m.active.minQty}
                  {m.active.unit}
                </span>
              )}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground italic">
              No price recorded
            </p>
          )}
        </div>
        {canSave && (
          <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 shrink-0">
            Save {formatMoney(m.saving)}/{m.active!.unit}
          </Badge>
        )}
        {m.entries.length > 1 && !canSave && (
          <span className="text-xs text-muted-foreground shrink-0">
            {m.entries.length} prices
          </span>
        )}
      </button>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-3xl mx-auto">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label="Back to settings"
            render={<Link href="/settings" />}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2">
            <PiggyBank className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight">Grocery Costs</h1>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleExport}
          disabled={items.length === 0}
        >
          <Download className="h-4 w-4 mr-1" /> Export
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        Track what you pay for each ingredient, compare prices across stores, and
        swap to the cheapest. {pricedCount} of {items.length} ingredient
        {items.length !== 1 ? "s" : ""} priced.
      </p>

      {/* Weekly average — consumption-based, smoothed across the meal plan */}
      {!weekly.loading && weekly.weeksCounted > 0 && (
        <div className="rounded-lg border bg-primary/5 px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Average weekly grocery cost
          </p>
          <p className="text-2xl font-bold">
            {formatMoney(weekly.average)}
            <span className="text-sm font-normal text-muted-foreground">
              {" "}
              / week
            </span>
          </p>
          <p className="text-xs text-muted-foreground">
            Based on what your meal plan uses across {weekly.weeksCounted} planned
            week{weekly.weeksCounted !== 1 ? "s" : ""}, using the prices you&apos;ve
            recorded. Bulk buys are spread over what you actually consume.
          </p>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="Search ingredients…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-8"
        />
      </div>

      {/* Filter / group / sort controls */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <ControlSelect
          label="Show"
          value={statusFilter}
          onChange={(v) => setStatusFilter(v as StatusFilter)}
          options={[
            { value: "all", label: "All ingredients" },
            { value: "priced", label: "Priced only" },
            { value: "unpriced", label: "Unpriced only" },
            { value: "cheaper", label: "Cheaper option available" },
            { value: "pantry", label: "Pantry items" },
          ]}
        />
        {locations.length > 0 && (
          <ControlSelect
            label="Store"
            value={locationFilter}
            onChange={setLocationFilter}
            options={[
              { value: "all", label: "All stores" },
              ...locations.map((l) => ({ value: l.id, label: l.name })),
            ]}
          />
        )}
        {categories.length > 0 && (
          <ControlSelect
            label="Category"
            value={categoryFilter}
            onChange={setCategoryFilter}
            options={[
              { value: "all", label: "All categories" },
              ...categories.map((c) => ({ value: c.id, label: c.name })),
              { value: UNCATEGORIZED, label: "Uncategorized" },
            ]}
          />
        )}
        <ControlSelect
          label="Group"
          value={groupKey}
          onChange={(v) => setGroupKey(v as GroupKey)}
          options={[
            { value: "none", label: "None" },
            { value: "category", label: "Category" },
            { value: "location", label: "Active store" },
            { value: "status", label: "Pricing status" },
            { value: "pantry", label: "Pantry / regular" },
          ]}
        />
        <ControlSelect
          label="Sort"
          value={sortKey}
          onChange={(v) => setSortKey(v as SortKey)}
          options={[
            { value: "name", label: "Name (A–Z)" },
            { value: "perUnitAsc", label: "Price per unit ↑" },
            { value: "perUnitDesc", label: "Price per unit ↓" },
            { value: "prices", label: "Most prices" },
            { value: "savings", label: "Biggest saving" },
          ]}
        />
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : resultCount === 0 ? (
        <p className="text-sm text-muted-foreground">
          {items.length === 0
            ? "No ingredients yet — they'll appear here as you add recipes."
            : "No ingredients match the current filters."}
        </p>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <div key={group.key}>
              {group.label && (
                <div className="flex items-center justify-between px-1 pb-1">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {group.label}
                  </p>
                  <span className="text-xs text-muted-foreground">
                    {group.items.length}
                  </span>
                </div>
              )}
              <div className="divide-y rounded-lg border">
                {group.items.map(renderRow)}
              </div>
            </div>
          ))}
        </div>
      )}

      {selected && (
        <IngredientPriceDialog
          key={selected.id}
          item={selected}
          locations={locations}
          locationName={locationName}
          currencySymbol={CURRENCY}
          format={formatMoney}
          onClose={() => setSelectedId(null)}
          onChange={async (fields) =>
            updateLibraryIngredient(user.uid, selected.id, fields)
          }
        />
      )}
    </div>
  );
}

interface ControlSelectProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}

function ControlSelect({ label, value, onChange, options }: ControlSelectProps) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className="font-medium">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={SELECT_CLASS}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

interface DialogProps {
  item: LibraryIngredient;
  locations: { id: string; name: string }[];
  locationName: (entry: PriceEntry) => string;
  currencySymbol: string;
  format: (amount: number, fractionDigits?: number) => string;
  onClose: () => void;
  onChange: (
    fields: Partial<Omit<LibraryIngredient, "id" | "userId">>
  ) => Promise<void>;
}

function IngredientPriceDialog({
  item,
  locations,
  locationName,
  currencySymbol,
  format,
  onClose,
  onChange,
}: DialogProps) {
  const entries = effectiveEntries(item);
  const active = activeEntry(item);
  const cheapest = cheapestEntry(entries);
  const unit = item.servingUnit || "unit";

  const [saving, setSaving] = useState(false);
  const [swapTarget, setSwapTarget] = useState<PriceEntry | null>(null);

  // Add-entry form
  const [locChoice, setLocChoice] = useState<string>(
    locations[0]?.id ?? CUSTOM_LOCATION
  );
  const [customLoc, setCustomLoc] = useState("");
  const [price, setPrice] = useState("");
  const [qty, setQty] = useState("");
  const [minQty, setMinQty] = useState("");

  async function persist(
    nextEntries: PriceEntry[],
    activeId: string | null | undefined
  ) {
    const activeForMirror =
      activeId != null
        ? nextEntries.find((e) => e.id === activeId) ?? null
        : null;
    setSaving(true);
    try {
      await onChange({
        priceEntries: nextEntries,
        activePriceEntryId: activeId ?? null,
        shoppingPrice: activeForMirror ? activeForMirror.price : null,
        shoppingPriceQty: activeForMirror ? activeForMirror.qty : null,
        shoppingLocationId: activeForMirror
          ? activeForMirror.locationId
          : item.shoppingLocationId ?? null,
      });
    } catch {
      toast.error("Failed to save");
      throw new Error("save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleAdd() {
    const parsedPrice = Number(price);
    const parsedQty = Number(qty);
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
      toast.error("Enter a valid price");
      return;
    }
    if (!Number.isFinite(parsedQty) || parsedQty <= 0) {
      toast.error("Enter how much you bought");
      return;
    }
    const isCustom = locChoice === CUSTOM_LOCATION;
    const name = isCustom
      ? customLoc.trim()
      : locations.find((l) => l.id === locChoice)?.name ?? "";
    if (isCustom && !name) {
      toast.error("Name the location");
      return;
    }
    const parsedMin = minQty.trim() ? Number(minQty) : NaN;
    if (minQty.trim() && (!Number.isFinite(parsedMin) || parsedMin <= 0)) {
      toast.error("Enter a valid minimum, or leave it blank");
      return;
    }
    const entry: PriceEntry = {
      id:
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      locationId: isCustom ? null : locChoice,
      locationName: name,
      price: parsedPrice,
      qty: parsedQty,
      minQty: Number.isFinite(parsedMin) && parsedMin > 0 ? parsedMin : null,
      unit,
      addedAt: Date.now(),
    };
    const nextEntries = [...entries, entry];
    // First-ever price becomes active automatically; otherwise keep the current
    // active entry (folding in a legacy entry by its stable id when present).
    const nextActive = active ? active.id : entry.id;
    try {
      await persist(nextEntries, nextActive);
      setPrice("");
      setQty("");
      setMinQty("");
      setCustomLoc("");
      toast.success("Price added");
    } catch {
      /* toast already shown */
    }
  }

  async function handleDelete(entry: PriceEntry) {
    const nextEntries = entries.filter((e) => e.id !== entry.id);
    let nextActive: string | null | undefined = active?.id;
    if (active?.id === entry.id) {
      // Deleted the active entry — fall back to the cheapest remaining one.
      nextActive = cheapestEntry(nextEntries)?.id ?? null;
    }
    try {
      await persist(nextEntries, nextActive);
      toast.success("Price removed");
    } catch {
      /* toast already shown */
    }
  }

  async function confirmSwap() {
    if (!swapTarget) return;
    try {
      await persist(entries, swapTarget.id);
      const savings = swapSavings(active, swapTarget);
      if (savings && savings.perUnitDelta > 0) {
        toast.success(
          `Swapped — saving ${format(savings.perUnitDelta)}/${unit}`
        );
      } else {
        toast.success("Active price updated");
      }
      setSwapTarget(null);
    } catch {
      /* toast already shown */
    }
  }

  const sorted = [...entries].sort((a, b) => perUnit(a) - perUnit(b));

  return (
    <Dialog open onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{item.name}</DialogTitle>
          <DialogDescription>
            Prices are compared per {unit}. Swap to make a price your default —
            it updates shopping-list cost estimates.
          </DialogDescription>
        </DialogHeader>

        {swapTarget ? (
          <SwapConfirm
            target={swapTarget}
            active={active}
            unit={unit}
            locationName={locationName}
            format={format}
            saving={saving}
            onCancel={() => setSwapTarget(null)}
            onConfirm={confirmSwap}
          />
        ) : (
          <div className="space-y-4">
            {/* Existing prices */}
            {sorted.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No prices yet. Add your first below.
              </p>
            ) : (
              <div className="space-y-2">
                {sorted.map((entry) => {
                  const isActive = active?.id === entry.id;
                  const isCheapest = cheapest?.id === entry.id;
                  return (
                    <div
                      key={entry.id}
                      className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 ${
                        isActive
                          ? "border-primary bg-primary/5"
                          : "border-border"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">
                          {locationName(entry)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {format(entry.price)} / {entry.qty}
                          {entry.unit} ·{" "}
                          <span className="font-medium">
                            {format(perUnit(entry))}/{entry.unit}
                          </span>
                        </p>
                        {entry.minQty != null && entry.minQty > 0 && (
                          <p className="text-[11px] text-amber-600 dark:text-amber-400">
                            Buy {entry.minQty}
                            {entry.unit}+ to get this price
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {isCheapest && sorted.length > 1 && (
                          <Badge
                            variant="secondary"
                            className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                          >
                            Best
                          </Badge>
                        )}
                        {isActive ? (
                          <Badge className="gap-1">
                            <Check className="h-3 w-3" /> Active
                          </Badge>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={saving}
                            onClick={() => setSwapTarget(entry)}
                          >
                            Swap
                          </Button>
                        )}
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          disabled={saving}
                          onClick={() => handleDelete(entry)}
                          aria-label={`Delete ${locationName(entry)} price`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Add a price */}
            <div className="rounded-lg border border-dashed p-3 space-y-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Add a price
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="gc-loc" className="text-xs">
                  Location
                </Label>
                <select
                  id="gc-loc"
                  value={locChoice}
                  onChange={(e) => setLocChoice(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                  <option value={CUSTOM_LOCATION}>Other…</option>
                </select>
              </div>
              {locChoice === CUSTOM_LOCATION && (
                <Input
                  placeholder="Location name (e.g. Corner store)"
                  value={customLoc}
                  onChange={(e) => setCustomLoc(e.target.value)}
                />
              )}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="gc-price" className="text-xs">
                    Price ({currencySymbol})
                  </Label>
                  <Input
                    id="gc-price"
                    type="number"
                    min={0}
                    step="any"
                    inputMode="decimal"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="gc-qty" className="text-xs">
                    For how much ({unit})
                  </Label>
                  <Input
                    id="gc-qty"
                    type="number"
                    min={0}
                    step="any"
                    inputMode="decimal"
                    value={qty}
                    onChange={(e) => setQty(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="gc-min" className="text-xs">
                  Minimum to buy ({unit}){" "}
                  <span className="text-muted-foreground font-normal">
                    — optional, for bulk prices
                  </span>
                </Label>
                <Input
                  id="gc-min"
                  type="number"
                  min={0}
                  step="any"
                  inputMode="decimal"
                  placeholder={`e.g. buy ${unit === "unit" ? "10" : "5"}${unit} or more`}
                  value={minQty}
                  onChange={(e) => setMinQty(e.target.value)}
                />
              </div>
              <Button
                size="sm"
                className="w-full"
                disabled={saving}
                onClick={handleAdd}
              >
                <Plus className="h-4 w-4 mr-1" /> Add price
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

interface SwapConfirmProps {
  target: PriceEntry;
  active: PriceEntry | null;
  unit: string;
  locationName: (entry: PriceEntry) => string;
  format: (amount: number, fractionDigits?: number) => string;
  saving: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

function SwapConfirm({
  target,
  active,
  unit,
  locationName,
  format,
  saving,
  onCancel,
  onConfirm,
}: SwapConfirmProps) {
  const savings = swapSavings(active, target);
  const cheaper = savings && savings.perUnitDelta > 0;
  const pricier = savings && savings.perUnitDelta < 0;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border p-3 text-sm">
        <p>
          Switch to <strong>{locationName(target)}</strong> at{" "}
          <strong>
            {format(perUnit(target))}/{unit}
          </strong>
          {active && (
            <>
              {" "}
              instead of{" "}
              <span className="text-muted-foreground">
                {format(perUnit(active))}/{unit}
              </span>
            </>
          )}
          ?
        </p>
        {savings && cheaper && (
          <p className="mt-2 font-medium text-emerald-600 dark:text-emerald-400">
            You save {format(savings.perUnitDelta)}/{unit} (
            {savings.percent.toFixed(0)}% cheaper).
          </p>
        )}
        {savings && pricier && (
          <p className="mt-2 font-medium text-amber-600 dark:text-amber-400">
            This is {format(-savings.perUnitDelta)}/{unit} more expensive (
            {Math.abs(savings.percent).toFixed(0)}% pricier).
          </p>
        )}
        {savings && !cheaper && !pricier && (
          <p className="mt-2 text-muted-foreground">Same price per {unit}.</p>
        )}
        {target.minQty != null && target.minQty > 0 && (
          <p className="mt-2 text-amber-600 dark:text-amber-400">
            Requires buying at least {target.minQty}
            {unit} to unlock this price.
          </p>
        )}
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button size="sm" onClick={onConfirm} disabled={saving}>
          {saving ? "Swapping…" : "Confirm swap"}
        </Button>
      </div>
    </div>
  );
}
