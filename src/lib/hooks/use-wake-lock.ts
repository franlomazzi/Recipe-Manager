"use client";

import { useEffect, useRef, useState } from "react";

export function useWakeLock() {
  const [isActive, setIsActive] = useState(false);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  async function requestWakeLock() {
    if (!("wakeLock" in navigator)) return;

    try {
      wakeLockRef.current = await navigator.wakeLock.request("screen");
      setIsActive(true);

      wakeLockRef.current.addEventListener("release", () => {
        setIsActive(false);
      });
    } catch {
      setIsActive(false);
    }
  }

  async function releaseWakeLock() {
    if (wakeLockRef.current) {
      await wakeLockRef.current.release();
      wakeLockRef.current = null;
      setIsActive(false);
    }
  }

  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === "visible" && isActive) {
        requestWakeLock();
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      releaseWakeLock();
    };
  }, [isActive]);

  return { isActive, requestWakeLock, releaseWakeLock };
}
