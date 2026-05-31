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
import {
  MEAL_CATEGORIES,
  type PlanInstance,
  type PlanMeal,
} from "@/lib/types/meal-plan";

const CATEGORY_ORDER: Record<string, number> = Object.fromEntries(
  MEAL_CATEGORIES.map((c, i) => [c, i])
);

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

  const nextMeal = useMemo(() => {
    if (!myMeals.length) return null;
    const hour = now.getHours();
    const guessIdx = myMeals.findIndex((m) => {
      if (m.category === "Breakfast") return hour < 10;
      if (m.category === "Lunch") return hour < 14;
      if (m.category === "Dinner") return hour < 21;
      return hour < 23;
    });
    return guessIdx >= 0 ? myMeals[guessIdx] : null;
  }, [myMeals, now]);

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
          transition: "transform 8s ease-in-out",
        }}
        className="flex flex-col items-center gap-6 px-8 text-center"
      >
        <div className="text-[15vw] leading-none font-light tabular-nums tracking-tight">
          {formatTime(now)}
        </div>
        <div className="text-2xl text-white/60">{formatDate(now)}</div>

        {split ? (
          // Both people have meals: vertical divider with each person's meals.
          <div className="mt-10 flex items-stretch justify-center gap-12">
            <MealColumn label={myLabel} groups={myGroups} />
            <div className="w-px self-stretch bg-white/15" />
            <MealColumn label={partnerLabel} groups={partnerGroups} />
          </div>
        ) : (
          <>
            {nextMeal && (
              <div className="mt-8 flex flex-col items-center gap-1">
                <div className="text-sm uppercase tracking-widest text-white/40">
                  Next: {nextMeal.category}
                </div>
                <div className="text-3xl text-white/90">{nextMeal.mealName}</div>
              </div>
            )}

            {myGroups.length > 0 && (
              <div className="mt-6 flex flex-col gap-3">
                {myGroups.map(([category, meals]) => (
                  <ScreensaverMealGroup
                    key={category}
                    category={category}
                    meals={meals}
                  />
                ))}
              </div>
            )}
          </>
        )}

        <div className="mt-12 text-xs text-white/30">Tap to dismiss</div>
      </div>
    </div>
  );
}

// One person's column in the split view: their name above their grouped meals.
function MealColumn({
  label,
  groups,
}: {
  label: string;
  groups: [string, PlanMeal[]][];
}) {
  return (
    <div className="flex min-w-[10rem] flex-col items-center gap-4 px-4">
      <div className="text-base uppercase tracking-[0.2em] text-white/50">
        {label}
      </div>
      <div className="flex flex-col gap-3">
        {groups.map(([category, meals]) => (
          <ScreensaverMealGroup
            key={category}
            category={category}
            meals={meals}
          />
        ))}
      </div>
    </div>
  );
}

// One category line on the screensaver. For a multi-recipe meal it shows the AI
// combined photo + name when one has already been generated (no generation is
// triggered here); otherwise it lists the component names.
function ScreensaverMealGroup({
  category,
  meals,
}: {
  category: string;
  meals: PlanMeal[];
}) {
  const isCombo = meals.length >= 2;
  const { combo } = useMealCombo({
    mealIds: meals.map((m) => m.mealId),
    titles: meals.map((m) => m.mealName),
    category,
    enabled: isCombo,
    autoGenerate: false,
  });

  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-sm uppercase tracking-widest text-white/30">
        {category}
      </span>
      {isCombo && combo?.imageURL && (
        <img
          src={combo.imageURL}
          alt=""
          className="mb-1 h-20 w-20 rounded-lg object-cover opacity-80"
        />
      )}
      {isCombo ? (
        <span className="text-base text-white/60">
          {combo?.name || meals.map((m) => m.mealName).join(" · ")}
        </span>
      ) : (
        meals.map((m, i) => (
          <span key={`${m.mealId}-${i}`} className="text-base text-white/60">
            {m.mealName}
          </span>
        ))
      )}
    </div>
  );
}
