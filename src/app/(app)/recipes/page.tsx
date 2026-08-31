"use client";

import { useEffect, useMemo, useState } from "react";
import { useRecipes } from "@/lib/hooks/use-recipes";
import { useKitchenTool } from "@/lib/hooks/use-kitchen-tool";
import { useAuth } from "@/lib/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus,
  Search,
  Clock,
  ChefHat,
  Heart,
  Star,
  LayoutGrid,
  List,
  Users,
  SlidersHorizontal,
  ArrowUpDown,
  EyeOff,
  X,
} from "lucide-react";
import Link from "next/link";
import { ImportRecipeModal } from "@/components/recipe/import-recipe-modal";
import type { Recipe, Difficulty } from "@/lib/types/recipe";

type SortKey =
  | "default"
  | "title-asc"
  | "newest"
  | "updated"
  | "most-cooked"
  | "highest-rated"
  | "quickest";

const SORT_LABEL: Record<SortKey, string> = {
  default: "Favorites first",
  "title-asc": "Title (A–Z)",
  newest: "Recently added",
  updated: "Recently updated",
  "most-cooked": "Most cooked",
  "highest-rated": "Highest rated",
  quickest: "Quickest",
};

const TIME_OPTIONS: { label: string; value: number | null }[] = [
  { label: "Any", value: null },
  { label: "≤ 15m", value: 15 },
  { label: "≤ 30m", value: 30 },
  { label: "≤ 45m", value: 45 },
  { label: "≤ 60m", value: 60 },
];

const RATING_OPTIONS: { label: string; value: number | null }[] = [
  { label: "Any", value: null },
  { label: "≥ 3", value: 3 },
  { label: "≥ 4", value: 4 },
  { label: "≥ 4.5", value: 4.5 },
];

const SOURCE_OPTIONS = [
  { label: "All", value: "all" as const },
  { label: "Mine", value: "mine" as const },
  { label: "Shared", value: "shared" as const },
];

type SourceFilter = (typeof SOURCE_OPTIONS)[number]["value"];

/**
 * Hidden recipes stay out of the library by default — either because their
 * creator flagged `hiddenFromList`, or because this user hid them from their
 * own list (the only option for a recipe a partner shared). They're still fully
 * available in the meal plan picker and everywhere else — this filter just
 * decides whether the library shows them too.
 */
const HIDDEN_OPTIONS = [
  { label: "Hide", value: "exclude" as const },
  { label: "Show", value: "include" as const },
  { label: "Only", value: "only" as const },
];

type HiddenFilter = (typeof HIDDEN_OPTIONS)[number]["value"];

interface FilterState {
  difficulties: Set<Difficulty>;
  categories: Set<string>;
  maxTime: number | null;
  minRating: number | null;
  source: SourceFilter;
  hidden: HiddenFilter;
}

const DEFAULT_FILTERS: FilterState = {
  difficulties: new Set(),
  categories: new Set(),
  maxTime: null,
  minRating: null,
  source: "all",
  hidden: "exclude",
};

const PREFS_KEY = "recipes:list-prefs:v1";

interface StoredPrefs {
  difficulties?: Difficulty[];
  categories?: string[];
  maxTime?: number | null;
  minRating?: number | null;
  source?: SourceFilter;
  hidden?: HiddenFilter;
  sort?: SortKey;
  favoritesOnly?: boolean;
  view?: "grid" | "list";
}

function loadPrefs(): StoredPrefs | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    return raw ? (JSON.parse(raw) as StoredPrefs) : null;
  } catch {
    return null;
  }
}

function savePrefs(p: StoredPrefs) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    /* ignore quota / disabled storage */
  }
}

function recipeEffectiveTime(r: Recipe): number | null {
  if (r.totalTime > 0) return r.totalTime;
  if (r.averageDuration && r.averageDuration > 0) return r.averageDuration;
  return null;
}

function applyFilters(
  recipes: Recipe[],
  search: string,
  favoritesOnly: boolean,
  filters: FilterState,
  uid: string | undefined,
  isRecipeHidden: (r: Recipe) => boolean,
): Recipe[] {
  const q = search.toLowerCase().trim();
  return recipes.filter((r) => {
    if (filters.hidden === "exclude" && isRecipeHidden(r)) return false;
    if (filters.hidden === "only" && !isRecipeHidden(r)) return false;
    if (q) {
      const inTitle = r.title.toLowerCase().includes(q);
      const inCats = r.categories.some((c) => c.toLowerCase().includes(q));
      if (!inTitle && !inCats) return false;
    }
    if (favoritesOnly && !r.isFavorite) return false;
    if (filters.difficulties.size > 0 && !filters.difficulties.has(r.difficulty)) return false;
    if (filters.categories.size > 0) {
      const hit = r.categories.some((c) => filters.categories.has(c));
      if (!hit) return false;
    }
    if (filters.maxTime != null) {
      const t = recipeEffectiveTime(r);
      if (t == null || t > filters.maxTime) return false;
    }
    if (filters.minRating != null) {
      if (r.rating == null || r.rating < filters.minRating) return false;
    }
    if (filters.source === "mine" && r.userId !== uid) return false;
    if (filters.source === "shared" && r.userId === uid) return false;
    return true;
  });
}

function applySort(recipes: Recipe[], sort: SortKey): Recipe[] {
  const arr = recipes.slice();
  switch (sort) {
    case "title-asc":
      return arr.sort((a, b) => a.title.localeCompare(b.title));
    case "newest":
      return arr.sort(
        (a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0),
      );
    case "updated":
      return arr.sort(
        (a, b) => (b.updatedAt?.toMillis?.() ?? 0) - (a.updatedAt?.toMillis?.() ?? 0),
      );
    case "most-cooked":
      return arr.sort((a, b) => (b.cookCount ?? 0) - (a.cookCount ?? 0));
    case "highest-rated":
      return arr.sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1));
    case "quickest":
      return arr.sort((a, b) => {
        const ta = recipeEffectiveTime(a) ?? Number.POSITIVE_INFINITY;
        const tb = recipeEffectiveTime(b) ?? Number.POSITIVE_INFINITY;
        return ta - tb;
      });
    case "default":
    default:
      return arr.sort((a, b) => (b.isFavorite ? 1 : 0) - (a.isFavorite ? 1 : 0));
  }
}

function activeFilterCount(f: FilterState): number {
  return (
    f.difficulties.size +
    f.categories.size +
    (f.maxTime != null ? 1 : 0) +
    (f.minRating != null ? 1 : 0) +
    (f.source !== "all" ? 1 : 0) +
    (f.hidden !== "exclude" ? 1 : 0)
  );
}

function FilterPanel({
  filters,
  setFilters,
  availableCategories,
  variant = "default",
}: {
  filters: FilterState;
  setFilters: (next: FilterState) => void;
  availableCategories: string[];
  variant?: "default" | "kt";
}) {
  const toggleDifficulty = (d: Difficulty) => {
    const next = new Set(filters.difficulties);
    if (next.has(d)) next.delete(d);
    else next.add(d);
    setFilters({ ...filters, difficulties: next });
  };
  const toggleCategory = (c: string) => {
    const next = new Set(filters.categories);
    if (next.has(c)) next.delete(c);
    else next.add(c);
    setFilters({ ...filters, categories: next });
  };
  const reset = () => setFilters({ ...DEFAULT_FILTERS, difficulties: new Set(), categories: new Set() });

  const chipBase =
    variant === "kt"
      ? "px-2.5 py-1 text-xs border kt-hair transition-colors"
      : "px-2.5 py-1 text-xs rounded-full border transition-colors";
  const chipOn =
    variant === "kt"
      ? "bg-primary text-primary-foreground border-primary"
      : "bg-primary text-primary-foreground border-primary";
  const chipOff =
    variant === "kt"
      ? "hover:bg-secondary"
      : "bg-card hover:bg-secondary border-border";

  return (
    <div className="flex flex-col gap-3 w-80 max-w-[90vw]">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">Filters</div>
        <button
          onClick={reset}
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          type="button"
        >
          <X className="h-3 w-3" /> Reset
        </button>
      </div>

      <div>
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">
          Difficulty
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(["easy", "medium", "hard"] as Difficulty[]).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => toggleDifficulty(d)}
              className={`${chipBase} ${filters.difficulties.has(d) ? chipOn : chipOff}`}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">
          Max time
        </div>
        <div className="flex flex-wrap gap-1.5">
          {TIME_OPTIONS.map((opt) => (
            <button
              key={opt.label}
              type="button"
              onClick={() => setFilters({ ...filters, maxTime: opt.value })}
              className={`${chipBase} ${filters.maxTime === opt.value ? chipOn : chipOff}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">
          Min rating
        </div>
        <div className="flex flex-wrap gap-1.5">
          {RATING_OPTIONS.map((opt) => (
            <button
              key={opt.label}
              type="button"
              onClick={() => setFilters({ ...filters, minRating: opt.value })}
              className={`${chipBase} ${filters.minRating === opt.value ? chipOn : chipOff}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">
          Source
        </div>
        <div className="flex flex-wrap gap-1.5">
          {SOURCE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setFilters({ ...filters, source: opt.value })}
              className={`${chipBase} ${filters.source === opt.value ? chipOn : chipOff}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">
          Hidden recipes
        </div>
        <div className="flex flex-wrap gap-1.5">
          {HIDDEN_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setFilters({ ...filters, hidden: opt.value })}
              className={`${chipBase} ${filters.hidden === opt.value ? chipOn : chipOff}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {availableCategories.length > 0 && (
        <div>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">
            Categories
          </div>
          <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
            {availableCategories.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => toggleCategory(c)}
                className={`${chipBase} ${filters.categories.has(c) ? chipOn : chipOff}`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function RecipesPage() {
  const { recipes, isRecipeHidden } = useRecipes();
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [sort, setSort] = useState<SortKey>("default");
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const isKT = useKitchenTool();

  useEffect(() => {
    const p = loadPrefs();
    if (p) {
      setFilters({
        difficulties: new Set(p.difficulties ?? []),
        categories: new Set(p.categories ?? []),
        maxTime: p.maxTime ?? null,
        minRating: p.minRating ?? null,
        source: p.source ?? "all",
        hidden: p.hidden ?? "exclude",
      });
      if (p.sort) setSort(p.sort);
      if (typeof p.favoritesOnly === "boolean") setFavoritesOnly(p.favoritesOnly);
      if (p.view === "grid" || p.view === "list") setView(p.view);
    }
    setPrefsLoaded(true);
  }, []);

  useEffect(() => {
    if (!prefsLoaded) return;
    savePrefs({
      difficulties: Array.from(filters.difficulties),
      categories: Array.from(filters.categories),
      maxTime: filters.maxTime,
      minRating: filters.minRating,
      source: filters.source,
      hidden: filters.hidden,
      sort,
      favoritesOnly,
      view,
    });
  }, [filters, sort, favoritesOnly, view, prefsLoaded]);

  const availableCategories = useMemo(() => {
    const set = new Set<string>();
    for (const r of recipes) for (const c of r.categories) set.add(c);
    return Array.from(set).sort();
  }, [recipes]);

  const filtered = useMemo(
    () =>
      applySort(
        applyFilters(recipes, search, favoritesOnly, filters, user?.uid, isRecipeHidden),
        sort,
      ),
    [recipes, search, favoritesOnly, filters, sort, user?.uid, isRecipeHidden],
  );

  const filterCount = activeFilterCount(filters);

  if (isKT) {
    return (
      <KitchenToolRecipes
        recipes={filtered}
        totalCount={recipes.length}
        search={search}
        setSearch={setSearch}
        view={view}
        setView={setView}
        favoritesOnly={favoritesOnly}
        setFavoritesOnly={setFavoritesOnly}
        filters={filters}
        setFilters={setFilters}
        sort={sort}
        setSort={setSort}
        filterCount={filterCount}
        availableCategories={availableCategories}
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

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search recipes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 h-11 rounded-xl bg-card border-transparent card-elevated"
          />
        </div>
        <Popover>
          <PopoverTrigger
            render={
              <Button
                variant={filterCount > 0 ? "default" : "outline"}
                size="icon"
                className="h-11 w-11 rounded-xl shrink-0 relative"
                aria-label="Filters"
              />
            }
          >
            <SlidersHorizontal className="h-4 w-4" />
            {filterCount > 0 && (
              <span className="absolute -top-1 -right-1 h-4 min-w-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold flex items-center justify-center">
                {filterCount}
              </span>
            )}
          </PopoverTrigger>
          <PopoverContent align="end" className="w-auto">
            <FilterPanel
              filters={filters}
              setFilters={setFilters}
              availableCategories={availableCategories}
            />
          </PopoverContent>
        </Popover>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="outline"
                size="icon"
                className="h-11 w-11 rounded-xl shrink-0"
                aria-label="Sort"
              />
            }
          >
            <ArrowUpDown className="h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <div className="px-1.5 py-1 text-xs font-medium text-muted-foreground">Sort by</div>
            <div className="-mx-1 my-1 h-px bg-border" />
            <DropdownMenuRadioGroup value={sort} onValueChange={(v) => setSort(v as SortKey)}>
              {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
                <DropdownMenuRadioItem key={k} value={k}>
                  {SORT_LABEL[k]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          variant={favoritesOnly ? "default" : "outline"}
          size="icon"
          className="h-11 w-11 rounded-xl shrink-0"
          onClick={() => setFavoritesOnly((v) => !v)}
          aria-label="Show favorites only"
        >
          <Heart className={`h-4 w-4 ${favoritesOnly ? "fill-primary-foreground text-primary-foreground" : ""}`} />
        </Button>
      </div>

      {(filterCount > 0 || sort !== "default") && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>
            {filtered.length} of {recipes.length}
          </span>
          {sort !== "default" && (
            <Badge variant="secondary" className="rounded-md">
              Sort: {SORT_LABEL[sort]}
            </Badge>
          )}
          {filterCount > 0 && (
            <button
              onClick={() => setFilters(DEFAULT_FILTERS)}
              className="ml-auto inline-flex items-center gap-1 hover:text-foreground"
              type="button"
            >
              <X className="h-3 w-3" />
              Clear filters
            </button>
          )}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-muted mb-5">
            <ChefHat className="h-10 w-10 text-muted-foreground/40" />
          </div>
          <h2 className="text-xl font-semibold">
            {recipes.length === 0 ? "No recipes yet" : "No matches"}
          </h2>
          <p className="text-sm text-muted-foreground mt-1 mb-5">
            {recipes.length === 0
              ? "Add your first recipe to get started"
              : "Try adjusting your search or filters"}
          </p>
          {recipes.length === 0 ? (
            <Button size="lg" className="rounded-xl" render={<Link href="/recipes/new" />}>
              <Plus className="mr-2 h-4 w-4" />
              Add Recipe
            </Button>
          ) : (
            <Button
              variant="outline"
              className="rounded-xl"
              onClick={() => {
                setSearch("");
                setFavoritesOnly(false);
                setFilters(DEFAULT_FILTERS);
              }}
            >
              Clear all
            </Button>
          )}
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
                    <h3
                      title={recipe.title}
                      className="font-semibold text-xs leading-4 line-clamp-2 min-h-8 break-words"
                    >
                      {recipe.title}
                    </h3>
                    <div className="flex items-center gap-1 shrink-0">
                      {isRecipeHidden(recipe) && (
                        <EyeOff className="h-3 w-3 text-muted-foreground" aria-label="Hidden from recipe list" />
                      )}
                      {recipe.userId !== user?.uid && (
                        <Users className="h-3 w-3 text-muted-foreground" aria-label="Shared with you" />
                      )}
                      {recipe.isFavorite && (
                        <Heart className="h-3 w-3 fill-primary text-primary mt-px" />
                      )}
                    </div>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                    {(recipe.totalTime > 0 || recipe.averageDuration) && (
                      <span className="flex items-center gap-0.5">
                        <Clock className="h-3 w-3" />
                        {recipe.totalTime > 0
                          ? `${recipe.totalTime} min`
                          : `${recipe.averageDuration} min avg`}
                      </span>
                    )}
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
  totalCount,
  search,
  setSearch,
  view,
  setView,
  favoritesOnly,
  setFavoritesOnly,
  filters,
  setFilters,
  sort,
  setSort,
  filterCount,
  availableCategories,
  uid,
}: {
  recipes: Recipe[];
  totalCount: number;
  search: string;
  setSearch: (s: string) => void;
  view: "grid" | "list";
  setView: (v: "grid" | "list") => void;
  favoritesOnly: boolean;
  setFavoritesOnly: (v: (prev: boolean) => boolean) => void;
  filters: FilterState;
  setFilters: (f: FilterState) => void;
  sort: SortKey;
  setSort: (s: SortKey) => void;
  filterCount: number;
  availableCategories: string[];
  uid?: string;
}) {
  const { isRecipeHidden } = useRecipes();
  const filtersActive = filterCount > 0 || sort !== "default";
  return (
    <div className="mx-auto max-w-7xl p-4 md:p-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 border-b kt-hair pb-4">
        <div>
          <div className="kt-eyebrow">
            Library · {filtersActive ? `${recipes.length} of ${totalCount}` : `${totalCount}`} recipe
            {totalCount === 1 ? "" : "s"}
          </div>
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

      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[220px] max-w-xl">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search recipes…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-10 bg-card"
          />
        </div>
        <Popover>
          <PopoverTrigger
            render={
              <Button
                variant={filterCount > 0 ? "default" : "outline"}
                className="h-10 relative"
                aria-label="Filters"
              />
            }
          >
            <SlidersHorizontal className="h-3.5 w-3.5 mr-1.5" />
            Filter
            {filterCount > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 text-[10px] font-semibold bg-primary-foreground text-primary rounded">
                {filterCount}
              </span>
            )}
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto">
            <FilterPanel
              filters={filters}
              setFilters={setFilters}
              availableCategories={availableCategories}
              variant="kt"
            />
          </PopoverContent>
        </Popover>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="outline" className="h-10" aria-label="Sort" />
            }
          >
            <ArrowUpDown className="h-3.5 w-3.5 mr-1.5" />
            {SORT_LABEL[sort]}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <div className="px-1.5 py-1 text-xs font-medium text-muted-foreground">Sort by</div>
            <div className="-mx-1 my-1 h-px bg-border" />
            <DropdownMenuRadioGroup value={sort} onValueChange={(v) => setSort(v as SortKey)}>
              {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
                <DropdownMenuRadioItem key={k} value={k}>
                  {SORT_LABEL[k]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          variant={favoritesOnly ? "default" : "outline"}
          size="icon"
          className="h-10 w-10 shrink-0"
          onClick={() => setFavoritesOnly((v) => !v)}
          aria-label="Show favorites only"
        >
          <Heart className={`h-4 w-4 ${favoritesOnly ? "fill-primary-foreground text-primary-foreground" : ""}`} />
        </Button>
      </div>

      {recipes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center border kt-hair" style={{ borderRadius: "var(--radius)" }}>
          <ChefHat className="h-10 w-10 text-muted-foreground/50" />
          <h2 className="kt-serif text-2xl font-semibold mt-4">
            {totalCount === 0 ? "No recipes yet" : "No matches"}
          </h2>
          <p className="text-sm text-muted-foreground mt-1 mb-4">
            {totalCount === 0
              ? "Add your first recipe to get started."
              : "Try adjusting your search or filters."}
          </p>
          {totalCount === 0 ? (
            <Button render={<Link href="/recipes/new" />}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add recipe
            </Button>
          ) : (
            <Button
              variant="outline"
              onClick={() => {
                setSearch("");
                setFavoritesOnly(() => false);
                setFilters(DEFAULT_FILTERS);
                setSort("default");
              }}
            >
              Clear all
            </Button>
          )}
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
                    {isRecipeHidden(r) && (
                      <EyeOff className="h-3.5 w-3.5 text-muted-foreground" aria-label="Hidden from recipe list" />
                    )}
                    {r.userId !== uid && (
                      <Users className="h-3.5 w-3.5 text-muted-foreground" aria-label="Shared with you" />
                    )}
                    {r.isFavorite && (
                      <Heart className="h-3.5 w-3.5 fill-primary text-primary" />
                    )}
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-3 text-[11px] text-muted-foreground kt-mono">
                  {(r.totalTime > 0 || r.averageDuration) && (
                    <>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {r.totalTime > 0 ? `${r.totalTime}m` : `${r.averageDuration}m avg`}
                      </span>
                      <span className="opacity-60">·</span>
                    </>
                  )}
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
                {isRecipeHidden(r) && <EyeOff className="h-3 w-3 shrink-0 text-muted-foreground" aria-label="Hidden from recipe list" />}
                {r.userId !== uid && <Users className="h-3 w-3 shrink-0 text-muted-foreground" aria-label="Shared with you" />}
                <span className="kt-serif text-base font-medium truncate">{r.title}</span>
              </div>
              <div className="text-right kt-mono text-xs text-muted-foreground">
                {r.totalTime > 0 ? `${r.totalTime}m` : r.averageDuration ? `${r.averageDuration}m` : "—"}
              </div>
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
