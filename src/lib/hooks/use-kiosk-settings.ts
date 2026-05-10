"use client";

import { useEffect, useState, useCallback } from "react";

export type KioskSettings = {
  pixelShift: { enabled: boolean };
  autoTheme: {
    enabled: boolean;
    lightStart: string; // "HH:mm"
    darkStart: string;
    lightTheme: "light" | "kitchen-tool";
    darkTheme: "dark" | "kitchen-tool-dark";
  };
  screensaver: { enabled: boolean; idleMinutes: number };
};

export const DEFAULT_KIOSK_SETTINGS: KioskSettings = {
  pixelShift: { enabled: false },
  autoTheme: {
    enabled: false,
    lightStart: "06:00",
    darkStart: "17:30",
    lightTheme: "light",
    darkTheme: "dark",
  },
  screensaver: { enabled: false, idleMinutes: 10 },
};

const STORAGE_KEY = "kiosk-settings";
const EVENT_NAME = "kiosk-settings-change";

function read(): KioskSettings {
  if (typeof window === "undefined") return DEFAULT_KIOSK_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_KIOSK_SETTINGS;
    const parsed = JSON.parse(raw);
    return {
      pixelShift: { ...DEFAULT_KIOSK_SETTINGS.pixelShift, ...parsed.pixelShift },
      autoTheme: { ...DEFAULT_KIOSK_SETTINGS.autoTheme, ...parsed.autoTheme },
      screensaver: { ...DEFAULT_KIOSK_SETTINGS.screensaver, ...parsed.screensaver },
    };
  } catch {
    return DEFAULT_KIOSK_SETTINGS;
  }
}

export function useKioskSettings() {
  const [settings, setSettings] = useState<KioskSettings>(DEFAULT_KIOSK_SETTINGS);

  useEffect(() => {
    setSettings(read());
    const onChange = () => setSettings(read());
    window.addEventListener(EVENT_NAME, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener(EVENT_NAME, onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  const update = useCallback((next: KioskSettings) => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(EVENT_NAME));
    setSettings(next);
  }, []);

  return { settings, update };
}
