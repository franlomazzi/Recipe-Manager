"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useKioskSettings } from "@/lib/hooks/use-kiosk-settings";
import { useActivePlan } from "@/lib/hooks/use-active-plan";
import { useAdhocWeek } from "@/lib/hooks/use-adhoc-week";
import { usePartnerPlan } from "@/lib/hooks/use-partner-plan";
import { useAuth } from "@/lib/contexts/auth-context";
import { useHousehold } from "@/lib/contexts/household-context";
import { getIndicesForDate } from "@/lib/firebase/meal-plans";
import { useMealCombo } from "@/lib/hooks/use-meal-combo";
import { useRecipes } from "@/lib/hooks/use-recipes";
import {
  MEAL_CATEGORIES,
  type PlanInstance,
  type PlanMeal,
} from "@/lib/types/meal-plan";

const CATEGORY_ORDER: Record<string, number> = Object.fromEntries(
  MEAL_CATEGORIES.map((c, i) => [c, i])
);

// A warm accent per category so each meal label pops against the black.
const CATEGORY_ACCENT: Record<string, string> = {
  Breakfast: "text-amber-300",
  Lunch: "text-lime-300",
  Dinner: "text-orange-300",
  Snacks: "text-sky-300",
};

const CATEGORY_EMOJI: Record<string, string> = {
  Breakfast: "🍳",
  Lunch: "🥗",
  Dinner: "🍲",
  Snacks: "🍎",
};

// Rough cut-off hour after which a category's meal is considered eaten.
function isCategoryPast(category: string, hour: number): boolean {
  if (category === "Breakfast") return hour >= 10;
  if (category === "Lunch") return hour >= 14;
  if (category === "Dinner") return hour >= 21;
  return hour >= 23;
}

function dayMealsFromInstance(
  instance: PlanInstance | null,
  date: Date
): PlanMeal[] {
  if (!instance) return [];
  const idx = getIndicesForDate(instance, date);
  if (!idx) return [];
  return instance.snapshot[idx.weekIndex]?.days[idx.dayIndex]?.meals ?? [];
}

/**
 * Resolve a person's meals for `date`: prefer their active plan, falling back
 * to any freestyle week that has meals that day. Sorted by meal category.
 */
function resolveDayMeals(
  instance: PlanInstance | null,
  adhocWeeks: (PlanInstance | null)[],
  date: Date
): PlanMeal[] {
  let meals = dayMealsFromInstance(instance, date);
  if (meals.length === 0) {
    for (const w of adhocWeeks) {
      const found = dayMealsFromInstance(w, date);
      if (found.length > 0) {
        meals = found;
        break;
      }
    }
  }
  return [...meals].sort(
    (a, b) =>
      (CATEGORY_ORDER[a.category] ?? 99) - (CATEGORY_ORDER[b.category] ?? 99)
  );
}

// Group a day's meals by category, preserving the incoming sort order. Each
// category may hold multiple components in multi-recipe mode.
function groupByCategory(meals: PlanMeal[]): [string, PlanMeal[]][] {
  const groups = new Map<string, PlanMeal[]>();
  for (const m of meals) {
    const arr = groups.get(m.category) ?? [];
    arr.push(m);
    groups.set(m.category, arr);
  }
  return Array.from(groups.entries());
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDate(d: Date): string {
  return d.toLocaleDateString([], {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export function Screensaver() {
  const { settings } = useKioskSettings();
  const { user } = useAuth();
  const { household } = useHousehold();
  const { instance } = useActivePlan();
  const { adhocWeeks } = useAdhocWeek();
  const {
    instance: partnerInstance,
    adhocWeeks: partnerAdhocWeeks,
    partnerName,
  } = usePartnerPlan();
  const [active, setActive] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [drift, setDrift] = useState({ x: 0, y: 0 });
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const enabled = settings.screensaver.enabled;
  const idleMs = Math.max(1, settings.screensaver.idleMinutes) * 60_000;

  useEffect(() => {
    if (!enabled) {
      setActive(false);
      return;
    }
    const reset = () => {
      setActive(false);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setActive(true), idleMs);
    };
    const events = ["pointerdown", "pointermove", "keydown", "touchstart"];
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => {
      events.forEach((e) => window.removeEventListener(e, reset));
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [enabled, idleMs]);

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, [active]);

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => {
      // Drift around within ±10% of viewport (clamped) so the clock never sits.
      const w = typeof window !== "undefined" ? window.innerWidth : 1000;
      const h = typeof window !== "undefined" ? window.innerHeight : 1000;
      const rx = (Math.random() - 0.5) * w * 0.2;
      const ry = (Math.random() - 0.5) * h * 0.2;
      setDrift({ x: Math.round(rx), y: Math.round(ry) });
    }, 60_000);
    return () => clearInterval(id);
  }, [active]);

  const myMeals = useMemo<PlanMeal[]>(
    () => resolveDayMeals(instance, adhocWeeks, now),
    [instance, adhocWeeks, now]
  );
  const partnerMeals = useMemo<PlanMeal[]>(
    () => resolveDayMeals(partnerInstance, partnerAdhocWeeks, now),
    [partnerInstance, partnerAdhocWeeks, now]
  );

  const myGroups = useMemo(() => groupByCategory(myMeals), [myMeals]);
  const partnerGroups = useMemo(
    () => groupByCategory(partnerMeals),
    [partnerMeals]
  );

  // Only split into two columns when both people have meals planned that day.
  const split = myMeals.length > 0 && partnerMeals.length > 0;

  const myLabel = (user && household?.memberNames?.[user.uid]) || "You";
  const partnerLabel = partnerName || "Partner";

  const hour = now.getHours();
  const nextCategory = useMemo(() => {
    const next = myMeals.find((m) => !isCategoryPast(m.category, hour));
    return next?.category ?? null;
  }, [myMeals, hour]);

  const nextGroup = myGroups.find(([c]) => c === nextCategory) ?? null;
  const otherGroups = myGroups.filter(([c]) => c !== nextCategory);

  // Late at night the screen dims so it isn't glaring in a dark kitchen and
  // draws less power; meals stay readable.
  const nightDim = hour >= 22 || hour < 6;

  if (!enabled || !active) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black text-white"
      style={{ animation: "kiosk-fade-in 1s ease-in-out" }}
      onClick={() => setActive(false)}
    >
      <style>{`
        @keyframes kiosk-fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
      <div
        style={{
          transform: `translate(${drift.x}px, ${drift.y}px)`,
          transition: "transform 8s ease-in-out, opacity 2s ease-in-out",
          opacity: nightDim ? 0.5 : 1,
        }}
        className="flex flex-col items-center gap-4 px-8 text-center"
      >
        <div className="text-[9vw] leading-none font-light tabular-nums tracking-tight">
          {formatTime(now)}
        </div>
        <div className="text-xl text-white/60">{formatDate(now)}</div>

        {split ? (
          // Both people have meals: vertical divider with each person's meals.
          <div className="mt-6 flex items-stretch justify-center gap-10">
            <MealColumn label={myLabel} groups={myGroups} hour={hour} />
            <div className="w-px self-stretch bg-white/15" />
            <MealColumn
              label={partnerLabel}
              groups={partnerGroups}
              hour={hour}
            />
          </div>
        ) : (
          <>
            {nextGroup && (
              <ScreensaverMealGroup
                category={nextGroup[0]}
                meals={nextGroup[1]}
                variant="hero"
              />
            )}

            {otherGroups.length > 0 && (
              <div className="mt-4 flex flex-wrap items-start justify-center gap-6">
                {otherGroups.map(([category, meals]) => (
                  <ScreensaverMealGroup
                    key={category}
                    category={category}
                    meals={meals}
                    variant="tile"
                    past={isCategoryPast(category, hour)}
                  />
                ))}
              </div>
            )}
          </>
        )}

        <div className="mt-8 text-xs text-white/30">Tap to dismiss</div>
      </div>
    </div>
  );
}

// One person's column in the split view: their name above their grouped meals.
function MealColumn({
  label,
  groups,
  hour,
}: {
  label: string;
  groups: [string, PlanMeal[]][];
  hour: number;
}) {
  const nextCategory =
    groups.find(([c]) => !isCategoryPast(c, hour))?.[0] ?? null;
  return (
    <div className="flex min-w-[14rem] flex-col items-start gap-4 px-2">
      <div className="self-center text-base uppercase tracking-[0.2em] text-white/50">
        {label}
      </div>
      <div className="flex flex-col gap-3">
        {groups.map(([category, meals]) => (
          <ScreensaverMealGroup
            key={category}
            category={category}
            meals={meals}
            variant="row"
            highlight={category === nextCategory}
            past={isCategoryPast(category, hour)}
          />
        ))}
      </div>
    </div>
  );
}

// One category on the screensaver, with its photo next to the name:
// - "hero": the next meal, large photo so it catches the eye from across the room
// - "tile": the rest of the day in a row of smaller photo tiles
// - "row":  compact thumbnail + name, used in the two-person split view
// Multi-recipe meals use the AI combined photo + name when one has already been
// generated (no generation is triggered here); otherwise the first component
// photo and the component names.
function ScreensaverMealGroup({
  category,
  meals,
  variant,
  highlight = false,
  past = false,
}: {
  category: string;
  meals: PlanMeal[];
  variant: "hero" | "tile" | "row";
  highlight?: boolean;
  past?: boolean;
}) {
  const { recipes } = useRecipes();
  const isCombo = meals.length >= 2;
  const { combo } = useMealCombo({
    mealIds: meals.map((m) => m.mealId),
    titles: meals.map((m) => m.mealName),
    category,
    enabled: isCombo,
    autoGenerate: false,
  });

  // Plan snapshots strip mealPhoto, so fall back to the recipe's own photo.
  const photo =
    (isCombo ? combo?.imageURL : null) ??
    meals
      .map(
        (m) =>
          m.mealPhoto ?? recipes.find((r) => r.id === m.mealId)?.photoURL ?? null
      )
      .find(Boolean) ??
    null;
  const name = isCombo
    ? combo?.name || meals.map((m) => m.mealName).join(" · ")
    : meals[0]?.mealName ?? "";
  const accent = CATEGORY_ACCENT[category] ?? "text-white/70";

  if (variant === "hero") {
    return (
      <div className="mt-4 flex items-center gap-6 rounded-3xl bg-white/[0.06] p-4 pr-8 text-left">
        <MealPhoto
          src={photo}
          category={category}
          className="h-44 w-44 rounded-2xl md:h-56 md:w-56"
        />
        <div className="flex max-w-[28rem] flex-col gap-2">
          <span
            className={`text-base font-semibold uppercase tracking-[0.25em] ${accent}`}
          >
            Next · {category}
          </span>
          <span className="text-4xl font-medium leading-tight text-white md:text-5xl">
            {name}
          </span>
        </div>
      </div>
    );
  }

  if (variant === "tile") {
    return (
      <div
        className={`flex w-36 flex-col items-center gap-2 ${past ? "opacity-40" : ""}`}
      >
        <MealPhoto
          src={photo}
          category={category}
          className="h-28 w-28 rounded-xl"
        />
        <span
          className={`text-xs font-semibold uppercase tracking-widest ${accent}`}
        >
          {category}
        </span>
        <span className="line-clamp-2 text-base leading-snug text-white/85">
          {name}
        </span>
      </div>
    );
  }

  return (
    <div
      className={`flex items-center gap-4 rounded-2xl p-2 pr-4 text-left ${
        highlight ? "bg-white/[0.08]" : ""
      } ${past ? "opacity-40" : ""}`}
    >
      <MealPhoto
        src={photo}
        category={category}
        className={highlight ? "h-24 w-24 rounded-xl" : "h-16 w-16 rounded-lg"}
      />
      <div className="flex max-w-[16rem] flex-col gap-0.5">
        <span
          className={`text-xs font-semibold uppercase tracking-widest ${accent}`}
        >
          {highlight ? `Next · ${category}` : category}
        </span>
        <span
          className={`line-clamp-2 leading-snug ${
            highlight ? "text-2xl text-white" : "text-base text-white/85"
          }`}
        >
          {name}
        </span>
      </div>
    </div>
  );
}

// Meal photo, or a category emoji on a soft tile when there is no photo (or it
// fails to load).
function MealPhoto({
  src,
  category,
  className,
}: {
  src: string | null;
  category: string;
  className: string;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  if (src && src !== failedSrc) {
    return (
      <img
        src={src}
        alt=""
        decoding="async"
        onError={() => setFailedSrc(src)}
        className={`shrink-0 object-cover ${className}`}
      />
    );
  }
  return (
    <div
      className={`flex shrink-0 items-center justify-center bg-white/10 text-4xl ${className}`}
    >
      {CATEGORY_EMOJI[category] ?? "🍽️"}
    </div>
  );
}
