"use client";

import { useEffect, useState } from "react";
import { Pause, Play, Timer } from "lucide-react";
import { useCookingSession, computeSessionElapsedMs } from "@/lib/contexts/cooking-session-context";

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

interface SessionElapsedTimerProps {
  recipeId: string;
}

export function SessionElapsedTimer({ recipeId }: SessionElapsedTimerProps) {
  const { sessions, pauseSessionTimer, resumeSessionTimer } = useCookingSession();
  const session = sessions.find((s) => s.recipeId === recipeId);
  const [displayMs, setDisplayMs] = useState(0);

  const startedAt = session?.startedAt ?? 0;
  const elapsedPausedMs = session?.elapsedPausedMs ?? 0;
  const pausedAt = session?.pausedAt ?? null;
  const isPaused = pausedAt !== null;

  useEffect(() => {
    if (!session) return;
    setDisplayMs(computeSessionElapsedMs(startedAt, elapsedPausedMs, pausedAt));
    if (isPaused) return;
    const interval = setInterval(() => {
      setDisplayMs(computeSessionElapsedMs(startedAt, elapsedPausedMs, null));
    }, 1000);
    return () => clearInterval(interval);
  // rerun when pause state or accumulated paused time changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startedAt, elapsedPausedMs, isPaused]);

  if (!session) return null;

  return (
    <div className="flex items-center gap-1.5">
      <Timer className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <span
        className={`font-mono text-sm font-medium tabular-nums ${
          isPaused ? "text-muted-foreground" : ""
        }`}
      >
        {formatElapsed(displayMs)}
      </span>
      <button
        onClick={() =>
          isPaused ? resumeSessionTimer(recipeId) : pauseSessionTimer(recipeId)
        }
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground transition-colors"
        aria-label={isPaused ? "Resume session timer" : "Pause session timer"}
        title={isPaused ? "Resume" : "Pause"}
      >
        {isPaused ? (
          <Play className="h-2.5 w-2.5 translate-x-[1px]" />
        ) : (
          <Pause className="h-2.5 w-2.5" />
        )}
      </button>
    </div>
  );
}
