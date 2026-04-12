"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface UseTimerOptions {
  onComplete?: () => void;
}

export function useTimer(initialMinutes: number, options?: UseTimerOptions) {
  const [totalSeconds, setTotalSeconds] = useState(initialMinutes * 60);
  const [remainingSeconds, setRemainingSeconds] = useState(initialMinutes * 60);
  const [isRunning, setIsRunning] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onCompleteRef = useRef(options?.onComplete);
  onCompleteRef.current = options?.onComplete;

  const start = useCallback(() => setIsRunning(true), []);
  const pause = useCallback(() => setIsRunning(false), []);

  const reset = useCallback(() => {
    setIsRunning(false);
    setRemainingSeconds(totalSeconds);
  }, [totalSeconds]);

  useEffect(() => {
    setTotalSeconds(initialMinutes * 60);
    setRemainingSeconds(initialMinutes * 60);
    setIsRunning(false);
  }, [initialMinutes]);

  useEffect(() => {
    if (!isRunning) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    intervalRef.current = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          setIsRunning(false);
          onCompleteRef.current?.();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isRunning]);

  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  const progress = totalSeconds > 0 ? (totalSeconds - remainingSeconds) / totalSeconds : 0;

  return {
    minutes,
    seconds,
    remainingSeconds,
    isRunning,
    progress,
    isComplete: remainingSeconds === 0,
    start,
    pause,
    reset,
  };
}
