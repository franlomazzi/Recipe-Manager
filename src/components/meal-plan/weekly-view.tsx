"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useRecipes } from "@/lib/hooks/use-recipes";
import {
  updateInstanceDay,
  getIndicesForDate,
} from "@/lib/firebase/meal-plans";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ChevronLeft,
  ChevronRight,
  Play,
  Plus,
  MoreVertical,
  LayoutTemplate,
  Square,
  Loader2,
  Minus,
  BookOpen,
  ArrowLeftRight,
  Trash2,
  Sparkles,
} from "lucide-react";
import { MealPickerDialog } from "./meal-picker-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  addDays,
  format,
  parseISO,
  isToday,
  startOfWeek,
  differenceInCalendarDays,
} from "date-fns";
import type { PlanInstance, PlanMeal, PlanDay } from "@/lib/types/meal-plan";
import { MEAL_CATEGORIES, DAYS_OF_WEEK } from "@/lib/types/meal-plan";
import { useMealPlanPrefs } from "@/lib/hooks/use-meal-plan-prefs";
import { macrosForServingAmount } from "@/lib/utils/plan-macros";
import { useMealCombo } from "@/lib/hooks/use-meal-combo";
import { useCookingSession } from "@/lib/contexts/cooking-session-context";
import { useAuth } from "@/lib/contexts/auth-context";
import { getCookLogs } from "@/lib/firebase/firestore";
import { fetchScaledInstructions } from "@/lib/cooking/fetch-scaled-instructions";

interface WeeklyViewProps {
  instance: PlanInstance;
  onShowTemplates: () => void;
  onEndPlan: () => void;
  endingPlan: boolean;
  /** Freestyle mode: replaces the default updateInstanceDay write for all day updates. */
  onUpdateDay?: (weekIndex: number, dayIndex: number, updatedDay: PlanDay) => Promise<void>;
}

const CATEGORY_EMOJI: Record<string, string> = {
  Breakfast: "🌅",
  Lunch: "☀️",
  Dinner: "🌙",
  Snacks: "🍿",
};

export function WeeklyView({
  instance,
  onShowTemplates,
  onEndPlan,
  endingPlan,
  onUpdateDay,
}: WeeklyViewProps) {
  const isAdhoc = instance.status === "adhoc";
  const router = useRouter();
  const { recipes } = useRecipes();
  const { user } = useAuth();
  const { addSession, setActiveSession, setScaledInstructions } =
    useCookingSession();

  const planStart = parseISO(instance.startDate);
  const planEnd = addDays(planStart, instance.snapshot.length * 7 - 1);
  const firstMonday = startOfWeek(planStart, { weekStartsOn: 1 });
  const lastMonday = startOfWeek(planEnd, { weekStartsOn: 1 });
  const totalWeeks = differenceInCalendarDays(lastMonday, firstMonday) / 7 + 1;

  const [weekOffset, setWeekOffset] = useState(() => {
    const todayMonday = startOfWeek(new Date(), { weekStartsOn: 1 });
    const offset = differenceInCalendarDays(todayMonday, firstMonday) / 7;
    return Math.max(0, Math.min(totalWeeks - 1, offset));
  });

  // Mobile: selected day index (column within the Mon-Sun row)
  const [selectedDay, setSelectedDay] = useState(() => {
    for (let i = 0; i < 7; i++) {
      if (isToday(addDays(firstMonday, weekOffset * 7 + i))) return i;
    }
    for (let i = 0; i < 7; i++) {
      if (getIndicesForDate(instance, addDays(firstMonday, weekOffset * 7 + i))) {
        return i;
      }
    }
    return 0;
  });

  // Meal picker state — colIdx is the 0..6 column in the displayed Mon-Sun week.
  // In multi-recipe mode, `mode` and `mealIndex` target a specific component:
  //   mode "add"     → append a new component to the category
  //   mode "replace" → swap the component at `mealIndex` (or the whole category
  //                    slot in single-recipe mode when mealIndex is undefined)
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<{
    colIdx: number;
    category: string;
    mode: "replace" | "add";
    mealIndex?: number;
  } | null>(null);

  // Meal action sheet state — `mealIndex` targets a specific component in
  // multi-recipe mode; undefined means "the single meal in this category".
  const [actionOpen, setActionOpen] = useState(false);
  const [actionTarget, setActionTarget] = useState<{
    colIdx: number;
    category: string;
    mealIndex?: number;
  } | null>(null);

  // Expand sheet — opened from a unified multi-recipe card to reveal its
  // individual components for cooking / editing.
  const [expandOpen, setExpandOpen] = useState(false);
  const [expandTarget, setExpandTarget] = useState<{
    colIdx: number;
    category: string;
  } | null>(null);

  // "Cook all" — confirm servings for every recipe in a multi-recipe meal,
  // then start them together as parallel tabs in one cooking session.
  const [cookAllOpen, setCookAllOpen] = useState(false);
  // Servings keyed by mealId (duplicate recipes collapse to one cooking tab).
  const [cookAllServings, setCookAllServings] = useState<Record<string, number>>(
    {}
  );
  const [startingCookAll, setStartingCookAll] = useState(false);

  // Preload all meal photos across the entire plan so navigating between weeks
  // and returning to this page uses the browser cache instead of re-fetching.
  useEffect(() => {
    const urls = new Set<string>();
    for (const week of instance.snapshot) {
      for (const day of week.days) {
        for (const meal of day.meals) {
          if (meal.mealPhoto) urls.add(meal.mealPhoto);
        }
      }
    }
    for (const url of urls) {
      const img = new window.Image();
      img.src = url;
    }
  }, [instance]);

  const weekDates = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) =>
        addDays(firstMonday, weekOffset * 7 + i)
      ),
    [firstMonday, weekOffset]
  );

  function indicesForColumn(colIdx: number) {
    return getIndicesForDate(instance, weekDates[colIdx]);
  }

  const cookableIds = useMemo(
    () => new Set(recipes.filter((r) => r.steps.length > 0).map((r) => r.id)),
    [recipes]
  );

  const { forceShow, multiRecipePerMeal } = useMealPlanPrefs();

  const currentWeekCategories = useMemo(() => {
    const s = new Set<string>();
    for (const date of weekDates) {
      const indices = getIndicesForDate(instance, date);
      if (!indices) continue;
      const day = instance.snapshot[indices.weekIndex]?.days[indices.dayIndex];
      if (day) for (const m of day.meals) s.add(m.category);
    }
    return s;
  }, [instance, weekDates]);

  const visibleCategories = useMemo(() => {
    const filtered = MEAL_CATEGORIES.filter(
      (c) => currentWeekCategories.has(c) || forceShow.has(c)
    );
    return filtered.length === 0 ? MEAL_CATEGORIES : filtered;
  }, [currentWeekCategories, forceShow]);

  const recipeServings = useMemo(
    () => new Map(recipes.map((r) => [r.id, r.servings])),
    [recipes]
  );

  const recipesById = useMemo(
    () => new Map(recipes.map((r) => [r.id, r])),
    [recipes]
  );

  // Servings dialog state
  const [cookTarget, setCookTarget] = useState<{ mealId: string; defaultServings: number } | null>(null);
  const [cookServings, setCookServings] = useState(1);

  function getMeal(colIdx: number, category: string): PlanMeal | undefined {
    const indices = indicesForColumn(colIdx);
    if (!indices) return undefined;
    return instance.snapshot[indices.weekIndex]?.days[indices.dayIndex]?.meals.find(
      (m) => m.category === category
    );
  }

  // ── Day / component helpers (used in multi-recipe mode) ──

  function getDay(
    colIdx: number
  ): { weekIndex: number; dayIndex: number; day: PlanDay } | null {
    const indices = indicesForColumn(colIdx);
    if (!indices) return null;
    const day = instance.snapshot[indices.weekIndex]?.days[indices.dayIndex];
    if (!day) return null;
    return { ...indices, day };
  }

  /** Components in a category, each paired with its absolute index in day.meals. */
  function getCategoryMeals(
    colIdx: number,
    category: string
  ): { meal: PlanMeal; index: number }[] {
    const ctx = getDay(colIdx);
    if (!ctx) return [];
    return ctx.day.meals
      .map((meal, index) => ({ meal, index }))
      .filter((x) => x.meal.category === category);
  }

  async function commitDayMeals(colIdx: number, meals: PlanMeal[]) {
    const ctx = getDay(colIdx);
    if (!ctx) return;
    const updatedDay: PlanDay = { meals };
    if (onUpdateDay) {
      await onUpdateDay(ctx.weekIndex, ctx.dayIndex, updatedDay);
    } else {
      await updateInstanceDay(instance.id, ctx.weekIndex, ctx.dayIndex, updatedDay);
    }
  }

  function openPicker(
    colIdx: number,
    category: string,
    opts?: { mode?: "replace" | "add"; mealIndex?: number }
  ) {
    if (!indicesForColumn(colIdx)) return;
    setPickerTarget({
      colIdx,
      category,
      mode: opts?.mode ?? "replace",
      mealIndex: opts?.mealIndex,
    });
    setPickerOpen(true);
  }

  function openAction(colIdx: number, category: string, mealIndex?: number) {
    if (!indicesForColumn(colIdx)) return;
    setActionTarget({ colIdx, category, mealIndex });
    setActionOpen(true);
  }

  function openExpand(colIdx: number, category: string) {
    if (!indicesForColumn(colIdx)) return;
    setExpandTarget({ colIdx, category });
    setExpandOpen(true);
  }

  // Remove a component straight from the expand sheet; close it when the meal
  // becomes empty so we don't leave a blank dialog open.
  async function removeFromExpand(index: number) {
    if (!expandTarget) return;
    const remaining = getCategoryMeals(
      expandTarget.colIdx,
      expandTarget.category
    ).length;
    await removeMealAt(expandTarget.colIdx, index);
    if (remaining <= 1) setExpandOpen(false);
  }

  async function handleMealSelect(meal: PlanMeal) {
    if (!pickerTarget) return;
    const { colIdx, category, mode, mealIndex } = pickerTarget;
    const ctx = getDay(colIdx);
    if (!ctx) return;

    // The picker already attached the chosen `servingAmount` and scaled macros.
    // Single-recipe mode: keep the one-meal-per-category swap behaviour.
    if (!multiRecipePerMeal) {
      await commitDayMeals(colIdx, [
        ...ctx.day.meals.filter((m) => m.category !== category),
        meal,
      ]);
      return;
    }

    // Multi-recipe mode: append, or replace the targeted component.
    if (mode === "add" || mealIndex == null) {
      await commitDayMeals(colIdx, [...ctx.day.meals, meal]);
    } else {
      await commitDayMeals(
        colIdx,
        ctx.day.meals.map((m, i) => (i === mealIndex ? meal : m))
      );
    }
  }

  async function removeMeal(colIdx: number, category: string) {
    const ctx = getDay(colIdx);
    if (!ctx) return;
    await commitDayMeals(
      colIdx,
      ctx.day.meals.filter((m) => m.category !== category)
    );
  }

  async function removeMealAt(colIdx: number, mealIndex: number) {
    const ctx = getDay(colIdx);
    if (!ctx) return;
    await commitDayMeals(
      colIdx,
      ctx.day.meals.filter((_, i) => i !== mealIndex)
    );
  }

  async function setServingsAt(
    colIdx: number,
    mealIndex: number,
    servingAmount: number
  ) {
    const ctx = getDay(colIdx);
    if (!ctx) return;
    await commitDayMeals(
      colIdx,
      ctx.day.meals.map((m, i) => {
        if (i !== mealIndex) return m;
        // Keep stored macros consistent with the chosen serving amount so the
        // food tracking app reads correct values for this meal.
        const recipe = recipesById.get(m.mealId);
        return {
          ...m,
          servingAmount,
          ...(recipe
            ? { macros: macrosForServingAmount(recipe, servingAmount) }
            : {}),
        };
      })
    );
  }

  function launchCook(mealId: string, servingsOverride?: number) {
    const defaultServings = recipeServings.get(mealId) ?? 1;
    setCookServings(servingsOverride ?? defaultServings);
    setCookTarget({ mealId, defaultServings });
  }

  // Open the "cook all" confirm dialog seeded with each cookable recipe's
  // planned serving amount (duplicate recipes collapse to one entry).
  function openCookAll(colIdx: number, category: string) {
    const servings: Record<string, number> = {};
    for (const { meal } of getCategoryMeals(colIdx, category)) {
      if (!cookableIds.has(meal.mealId)) continue;
      if (servings[meal.mealId] == null) {
        servings[meal.mealId] =
          meal.servingAmount ?? recipesById.get(meal.mealId)?.servings ?? 1;
      }
    }
    setCookAllServings(servings);
    setCookAllOpen(true);
  }

  // Start every recipe in the meal as parallel tabs in one cooking session.
  async function handleStartCookAll() {
    const entries = Object.entries(cookAllServings);
    if (entries.length === 0) return;
    setStartingCookAll(true);
    try {
      await Promise.all(
        entries.map(async ([mealId, servings]) => {
          const recipe = recipesById.get(mealId);
          if (!recipe) return;
          const multiplier = servings / (recipe.servings || 1);
          const cookLogs = await getCookLogs(recipe.id).catch(() => []);
          addSession(recipe, cookLogs, multiplier);
          if (multiplier !== 1 && recipe.steps.length > 0) {
            fetchScaledInstructions(
              recipe.steps,
              multiplier,
              user,
              recipe.id,
              setScaledInstructions
            );
          }
        })
      );
      setActiveSession(entries[0][0]);
      router.push("/cook");
    } finally {
      setStartingCookAll(false);
      setCookAllOpen(false);
      setExpandOpen(false);
    }
  }

  /** Resolve the meal a sheet/picker targets — by index (multi) or category. */
  function getActionMeal(): PlanMeal | undefined {
    if (!actionTarget) return undefined;
    if (actionTarget.mealIndex != null) {
      return getDay(actionTarget.colIdx)?.day.meals[actionTarget.mealIndex];
    }
    return getMeal(actionTarget.colIdx, actionTarget.category);
  }

  /** Absolute index in day.meals of the action target (single or multi). */
  function getActionMealIndex(): number | null {
    if (!actionTarget) return null;
    if (actionTarget.mealIndex != null) return actionTarget.mealIndex;
    const ctx = getDay(actionTarget.colIdx);
    if (!ctx) return null;
    const idx = ctx.day.meals.findIndex(
      (m) => m.category === actionTarget.category
    );
    return idx >= 0 ? idx : null;
  }

  const currentMealId =
    pickerTarget && pickerTarget.mode !== "add"
      ? pickerTarget.mealIndex != null
        ? getDay(pickerTarget.colIdx)?.day.meals[pickerTarget.mealIndex]?.mealId
        : getMeal(pickerTarget.colIdx, pickerTarget.category)?.mealId
      : undefined;

  return (
    <>
      <div className="flex flex-col flex-1 min-h-0">
        {/* ─── Compact control bar ─── */}
        <div className="flex items-center gap-2 mb-2 shrink-0">
          <div className="min-w-0 flex-1">
            <h2 className="text-sm md:text-base font-semibold truncate">
              {isAdhoc ? "Freestyle" : instance.templateName}
            </h2>
          </div>

          {/* Week nav */}
          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={weekOffset === 0}
              onClick={() => {
                setWeekOffset((i) => i - 1);
                setSelectedDay(0);
              }}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <span className="text-xs font-medium min-w-[56px] text-center text-muted-foreground">
              {weekOffset + 1}/{totalWeeks}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={weekOffset >= totalWeeks - 1}
              onClick={() => {
                setWeekOffset((i) => i + 1);
                setSelectedDay(0);
              }}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="ghost" size="icon" className="h-7 w-7" />
              }
            >
              <MoreVertical className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onShowTemplates}>
                <LayoutTemplate className="mr-2 h-4 w-4" />
                Templates
              </DropdownMenuItem>
              {!isAdhoc && (
                <DropdownMenuItem
                  onClick={onEndPlan}
                  disabled={endingPlan}
                  className="text-destructive focus:text-destructive"
                >
                  {endingPlan ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Square className="mr-2 h-4 w-4" />
                  )}
                  End Plan
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* ─── MOBILE: Day selector + meal cards ─── */}
        <div className="md:hidden flex flex-col flex-1 min-h-0 space-y-2">
          {/* Day pills */}
          <div className="flex gap-1.5 overflow-x-auto pb-1 shrink-0">
            {DAYS_OF_WEEK.map((_, idx) => {
              const date = weekDates[idx];
              const today = isToday(date);
              const indices = indicesForColumn(idx);
              const inRange = indices !== null;
              const hasMeals =
                inRange &&
                (instance.snapshot[indices!.weekIndex]?.days[indices!.dayIndex]
                  ?.meals.length ?? 0) > 0;
              return (
                <button
                  key={idx}
                  type="button"
                  disabled={!inRange}
                  className={`flex flex-col items-center rounded-xl px-3 py-2 transition-colors shrink-0 min-w-[50px] ${
                    !inRange
                      ? "bg-muted/30 text-muted-foreground/50 cursor-not-allowed"
                      : selectedDay === idx
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : today
                          ? "bg-primary/10 text-primary"
                          : "bg-muted/50 text-foreground"
                  }`}
                  onClick={() => inRange && setSelectedDay(idx)}
                >
                  <span className="text-[11px] font-medium">
                    {format(date, "EEE")}
                  </span>
                  <span
                    className={`text-lg font-bold leading-tight ${
                      !inRange
                        ? ""
                        : selectedDay === idx
                          ? "text-primary-foreground"
                          : today
                            ? "text-primary"
                            : ""
                    }`}
                  >
                    {format(date, "d")}
                  </span>
                  {hasMeals && selectedDay !== idx && (
                    <div className="h-1.5 w-1.5 rounded-full bg-primary mt-0.5" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Meal cards */}
          <div className="flex-1 overflow-y-auto space-y-2">
            {indicesForColumn(selectedDay) === null ? (
              <div className="rounded-xl border border-dashed border-border/50 bg-muted/20 p-6 text-center text-sm text-muted-foreground">
                This day is outside the plan range.
              </div>
            ) : (
              visibleCategories.map((category) => {
                if (multiRecipePerMeal) {
                  const components = getCategoryMeals(selectedDay, category);
                  if (components.length >= 2) {
                    return (
                      <MobileUnifiedMealCard
                        key={category}
                        category={category}
                        components={components}
                        onOpen={() => openExpand(selectedDay, category)}
                      />
                    );
                  }
                  // 0 or 1 recipe → full card; tapping the recipe opens the
                  // expand sheet where another can be added.
                  const only = components[0];
                  return (
                    <MobileMealCard
                      key={category}
                      category={category}
                      meal={only?.meal}
                      cookable={only ? cookableIds.has(only.meal.mealId) : false}
                      onTap={() =>
                        openPicker(selectedDay, category, { mode: "add" })
                      }
                      onMealTap={() => openExpand(selectedDay, category)}
                      onCook={() =>
                        only && launchCook(only.meal.mealId, only.meal.servingAmount)
                      }
                    />
                  );
                }
                const meal = getMeal(selectedDay, category);
                const cookable = meal ? cookableIds.has(meal.mealId) : false;
                return (
                  <MobileMealCard
                    key={category}
                    category={category}
                    meal={meal}
                    cookable={cookable}
                    onTap={() => openPicker(selectedDay, category)}
                    onMealTap={() => openAction(selectedDay, category)}
                    onCook={() => meal && launchCook(meal.mealId)}
                  />
                );
              })
            )}
          </div>
        </div>

        {/* ─── TABLET / DESKTOP: Row-per-category grid ─── */}
        <div className="hidden md:flex md:flex-col flex-1 min-h-0 gap-1 lg:gap-1.5">
          {/* Day header row */}
          <div className="grid gap-1 lg:gap-1.5 shrink-0" style={{ gridTemplateColumns: "56px repeat(7, 1fr)" }}>
            <div />
            {DAYS_OF_WEEK.map((_, idx) => {
              const date = weekDates[idx];
              const today = isToday(date);
              const inRange = indicesForColumn(idx) !== null;
              return (
                <div
                  key={idx}
                  className={`text-center py-1 rounded-lg ${
                    !inRange
                      ? "bg-muted/30 text-muted-foreground/50"
                      : today
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted/60"
                  }`}
                >
                  <span
                    className={`text-[11px] font-medium ${
                      !inRange
                        ? ""
                        : today
                          ? "text-primary-foreground/80"
                          : "text-muted-foreground"
                    }`}
                  >
                    {format(date, "EEE")}
                  </span>{" "}
                  <span className="text-sm font-bold">{format(date, "d")}</span>
                </div>
              );
            })}
          </div>

          {/* One row per meal category */}
          {visibleCategories.map((category) => (
            <div
              key={category}
              className="grid flex-1 min-h-0 gap-1 lg:gap-1.5 md:max-h-[280px] lg:max-h-[220px] 2xl:max-h-[160px]"
              style={{ gridTemplateColumns: "56px repeat(7, 1fr)" }}
            >
              {/* Row label */}
              <div className="flex flex-col items-center justify-center gap-1 border-r-4 border-border pr-1">
                <span className="text-lg">{CATEGORY_EMOJI[category]}</span>
                <span className="text-[11px] lg:text-xs font-bold text-muted-foreground text-center leading-none">
                  {category}
                </span>
              </div>

              {/* 7 day cells */}
              {DAYS_OF_WEEK.map((_, dayIdx) => {
                const inRange = indicesForColumn(dayIdx) !== null;
                if (multiRecipePerMeal) {
                  const components = getCategoryMeals(dayIdx, category);
                  // ≥2 components → one unified AI plate; tap to expand.
                  if (inRange && components.length >= 2) {
                    return (
                      <UnifiedGridCell
                        key={dayIdx}
                        components={components}
                        category={category}
                        onOpen={() => openExpand(dayIdx, category)}
                      />
                    );
                  }
                  // 0 or 1 recipe → use the full cell. Tapping the single recipe
                  // opens the expand sheet, where another can be added.
                  const only = components[0];
                  return (
                    <GridCell
                      key={dayIdx}
                      meal={only?.meal}
                      cookable={only ? cookableIds.has(only.meal.mealId) : false}
                      inRange={inRange}
                      onTap={() => openPicker(dayIdx, category, { mode: "add" })}
                      onMealTap={() => openExpand(dayIdx, category)}
                      onCook={() =>
                        only && launchCook(only.meal.mealId, only.meal.servingAmount)
                      }
                    />
                  );
                }
                const meal = getMeal(dayIdx, category);
                const cookable = meal ? cookableIds.has(meal.mealId) : false;
                return (
                  <GridCell
                    key={dayIdx}
                    meal={meal}
                    cookable={cookable}
                    inRange={inRange}
                    onTap={() => openPicker(dayIdx, category)}
                    onMealTap={() => openAction(dayIdx, category)}
                    onCook={() => meal && launchCook(meal.mealId)}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Meal action sheet */}
      <Dialog open={actionOpen} onOpenChange={setActionOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader className="min-w-0">
            <DialogTitle className="line-clamp-2 pr-8 leading-snug">
              {getActionMeal()?.mealName ?? "Meal options"}
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2 pt-1">
            {(() => {
              const meal = getActionMeal();
              return meal ? (
                <Button
                  className="w-full justify-start gap-3 h-12"
                  onClick={() => {
                    setActionOpen(false);
                    launchCook(meal.mealId, meal.servingAmount);
                  }}
                >
                  <Play className="h-5 w-5" />
                  Start cooking
                </Button>
              ) : null;
            })()}

            {/* Servings stepper — adjust how much of this meal to plate up
                (scales ingredients & shopping). Available in both modes. */}
            {(() => {
              const meal = getActionMeal();
              const mealIndex = getActionMealIndex();
              if (!meal || mealIndex == null || !actionTarget) return null;
              const recipeDefault =
                recipesById.get(meal.mealId)?.servings ?? 1;
              const servings = meal.servingAmount ?? recipeDefault;
              const colIdx = actionTarget.colIdx;
              return (
                <div className="flex items-center justify-between rounded-lg border border-border px-3 h-12">
                  <span className="text-sm font-medium">Servings</span>
                  <div className="flex items-center gap-3">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 rounded-lg"
                      disabled={servings <= 0.5}
                      onClick={() =>
                        setServingsAt(
                          colIdx,
                          mealIndex,
                          Math.max(0.5, servings - 0.5)
                        )
                      }
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </Button>
                    <span className="min-w-[28px] text-center text-sm font-semibold tabular-nums">
                      {servings}
                    </span>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 rounded-lg"
                      onClick={() => setServingsAt(colIdx, mealIndex, servings + 0.5)}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })()}

            <Button
              variant="outline"
              className="w-full justify-start gap-3 h-12"
              onClick={() => {
                const meal = getActionMeal();
                setActionOpen(false);
                if (meal) router.push(`/recipes/${meal.mealId}`);
              }}
            >
              <BookOpen className="h-5 w-5" />
              Go to recipe
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start gap-3 h-12"
              onClick={() => {
                const target = actionTarget;
                setActionOpen(false);
                if (target)
                  openPicker(target.colIdx, target.category, {
                    mode: "replace",
                    mealIndex: target.mealIndex,
                  });
              }}
            >
              <ArrowLeftRight className="h-5 w-5" />
              Swap for another meal
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start gap-3 h-12 text-destructive hover:text-destructive border-destructive/30 hover:bg-destructive/5"
              onClick={() => {
                const target = actionTarget;
                setActionOpen(false);
                if (!target) return;
                if (target.mealIndex != null) {
                  removeMealAt(target.colIdx, target.mealIndex);
                } else {
                  removeMeal(target.colIdx, target.category);
                }
              }}
            >
              <Trash2 className="h-5 w-5" />
              Remove from plan
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Expand sheet — components of a unified multi-recipe meal */}
      <Dialog open={expandOpen} onOpenChange={setExpandOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader className="min-w-0">
            <DialogTitle className="line-clamp-2 pr-8 leading-snug">
              {expandTarget?.category ?? "Meal"}
            </DialogTitle>
          </DialogHeader>
          {expandTarget &&
            (() => {
              const components = getCategoryMeals(
                expandTarget.colIdx,
                expandTarget.category
              );
              return (
                <div className="flex flex-col gap-2 pt-1 min-w-0">
                  {components.length >= 2 && (
                    <ComboExpandHeader
                      category={expandTarget.category}
                      components={components}
                    />
                  )}
                  {components.length >= 2 &&
                    components.some((c) => cookableIds.has(c.meal.mealId)) && (
                      <Button
                        className="w-full justify-center gap-2 h-11"
                        onClick={() => {
                          const t = expandTarget;
                          setExpandOpen(false);
                          openCookAll(t.colIdx, t.category);
                        }}
                      >
                        <Play className="h-4 w-4" />
                        Start cooking all
                      </Button>
                    )}
                  {components.map(({ meal, index }) => {
                    const cookable = cookableIds.has(meal.mealId);
                    return (
                      <div
                        key={index}
                        className="flex items-center gap-3 rounded-lg border border-border bg-card p-2 cursor-pointer hover:border-primary/40 transition-colors"
                        onClick={() => {
                          const t = expandTarget;
                          setExpandOpen(false);
                          openAction(t.colIdx, t.category, index);
                        }}
                      >
                        {meal.mealPhoto ? (
                          <img
                            src={meal.mealPhoto}
                            alt=""
                            className="h-12 w-12 rounded-lg object-cover shrink-0"
                          />
                        ) : (
                          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-to-br from-muted/60 to-muted shrink-0 p-1">
                            <p className="text-[8px] font-semibold text-foreground/50 text-center line-clamp-3 leading-snug">
                              {meal.mealName}
                            </p>
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold truncate">
                            {meal.mealName}
                          </p>
                          {meal.servingAmount != null && (
                            <p className="text-xs text-muted-foreground">
                              {meal.servingAmount}{" "}
                              {meal.servingAmount === 1 ? "serving" : "servings"}
                            </p>
                          )}
                        </div>
                        {cookable && (
                          <Button
                            size="icon"
                            className="h-9 w-9 rounded-full shrink-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              launchCook(meal.mealId, meal.servingAmount);
                            }}
                          >
                            <Play className="h-4 w-4 ml-0.5" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 rounded-full shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                          aria-label="Remove from meal"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeFromExpand(index);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    );
                  })}
                  <Button
                    variant="outline"
                    className="w-full justify-center gap-2 h-11"
                    onClick={() => {
                      const t = expandTarget;
                      setExpandOpen(false);
                      openPicker(t.colIdx, t.category, { mode: "add" });
                    }}
                  >
                    <Plus className="h-4 w-4" />
                    Add component
                  </Button>
                </div>
              );
            })()}
        </DialogContent>
      </Dialog>

      {/* Cook all — confirm each recipe's servings, then start them together */}
      <Dialog
        open={cookAllOpen}
        onOpenChange={(o) => {
          if (!startingCookAll) setCookAllOpen(o);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader className="min-w-0">
            <DialogTitle>Confirm servings</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            All recipes start together as tabs in one cooking session.
          </p>
          <div className="flex flex-col gap-2 pt-1 max-h-[50vh] overflow-y-auto">
            {Object.entries(cookAllServings).map(([mealId, servings]) => {
              const recipe = recipesById.get(mealId);
              return (
                <div
                  key={mealId}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"
                >
                  <span className="text-sm font-medium line-clamp-2 flex-1 min-w-0">
                    {recipe?.title ?? "Recipe"}
                  </span>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 rounded-lg"
                      disabled={servings <= 0.5}
                      onClick={() =>
                        setCookAllServings((m) => ({
                          ...m,
                          [mealId]: Math.max(0.5, (m[mealId] ?? 1) - 0.5),
                        }))
                      }
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </Button>
                    <span className="min-w-[24px] text-center text-sm font-semibold tabular-nums">
                      {servings}
                    </span>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 rounded-lg"
                      onClick={() =>
                        setCookAllServings((m) => ({
                          ...m,
                          [mealId]: (m[mealId] ?? 1) + 0.5,
                        }))
                      }
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
            {Object.keys(cookAllServings).length === 0 && (
              <p className="py-4 text-center text-sm text-muted-foreground">
                None of these recipes have cooking steps yet.
              </p>
            )}
          </div>
          <div className="flex gap-2 pt-1">
            <Button
              variant="outline"
              className="flex-1"
              disabled={startingCookAll}
              onClick={() => setCookAllOpen(false)}
            >
              Cancel
            </Button>
            <Button
              className="flex-1"
              disabled={
                startingCookAll || Object.keys(cookAllServings).length === 0
              }
              onClick={handleStartCookAll}
            >
              {startingCookAll ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Play className="mr-2 h-4 w-4" />
              )}
              Start cooking
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <MealPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        category={pickerTarget?.category ?? ""}
        recipes={recipes}
        onSelect={handleMealSelect}
        mode={pickerTarget?.mode ?? "replace"}
        askServings
        onRemove={
          // Only the single-recipe slot offers an inline remove; multi-recipe
          // components are removed from the action sheet instead.
          !multiRecipePerMeal && pickerTarget
            ? () => {
                removeMeal(pickerTarget.colIdx, pickerTarget.category);
                setPickerOpen(false);
              }
            : undefined
        }
        currentMealId={currentMealId}
      />

      {/* Servings picker dialog */}
      {cookTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl border-transparent bg-card shadow-2xl">
            <div className="px-6 pt-6 pb-2">
              <h3 className="text-lg font-semibold">How many servings?</h3>
              <p className="text-sm text-muted-foreground mt-0.5">
                Quantities will be scaled to your chosen amount.
              </p>
            </div>
            <div className="px-6 py-4 flex items-center justify-center gap-4">
              <Button
                variant="outline"
                size="icon"
                className="h-10 w-10 rounded-xl"
                onClick={() => setCookServings((s) => Math.max(0.5, s - 0.5))}
                disabled={cookServings <= 0.5}
              >
                <Minus className="h-4 w-4" />
              </Button>
              <div className="text-center min-w-[100px]">
                <span className="text-3xl font-bold">{cookServings}</span>
                <p className="text-sm text-muted-foreground">
                  servings
                  {cookServings === cookTarget.defaultServings && (
                    <span className="ml-1 text-primary font-medium">(default)</span>
                  )}
                </p>
              </div>
              <Button
                variant="outline"
                size="icon"
                className="h-10 w-10 rounded-xl"
                onClick={() => setCookServings((s) => s + 0.5)}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex gap-2 px-6 pb-6 pt-2">
              <Button
                variant="outline"
                className="flex-1 rounded-xl"
                onClick={() => setCookTarget(null)}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 rounded-xl"
                onClick={() => {
                  const { mealId } = cookTarget;
                  setCookTarget(null);
                  router.push(`/recipes/${mealId}/cook?servings=${cookServings}`);
                }}
              >
                <Play className="mr-2 h-4 w-4" />
                Start cooking
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Desktop/tablet: photo-background cell ───

function GridCell({
  meal,
  cookable,
  inRange,
  onTap,
  onMealTap,
  onCook,
}: {
  meal: PlanMeal | undefined;
  cookable: boolean;
  inRange: boolean;
  onTap: () => void;
  onMealTap: () => void;
  onCook: () => void;
}) {
  if (!inRange) {
    return (
      <div
        className="flex-1 rounded-lg bg-muted/20 border border-dashed border-border/30 min-h-0"
        aria-hidden
      />
    );
  }

  if (!meal) {
    return (
      <button
        type="button"
        className="flex-1 flex items-center justify-center rounded-lg border-2 border-dashed border-border/40 transition-colors hover:border-primary/40 hover:bg-muted/30 min-h-0"
        onClick={onTap}
      >
        <Plus className="h-4 w-4 text-muted-foreground/30" />
      </button>
    );
  }

  return (
    <div
      className="group flex-1 flex flex-col 2xl:flex-row rounded-lg overflow-hidden cursor-pointer min-h-0 border border-border/40 bg-card hover:border-primary/40 hover:shadow-sm transition-all"
      onClick={onMealTap}
    >
      {/* Photo — 65% height in column mode, fixed width in row mode */}
      <div className="relative shrink-0 h-[65%] 2xl:h-full 2xl:w-[120px] overflow-hidden">
        {meal.mealPhoto ? (
          <img
            src={meal.mealPhoto}
            alt={meal.mealName}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-muted/60 to-muted p-2">
            <p className="text-center text-[9px] lg:text-[11px] font-semibold text-foreground/60 line-clamp-3 leading-snug">
              {meal.mealName}
            </p>
          </div>
        )}
      </div>

      {/* Name + play */}
      <div className="flex items-center gap-1 flex-1 px-1.5 min-h-0 2xl:flex-col 2xl:items-start 2xl:justify-center 2xl:gap-1.5 2xl:px-2 2xl:py-1.5">
        <p
          className="flex-1 2xl:flex-none text-[10px] lg:text-xs font-semibold leading-tight line-clamp-2 text-foreground min-w-0 2xl:w-full"
          title={meal.mealName}
        >
          {meal.mealName}
        </p>
        {cookable && (
          <button
            type="button"
            className="shrink-0 flex h-6 w-6 lg:h-7 lg:w-7 items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90 hover:scale-105 transition-all shadow-sm"
            onClick={(e) => { e.stopPropagation(); onCook(); }}
            title="Start cooking"
          >
            <Play className="h-3 w-3 lg:h-3.5 lg:w-3.5 ml-px" />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Mobile meal card ───

function MobileMealCard({
  category,
  meal,
  cookable,
  onTap,
  onMealTap,
  onCook,
}: {
  category: string;
  meal: PlanMeal | undefined;
  cookable: boolean;
  onTap: () => void;
  onMealTap: () => void;
  onCook: () => void;
}) {
  const emoji = CATEGORY_EMOJI[category] ?? "";

  if (!meal) {
    return (
      <button
        type="button"
        className="flex w-full items-center gap-3 rounded-xl border-2 border-dashed border-border/50 p-3 text-left transition-colors hover:border-primary/40 hover:bg-muted/30"
        onClick={onTap}
      >
        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-muted shrink-0">
          <Plus className="h-5 w-5 text-muted-foreground/50" />
        </div>
        <div>
          <p className="text-xs font-medium text-muted-foreground">
            {emoji} {category}
          </p>
          <p className="text-sm text-muted-foreground/60">Add a meal</p>
        </div>
      </button>
    );
  }

  return (
    <div
      className="flex items-center gap-3 rounded-xl border border-border bg-card p-2.5 shadow-sm cursor-pointer hover:border-primary/40 transition-colors"
      onClick={onMealTap}
    >
      {/* Photo */}
      {meal.mealPhoto ? (
        <img
          src={meal.mealPhoto}
          alt=""
          className="h-14 w-14 rounded-lg object-cover shrink-0"
        />
      ) : (
        <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-gradient-to-br from-muted/60 to-muted shrink-0 p-1.5">
          <p className="text-[9px] font-semibold text-foreground/50 text-center line-clamp-3 leading-snug">
            {meal.mealName}
          </p>
        </div>
      )}

      {/* Text */}
      <div className="flex-1 min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
          {emoji} {category}
        </p>
        <p className="text-sm font-semibold truncate">{meal.mealName}</p>
      </div>

      {/* Actions */}
      {cookable && (
        <Button
          variant="default"
          size="icon"
          className="h-9 w-9 rounded-full shrink-0"
          onClick={(e) => { e.stopPropagation(); onCook(); }}
        >
          <Play className="h-4 w-4 ml-0.5" />
        </Button>
      )}
    </div>
  );
}

// ─── Combined "plate" pieces (unified multi-recipe view) ───

// Grid of component photos shown until the AI combined image is ready.
function ComboThumbStack({
  components,
  generating,
}: {
  components: { meal: PlanMeal; index: number }[];
  generating: boolean;
}) {
  const shots = components.slice(0, 4);
  return (
    <>
      <div
        className={`h-full w-full grid gap-px ${
          shots.length > 2 ? "grid-cols-2 grid-rows-2" : "grid-cols-2"
        }`}
      >
        {shots.map(({ meal }, i) =>
          meal.mealPhoto ? (
            <img
              key={i}
              src={meal.mealPhoto}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <div
              key={i}
              className="h-full w-full bg-gradient-to-br from-muted/60 to-muted"
            />
          )
        )}
      </div>
      {generating && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
          <Loader2 className="h-4 w-4 animate-spin text-white" />
        </div>
      )}
    </>
  );
}

// Desktop/tablet unified cell: one AI plate photo + creative name for ≥2 recipes.
function UnifiedGridCell({
  components,
  category,
  onOpen,
}: {
  components: { meal: PlanMeal; index: number }[];
  category: string;
  onOpen: () => void;
}) {
  const mealIds = useMemo(
    () => components.map((c) => c.meal.mealId),
    [components]
  );
  const titles = useMemo(
    () => components.map((c) => c.meal.mealName),
    [components]
  );
  const { combo, generating } = useMealCombo({
    mealIds,
    titles,
    category,
    enabled: true,
    autoGenerate: true,
  });
  const name = combo?.name || `${titles[0]} +${titles.length - 1}`;

  return (
    <div
      className="group flex-1 flex flex-col 2xl:flex-row rounded-lg overflow-hidden cursor-pointer min-h-0 border border-border/40 bg-card hover:border-primary/40 hover:shadow-sm transition-all"
      onClick={onOpen}
    >
      <div className="relative shrink-0 h-[65%] 2xl:h-full 2xl:w-[120px] overflow-hidden bg-muted">
        {combo?.imageURL ? (
          <img
            src={combo.imageURL}
            alt={name}
            className="h-full w-full object-cover"
          />
        ) : (
          <ComboThumbStack components={components} generating={generating} />
        )}
        <span className="absolute top-1 right-1 rounded-full bg-black/55 text-white text-[9px] font-semibold px-1.5 py-0.5 leading-none backdrop-blur-sm">
          {components.length} recipes
        </span>
      </div>
      <div className="flex items-center gap-1 flex-1 px-1.5 min-h-0 2xl:flex-col 2xl:items-start 2xl:justify-center 2xl:px-2 2xl:py-1.5">
        <p
          className="flex-1 2xl:flex-none text-[10px] lg:text-xs font-semibold leading-tight line-clamp-2 min-w-0 2xl:w-full"
          title={name}
        >
          {name}
        </p>
      </div>
    </div>
  );
}

// Mobile unified card.
function MobileUnifiedMealCard({
  category,
  components,
  onOpen,
}: {
  category: string;
  components: { meal: PlanMeal; index: number }[];
  onOpen: () => void;
}) {
  const emoji = CATEGORY_EMOJI[category] ?? "";
  const mealIds = useMemo(
    () => components.map((c) => c.meal.mealId),
    [components]
  );
  const titles = useMemo(
    () => components.map((c) => c.meal.mealName),
    [components]
  );
  const { combo, generating } = useMealCombo({
    mealIds,
    titles,
    category,
    enabled: true,
    autoGenerate: true,
  });
  const name = combo?.name || `${titles[0]} +${titles.length - 1}`;

  return (
    <div
      className="flex items-center gap-3 rounded-xl border border-border bg-card p-2.5 shadow-sm cursor-pointer hover:border-primary/40 transition-colors"
      onClick={onOpen}
    >
      <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-muted">
        {combo?.imageURL ? (
          <img
            src={combo.imageURL}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <ComboThumbStack components={components} generating={generating} />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
          {emoji} {category} · {components.length} recipes
        </p>
        <p className="text-sm font-semibold truncate">{name}</p>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
    </div>
  );
}

// Header inside the expand sheet — combined photo, name, and regenerate action.
function ComboExpandHeader({
  category,
  components,
}: {
  category: string;
  components: { meal: PlanMeal; index: number }[];
}) {
  const mealIds = useMemo(
    () => components.map((c) => c.meal.mealId),
    [components]
  );
  const titles = useMemo(
    () => components.map((c) => c.meal.mealName),
    [components]
  );
  const { combo, generating, regenerate } = useMealCombo({
    mealIds,
    titles,
    category,
    enabled: true,
    autoGenerate: true,
  });
  const name = combo?.name || `${titles[0]} +${titles.length - 1}`;

  return (
    <div className="flex items-center gap-3 rounded-lg bg-muted/40 p-2">
      <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-muted">
        {combo?.imageURL ? (
          <img
            src={combo.imageURL}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <ComboThumbStack components={components} generating={generating} />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold leading-tight line-clamp-2">{name}</p>
        <button
          type="button"
          className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary disabled:opacity-50"
          onClick={() => regenerate()}
          disabled={generating}
        >
          <Sparkles className="h-3 w-3" />
          {generating ? "Generating…" : combo ? "Regenerate photo" : "Generate photo"}
        </button>
      </div>
    </div>
  );
}
