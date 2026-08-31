"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { subscribeToRecipes } from "@/lib/firebase/firestore";
import { subscribeHiddenRecipeIds } from "@/lib/firebase/user-recipe-prefs";
import {
  subscribeToActiveInstance,
  subscribeToAdhocInstances,
  subscribeToTemplates,
  createAdhocInstance,
  updateInstanceDay,
  getWindowMondaysISO,
  getIndicesForDate,
} from "@/lib/firebase/meal-plans";
import { useAuth } from "@/lib/contexts/auth-context";
import { useHousehold } from "@/lib/contexts/household-context";
import type { Recipe } from "@/lib/types/recipe";
import type { PlanInstance, PlanDay, PlanTemplate } from "@/lib/types/meal-plan";

interface AppDataContextValue {
  recipes: Recipe[];
  recipesLoading: boolean;
  /** Recipe ids the signed-in user has hidden from their own library. */
  hiddenRecipeIds: Set<string>;
  /** True when a recipe should stay out of the library list for this user. */
  isRecipeHidden: (recipe: Recipe) => boolean;
  instance: PlanInstance | null;
  planLoading: boolean;
  todayIndices: { weekIndex: number; dayIndex: number } | null;
  adhocWeeks: (PlanInstance | null)[];
  adhocLoading: boolean;
  updateAdhocDay: (weekIndex: number, dayIndex: number, updatedDay: PlanDay) => Promise<void>;
  templates: PlanTemplate[];
  templatesLoading: boolean;
}

const AppDataContext = createContext<AppDataContextValue | null>(null);

export function AppDataProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { partnerUid } = useHousehold();

  // ── Recipes ──────────────────────────────────────────────────────────────
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [recipesLoading, setRecipesLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setRecipes([]);
      setRecipesLoading(false);
      return;
    }
    setRecipesLoading(true);
    const unsubscribe = subscribeToRecipes(user.uid, partnerUid, (data) => {
      setRecipes(data);
      setRecipesLoading(false);
    });
    return unsubscribe;
  }, [user, partnerUid]);

  // ── Personally hidden recipes ─────────────────────────────────────────────
  // A recipe is out of the library either because its creator hid it
  // (`hiddenFromList` on the recipe) or because this user hid it from their own
  // list. The second path is the only one available for a partner's recipe.
  const [hiddenRecipeIds, setHiddenRecipeIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user) {
      setHiddenRecipeIds(new Set());
      return;
    }
    return subscribeHiddenRecipeIds(user.uid, setHiddenRecipeIds);
  }, [user]);

  const isRecipeHidden = useCallback(
    (recipe: Recipe) => !!recipe.hiddenFromList || hiddenRecipeIds.has(recipe.id),
    [hiddenRecipeIds]
  );

  // ── Image preloading ──────────────────────────────────────────────────────
  const hasPreloaded = useRef(false);

  useEffect(() => {
    hasPreloaded.current = false;
  }, [user]);

  useEffect(() => {
    if (recipes.length === 0 || hasPreloaded.current) return;
    hasPreloaded.current = true;
    const urls = recipes
      .slice()
      .sort((a, b) => (b.isFavorite ? 1 : 0) - (a.isFavorite ? 1 : 0))
      .map((r) => r.photoURL)
      .filter(Boolean)
      .slice(0, 40) as string[];
    for (const url of urls) {
      const img = new Image();
      img.src = url;
    }
  }, [recipes]);

  // ── Active plan ───────────────────────────────────────────────────────────
  const [instance, setInstance] = useState<PlanInstance | null>(null);
  const [planLoading, setPlanLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setInstance(null);
      setPlanLoading(false);
      return;
    }
    setPlanLoading(true);
    const unsub = subscribeToActiveInstance(user.uid, (inst) => {
      setInstance(inst);
      setPlanLoading(false);
    });
    return unsub;
  }, [user]);

  const todayIndices = useMemo(() => {
    if (!instance) return null;
    return getIndicesForDate(instance, new Date());
  }, [instance]);

  // ── Adhoc weeks ───────────────────────────────────────────────────────────
  const [instanceMap, setInstanceMap] = useState<Map<string, PlanInstance>>(new Map());
  const [adhocLoading, setAdhocLoading] = useState(true);

  const windowMondaysISO = useMemo(() => getWindowMondaysISO(), []);

  useEffect(() => {
    if (!user) {
      setInstanceMap(new Map());
      setAdhocLoading(false);
      return;
    }
    setAdhocLoading(true);
    const unsub = subscribeToAdhocInstances(user.uid, (map) => {
      setInstanceMap(map);
      setAdhocLoading(false);
    });
    return unsub;
  }, [user]);

  const adhocWeeks: (PlanInstance | null)[] = useMemo(
    () => windowMondaysISO.map((monday) => instanceMap.get(monday) ?? null),
    [instanceMap, windowMondaysISO]
  );

  const updateAdhocDay = useCallback(
    async (weekIndex: number, dayIndex: number, updatedDay: PlanDay) => {
      if (!user) return;
      const mondayISO = windowMondaysISO[weekIndex];
      const existing = instanceMap.get(mondayISO);
      if (existing) {
        await updateInstanceDay(existing.id, 0, dayIndex, updatedDay);
      } else if (updatedDay.meals.length > 0) {
        const newInstance = await createAdhocInstance(user.uid, mondayISO);
        await updateInstanceDay(newInstance.id, 0, dayIndex, updatedDay);
      }
    },
    [user, instanceMap, windowMondaysISO]
  );

  // ── Plan templates ────────────────────────────────────────────────────────
  const [templates, setTemplates] = useState<PlanTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setTemplates([]);
      setTemplatesLoading(false);
      return;
    }
    setTemplatesLoading(true);
    const unsub = subscribeToTemplates(user.uid, (items) => {
      setTemplates(items);
      setTemplatesLoading(false);
    });
    return unsub;
  }, [user]);

  // ── Context value ─────────────────────────────────────────────────────────
  const value: AppDataContextValue = {
    recipes,
    recipesLoading,
    hiddenRecipeIds,
    isRecipeHidden,
    instance,
    planLoading,
    todayIndices,
    adhocWeeks,
    adhocLoading,
    updateAdhocDay,
    templates,
    templatesLoading,
  };

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData(): AppDataContextValue {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error("useAppData must be used within AppDataProvider");
  return ctx;
}
