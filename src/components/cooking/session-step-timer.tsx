"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Pause, Play, RotateCcw } from "lucide-react";
import { useCookingSession } from "@/lib/contexts/cooking-session-context";

interface SessionStepTimerProps {
  recipeId: string;
  recipeTitle: string;
  stepIndex: number;
  minutes: number;
  label: string;
}

export function SessionStepTimer({
  recipeId,
  recipeTitle,
  stepIndex,
  minutes,
  label,
}: SessionStepTimerProps) {
  const {
    timers,
    startTimer,
    pauseTimer,
    resumeTimer,
    resetTimer,
    adjustTimer,
  } = useCookingSession();

  const timerIdRef = useRef<string | null>(null);

  // Find existing timer for this step
  const timer = timers.find(
    (t) =>
      t.recipeId === recipeId &&
      t.stepIndex === stepIndex &&
      t.totalSeconds === minutes * 60
  );

  // Track the timer id once created
  useEffect(() => {
    if (timer) {
      timerIdRef.current = timer.id;
    }
  }, [timer]);

  // Reset the tracked id when step/recipe changes
  useEffect(() => {
    timerIdRef.current = null;
  }, [recipeId, stepIndex, minutes]);

  const totalSeconds = minutes * 60;
  const remainingSeconds = timer?.remainingSeconds ?? totalSeconds;
  const isRunning = timer?.isRunning ?? false;
  const isComplete = timer?.isComplete ?? false;
  const progress = totalSeconds > 0 ? (totalSeconds - remainingSeconds) / totalSeconds : 0;

  const displayMinutes = Math.floor(remainingSeconds / 60);
  const displaySeconds = remainingSeconds % 60;
  const formattedTime = `${displayMinutes.toString().padStart(2, "0")}:${displaySeconds.toString().padStart(2, "0")}`;

  const circumference = 2 * Math.PI * 54;
  const strokeDashoffset = circumference * (1 - progress);

  function handleStartOrResume() {
    if (timer) {
      if (timer.isComplete) {
        resetTimer(timer.id);
        // Start it after reset by scheduling a resume
        setTimeout(() => resumeTimer(timer.id), 0);
      } else {
        resumeTimer(timer.id);
      }
    } else {
      startTimer({
        recipeId,
        recipeTitle,
        stepIndex,
        label,
        totalSeconds,
        remainingSeconds: totalSeconds,
      });
    }
  }

  function handlePause() {
    if (timer) pauseTimer(timer.id);
  }

  function handleReset() {
    if (timer) resetTimer(timer.id);
  }

  const hasStarted = timer !== undefined;

  return (
    <div className="flex flex-col items-center gap-4">
      <p className="text-sm font-medium text-muted-foreground">{label}</p>

      <div className="relative flex h-36 w-36 items-center justify-center">
        <svg className="absolute h-full w-full -rotate-90" viewBox="0 0 120 120">
          <circle
            cx="60"
            cy="60"
            r="54"
            fill="none"
            stroke="currentColor"
            strokeWidth="4"
            className="text-muted"
          />
          <circle
            cx="60"
            cy="60"
            r="54"
            fill="none"
            stroke="currentColor"
            strokeWidth="4"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className={isComplete ? "text-success" : "text-primary"}
          />
        </svg>
        <span
          className={`text-3xl font-mono font-bold ${isComplete ? "text-success" : ""}`}
        >
          {isComplete ? "Done!" : formattedTime}
        </span>
      </div>

      <div className="flex items-center gap-2">
        {!isComplete && (
          <Button
            variant={isRunning ? "outline" : "default"}
            size="lg"
            onClick={isRunning ? handlePause : handleStartOrResume}
          >
            {isRunning ? (
              <>
                <Pause className="mr-2 h-4 w-4" />
                Pause
              </>
            ) : (
              <>
                <Play className="mr-2 h-4 w-4" />
                {hasStarted && remainingSeconds < totalSeconds ? "Resume" : "Start"}
              </>
            )}
          </Button>
        )}
        <Button variant="outline" size="icon" onClick={handleReset} disabled={!hasStarted}>
          <RotateCcw className="h-4 w-4" />
        </Button>
      </div>

      {hasStarted && (
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-2 text-xs font-mono"
            onClick={() => adjustTimer(timer!.id, -60)}
            disabled={!isComplete && remainingSeconds <= 0}
          >
            −1m
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-2 text-xs font-mono"
            onClick={() => adjustTimer(timer!.id, -10)}
            disabled={!isComplete && remainingSeconds <= 0}
          >
            −10s
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-2 text-xs font-mono"
            onClick={() => adjustTimer(timer!.id, 10)}
          >
            +10s
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-2 text-xs font-mono"
            onClick={() => adjustTimer(timer!.id, 60)}
          >
            +1m
          </Button>
        </div>
      )}
    </div>
  );
}
