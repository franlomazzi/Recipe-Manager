"use client";

import { useEffect, useRef } from "react";
import { useTheme } from "next-themes";
import { useKioskSettings } from "@/lib/hooks/use-kiosk-settings";

const OVERRIDE_KEY = "kiosk-auto-theme-override-until";

function parseHM(hm: string): { h: number; m: number } {
  const [h = "0", m = "0"] = hm.split(":");
  return { h: Number(h), m: Number(m) };
}

function minutesSinceMidnight(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

function expectedTheme(
  now: Date,
  lightStart: string,
  darkStart: string
): "light" | "dark" {
  const cur = minutesSinceMidnight(now);
  const l = parseHM(lightStart);
  const d = parseHM(darkStart);
  const lightMin = l.h * 60 + l.m;
  const darkMin = d.h * 60 + d.m;
  if (lightMin < darkMin) {
    return cur >= lightMin && cur < darkMin ? "light" : "dark";
  }
  return cur >= darkMin && cur < lightMin ? "dark" : "light";
}

export function setAutoThemeOverrideUntilNextFlip() {
  if (typeof window === "undefined") return;
  // Override expires far in the future; cleared at next scheduled flip.
  // We just store a flag — the auto-theme hook will clear it when it next
  // crosses a threshold.
  window.localStorage.setItem(OVERRIDE_KEY, "active");
}

export function useAutoTheme() {
  const { settings } = useKioskSettings();
  const { setTheme } = useTheme();
  const lastAppliedRef = useRef<"light" | "dark" | null>(null);

  useEffect(() => {
    const cfg = settings.autoTheme;
    if (!cfg.enabled) {
      lastAppliedRef.current = null;
      return;
    }

    const tick = () => {
      const target = expectedTheme(new Date(), cfg.lightStart, cfg.darkStart);
      const last = lastAppliedRef.current;
      const override = window.localStorage.getItem(OVERRIDE_KEY);

      if (last !== null && last !== target) {
        // Threshold crossed — clear any manual override and apply.
        window.localStorage.removeItem(OVERRIDE_KEY);
        const themeName = target === "light" ? cfg.lightTheme : cfg.darkTheme;
        setTheme(themeName);
        lastAppliedRef.current = target;
        return;
      }

      if (last === null) {
        // First run after enable — apply unless override is present.
        if (!override) {
          const themeName = target === "light" ? cfg.lightTheme : cfg.darkTheme;
          setTheme(themeName);
        }
        lastAppliedRef.current = target;
      }
    };

    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [
    settings.autoTheme,
    setTheme,
  ]);
}
