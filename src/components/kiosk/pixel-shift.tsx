"use client";

import { useEffect, useState } from "react";
import { useKioskSettings } from "@/lib/hooks/use-kiosk-settings";

const POSITIONS: Array<[number, number]> = [
  [0, 0],
  [2, 1],
  [1, 2],
  [-1, 2],
  [-2, 1],
  [-2, -1],
  [-1, -2],
  [1, -2],
];

const SHIFT_INTERVAL_MS = 90_000;

export function usePixelShiftStyle(phase: number = 0): React.CSSProperties {
  const { settings } = useKioskSettings();
  const [step, setStep] = useState(phase);

  useEffect(() => {
    if (!settings.pixelShift.enabled) return;
    const id = setInterval(() => setStep((s) => s + 1), SHIFT_INTERVAL_MS);
    return () => clearInterval(id);
  }, [settings.pixelShift.enabled]);

  if (!settings.pixelShift.enabled) return {};

  const [x, y] = POSITIONS[step % POSITIONS.length];
  return {
    transform: `translate(${x}px, ${y}px)`,
    transition: "transform 2s ease-in-out",
  };
}
