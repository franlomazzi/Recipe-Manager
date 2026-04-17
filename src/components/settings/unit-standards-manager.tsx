"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/contexts/auth-context";
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Database, Plus, Trash2, X, Info } from "lucide-react";
import { toast } from "sonner";
import {
  DEFAULT_STANDARDS,
  loadUserStandards,
  loadUnitStandards,
  updateUnitStandards,
  type UnitStandards,
} from "@/lib/unit-standards";

// ─────────────────────────────────────────────────────────────────────────────
// How units work — shown in the info panel
// ─────────────────────────────────────────────────────────────────────────────
const INFO_UNITS = `
Units define how ingredient quantities are stored and compared across this app
and your food tracking app. Both apps read the same shared list from your
account.

A unit is a short canonical label, e.g. "g", "ml", "cup". When you log an
ingredient, the quantity you enter is always in that unit. The food tracking
app uses the unit to know how to scale macros — for example, if a food is
referenced at 100 g, adding 250 g of it to a recipe multiplies the macros by 2.5.

The 11 built-in units (g, kg, ml, l, tsp, tbsp, cup, oz, lb, unit, portion)
cover most recipes. Add custom units — like "scoop" or "can" — if you need
them. They'll appear in the unit picker when editing ingredients.
`.trim();

const INFO_ALIASES = `
Aliases let you type common variations and have them silently mapped to the
canonical unit. For example, typing "grams" is automatically stored as "g".

Aliases are applied when:
  • You import or paste recipe data with free-text units
  • Legacy recipes are opened in the edit form

They do NOT affect what you see in the unit picker — the picker always shows
canonical units. Aliases are a background cleanup mechanism, not a display
setting.

Example: alias "gramms" → "g" fixes a common typo in imported recipes.
`.trim();

export function UnitStandardsManager() {
  const { user } = useAuth();
  const [stored, setStored] = useState<UnitStandards | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newUnit, setNewUnit] = useState("");
  const [newAlias, setNewAlias] = useState("");
  const [targetUnit, setTargetUnit] = useState<string>("");
  const [showInfo, setShowInfo] = useState<"units" | "aliases" | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await loadUserStandards(user.uid);
        if (cancelled) return;
        setStored(data);
        setTargetUnit(
          data.authorizedUnits[0] ?? DEFAULT_STANDARDS.authorizedUnits[0]
        );
      } catch (err) {
        console.error("Failed to load unit standards:", err);
        toast.error("Failed to load unit standards");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (!user) return null;

  // Stored doc may have been written by the tracking app (which stores the full
  // merged list including defaults). Strip defaults from display so we don't
  // confuse "your additions" with built-ins that re-appear on every load.
  const storedUnits = stored?.authorizedUnits ?? [];
  const storedAliases = stored?.aliases ?? {};

  const customUnits = storedUnits.filter(
    (u) => !DEFAULT_STANDARDS.authorizedUnits.includes(u)
  );
  const customAliases = Object.fromEntries(
    Object.entries(storedAliases).filter(
      ([k]) => !(k in DEFAULT_STANDARDS.aliases)
    )
  );

  // Full merged unit list for the alias target selector.
  const allUnits = Array.from(
    new Set([...DEFAULT_STANDARDS.authorizedUnits, ...customUnits])
  );

  async function persist(updated: UnitStandards) {
    if (!user) return;
    setSaving(true);
    try {
      await updateUnitStandards(user.uid, updated);
      setStored(updated);
      await loadUnitStandards(user.uid);
    } catch (err) {
      console.error("Failed to save unit standards:", err);
      toast.error("Failed to save changes");
    } finally {
      setSaving(false);
    }
  }

  async function handleAddUnit() {
    if (!stored) return;
    const normalized = newUnit.trim().toLowerCase();
    if (!normalized) return;
    if (allUnits.includes(normalized)) {
      toast.error(`"${normalized}" is already an authorized unit`);
      return;
    }
    // Write back the stored doc unchanged except for the new unit appended.
    // We preserve whatever the tracking app stored (full list or partial).
    await persist({
      ...stored,
      authorizedUnits: [...storedUnits, normalized],
    });
    setNewUnit("");
    toast.success(`"${normalized}" added`);
  }

  async function handleRemoveUnit(unit: string) {
    if (!stored) return;
    if (
      !confirm(
        `Remove "${unit}"? Existing recipes keep the unit but it won't appear in the unit picker.`
      )
    )
      return;
    await persist({
      ...stored,
      authorizedUnits: storedUnits.filter((u) => u !== unit),
    });
  }

  async function handleAddAlias() {
    if (!stored) return;
    const alias = newAlias.trim().toLowerCase();
    const target = targetUnit.trim().toLowerCase();
    if (!alias || !target) return;
    if (alias === target) {
      toast.error("Alias can't be the same as the target unit");
      return;
    }
    if (alias in DEFAULT_STANDARDS.aliases || alias in customAliases) {
      toast.error(`An alias for "${alias}" already exists`);
      return;
    }
    await persist({
      ...stored,
      aliases: { ...storedAliases, [alias]: target },
    });
    setNewAlias("");
    toast.success(`"${alias}" → "${target}" added`);
  }

  async function handleRemoveAlias(alias: string) {
    if (!stored) return;
    const next = { ...storedAliases };
    delete next[alias];
    await persist({ ...stored, aliases: next });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="h-5 w-5 text-primary" />
          Ingredient Units
        </CardTitle>
        <CardDescription>
          Shared with your food tracking app — changes sync instantly to both.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <Tabs defaultValue="units" className="w-full">
            <TabsList>
              <TabsTrigger value="units">Units</TabsTrigger>
              <TabsTrigger value="aliases">Aliases</TabsTrigger>
            </TabsList>

            {/* ── UNITS TAB ─────────────────────────────────────────── */}
            <TabsContent value="units" className="mt-4 space-y-4">
              {/* Info toggle */}
              <button
                type="button"
                onClick={() =>
                  setShowInfo(showInfo === "units" ? null : "units")
                }
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <Info className="h-3.5 w-3.5" />
                {showInfo === "units" ? "Hide explanation" : "What are units?"}
              </button>

              {showInfo === "units" && (
                <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground whitespace-pre-line">
                  {INFO_UNITS}
                </div>
              )}

              {/* Add row */}
              <div className="flex gap-2">
                <Input
                  placeholder="New unit (e.g. scoop)"
                  value={newUnit}
                  onChange={(e) => setNewUnit(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddUnit();
                    }
                  }}
                  disabled={saving}
                />
                <Button
                  onClick={handleAddUnit}
                  disabled={saving || !newUnit.trim()}
                >
                  <Plus className="h-4 w-4" />
                  Add
                </Button>
              </div>

              {/* Flat unit list */}
              <div className="flex flex-wrap gap-2">
                {DEFAULT_STANDARDS.authorizedUnits.map((u) => (
                  <Badge key={u} variant="secondary" className="font-mono">
                    {u}
                  </Badge>
                ))}
                {customUnits.map((u) => (
                  <Badge
                    key={u}
                    variant="outline"
                    className="font-mono gap-1 pr-1"
                  >
                    {u}
                    <button
                      type="button"
                      onClick={() => handleRemoveUnit(u)}
                      disabled={saving}
                      className="rounded-sm opacity-60 hover:opacity-100 hover:text-destructive transition-opacity"
                      aria-label={`Remove ${u}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>

              {customUnits.length === 0 && (
                <p className="text-sm text-muted-foreground italic">
                  No custom units yet. The 11 built-in units cover most recipes.
                </p>
              )}
            </TabsContent>

            {/* ── ALIASES TAB ───────────────────────────────────────── */}
            <TabsContent value="aliases" className="mt-4 space-y-4">
              {/* Info toggle */}
              <button
                type="button"
                onClick={() =>
                  setShowInfo(showInfo === "aliases" ? null : "aliases")
                }
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <Info className="h-3.5 w-3.5" />
                {showInfo === "aliases"
                  ? "Hide explanation"
                  : "What are aliases?"}
              </button>

              {showInfo === "aliases" && (
                <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground whitespace-pre-line">
                  {INFO_ALIASES}
                </div>
              )}

              {/* Add row */}
              <div className="flex items-end gap-2">
                <div className="flex-1 space-y-1">
                  <label className="text-xs font-medium uppercase text-muted-foreground">
                    Incoming name
                  </label>
                  <Input
                    placeholder='e.g. "gramms"'
                    value={newAlias}
                    onChange={(e) => setNewAlias(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddAlias();
                      }
                    }}
                    disabled={saving}
                  />
                </div>
                <span className="pb-2 text-muted-foreground">→</span>
                <div className="flex-1 space-y-1">
                  <label className="text-xs font-medium uppercase text-muted-foreground">
                    Maps to
                  </label>
                  <Select
                    value={targetUnit}
                    onValueChange={(v) => setTargetUnit(v ?? "")}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Unit" />
                    </SelectTrigger>
                    <SelectContent>
                      {allUnits.map((u) => (
                        <SelectItem key={u} value={u}>
                          {u}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  onClick={handleAddAlias}
                  disabled={saving || !newAlias.trim() || !targetUnit}
                  className="mb-0"
                >
                  <Plus className="h-4 w-4" />
                  Add
                </Button>
              </div>

              {/* Flat alias list */}
              <div className="space-y-1">
                {[
                  ...Object.entries(DEFAULT_STANDARDS.aliases).map(
                    ([k, v]) => ({ alias: k, target: v, removable: false })
                  ),
                  ...Object.entries(customAliases).map(([k, v]) => ({
                    alias: k,
                    target: v,
                    removable: true,
                  })),
                ].map(({ alias, target, removable }) => (
                  <div
                    key={alias}
                    className="flex items-center gap-3 rounded-md border border-border px-3 py-2 text-sm"
                  >
                    <span className="font-mono flex-1">{alias}</span>
                    <span className="text-muted-foreground">→</span>
                    <span className="font-mono font-semibold text-primary min-w-[48px]">
                      {target}
                    </span>
                    {removable ? (
                      <button
                        type="button"
                        onClick={() => handleRemoveAlias(alias)}
                        disabled={saving}
                        className="text-muted-foreground hover:text-destructive transition-colors"
                        aria-label={`Remove alias ${alias}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    ) : (
                      <span className="w-4" />
                    )}
                  </div>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}
