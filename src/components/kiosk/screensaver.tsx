"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useKioskSettings } from "@/lib/hooks/use-kiosk-settings";
import { useActivePlan } from "@/lib/hooks/use-active-plan";
import { MEAL_CATEGORIES, type PlanMeal } from "@/lib/types/meal-plan";

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

const CATEGORY_ORDER: Record<string, number> = Object.fromEntries(
  MEAL_CATEGORIES.map((c, i) => [c, i])
);

export function Screensaver() {
  const { settings } = useKioskSettings();
  const { instance, todayIndices } = useActivePlan();
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

  const todaysMeals = useMemo<PlanMeal[]>(() => {
    if (!instance || !todayIndices) return [];
    const week = instance.snapshot[todayIndices.weekIndex];
    if (!week) return [];
    const day = week.days[todayIndices.dayIndex];
    if (!day) return [];
    return [...day.meals].sort(
      (a, b) =>
        (CATEGORY_ORDER[a.category] ?? 99) - (CATEGORY_ORDER[b.category] ?? 99)
    );
  }, [instance, todayIndices]);

  const nextMeal = useMemo(() => {
    if (!todaysMeals.length) return null;
    const hour = now.getHours();
    const guessIdx = todaysMeals.findIndex((m) => {
      if (m.category === "Breakfast") return hour < 10;
      if (m.category === "Lunch") return hour < 14;
      if (m.category === "Dinner") return hour < 21;
      return hour < 23;
    });
    return guessIdx >= 0 ? todaysMeals[guessIdx] : null;
  }, [todaysMeals, now]);

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

        {nextMeal && (
          <div className="mt-8 flex flex-col items-center gap-1">
            <div className="text-sm uppercase tracking-widest text-white/40">
              Next: {nextMeal.category}
            </div>
            <div className="text-3xl text-white/90">{nextMeal.mealName}</div>
          </div>
        )}

        {todaysMeals.length > 0 && (
          <div className="mt-6 flex flex-col gap-1">
            {todaysMeals.map((m, i) => (
              <div
                key={`${m.category}-${i}`}
                className="text-base text-white/40"
              >
                <span className="uppercase tracking-wider">{m.category}</span>
                <span className="mx-2">·</span>
                <span>{m.mealName}</span>
              </div>
            ))}
          </div>
        )}

        <div className="mt-12 text-xs text-white/30">Tap to dismiss</div>
      </div>
    </div>
  );
}
