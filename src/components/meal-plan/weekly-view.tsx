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

interface WeeklyViewProps {
  instance: PlanInstance;
  onShowTemplates: () => void;
  onEndPlan: () => void;
  endingPlan: boolean;
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
}: WeeklyViewProps) {
  const router = useRouter();
  const { recipes } = useRecipes();

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

  // Meal picker state — colIdx is the 0..6 column in the displayed Mon-Sun week
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<{
    colIdx: number;
    category: string;
  } | null>(null);

  // Meal action sheet state
  const [actionOpen, setActionOpen] = useState(false);
  const [actionTarget, setActionTarget] = useState<{
    colIdx: number;
    category: string;
  } | null>(null);

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

  const { forceShow } = useMealPlanPrefs();

  const usedCategories = useMemo(() => {
    const s = new Set<string>();
    for (const w of instance.snapshot)
      for (const d of w.days)
        for (const m of d.meals) s.add(m.category);
    return s;
  }, [instance.snapshot]);

  const visibleCategories = useMemo(() => {
    const filtered = MEAL_CATEGORIES.filter(
      (c) => usedCategories.has(c) || forceShow.has(c)
    );
    return filtered.length === 0 ? MEAL_CATEGORIES : filtered;
  }, [usedCategories, forceShow]);

  const recipeServings = useMemo(
    () => new Map(recipes.map((r) => [r.id, r.servings])),
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

  function openPicker(colIdx: number, category: string) {
    if (!indicesForColumn(colIdx)) return;
    setPickerTarget({ colIdx, category });
    setPickerOpen(true);
  }

  function openAction(colIdx: number, category: string) {
    if (!indicesForColumn(colIdx)) return;
    setActionTarget({ colIdx, category });
    setActionOpen(true);
  }

  async function handleMealSelect(meal: PlanMeal) {
    if (!pickerTarget) return;
    const indices = indicesForColumn(pickerTarget.colIdx);
    if (!indices) return;
    const { weekIndex, dayIndex } = indices;
    const day = instance.snapshot[weekIndex]?.days[dayIndex];
    if (!day) return;
    const updatedDay: PlanDay = {
      meals: [...day.meals.filter((m) => m.category !== pickerTarget.category), meal],
    };
    await updateInstanceDay(instance.id, weekIndex, dayIndex, updatedDay);
  }

  async function removeMeal(colIdx: number, category: string) {
    const indices = indicesForColumn(colIdx);
    if (!indices) return;
    const { weekIndex, dayIndex } = indices;
    const day = instance.snapshot[weekIndex]?.days[dayIndex];
    if (!day) return;
    const updatedDay: PlanDay = {
      meals: day.meals.filter((m) => m.category !== category),
    };
    await updateInstanceDay(instance.id, weekIndex, dayIndex, updatedDay);
  }

  function launchCook(mealId: string) {
    const defaultServings = recipeServings.get(mealId) ?? 1;
    setCookServings(defaultServings);
    setCookTarget({ mealId, defaultServings });
  }

  const currentMealId = pickerTarget
    ? getMeal(pickerTarget.colIdx, pickerTarget.category)?.mealId
    : undefined;

  return (
    <>
      <div className="flex flex-col flex-1 min-h-0">
        {/* ─── Compact control bar ─── */}
        <div className="flex items-center gap-2 mb-2 shrink-0">
          <div className="min-w-0 flex-1">
            <h2 className="text-sm md:text-base font-semibold truncate">
              {instance.templateName}
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
              className="grid flex-1 min-h-0 gap-1 lg:gap-1.5 2xl:max-h-[160px]"
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
                const meal = getMeal(dayIdx, category);
                const cookable = meal ? cookableIds.has(meal.mealId) : false;
                const inRange = indicesForColumn(dayIdx) !== null;
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
          <DialogHeader>
            <DialogTitle className="truncate">
              {actionTarget
                ? (getMeal(actionTarget.colIdx, actionTarget.category)?.mealName ?? "Meal options")
                : "Meal options"}
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2 pt-1">
            {actionTarget && (() => {
              const meal = getMeal(actionTarget.colIdx, actionTarget.category);
              return meal ? (
                <Button
                  className="w-full justify-start gap-3 h-12"
                  onClick={() => {
                    setActionOpen(false);
                    launchCook(meal.mealId);
                  }}
                >
                  <Play className="h-5 w-5" />
                  Start cooking
                </Button>
              ) : null;
            })()}
            <Button
              variant="outline"
              className="w-full justify-start gap-3 h-12"
              onClick={() => {
                const meal = actionTarget
                  ? getMeal(actionTarget.colIdx, actionTarget.category)
                  : undefined;
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
                if (target) openPicker(target.colIdx, target.category);
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
                if (target) removeMeal(target.colIdx, target.category);
              }}
            >
              <Trash2 className="h-5 w-5" />
              Remove from plan
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
        onRemove={
          pickerTarget
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
