"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useCookingSession } from "@/lib/contexts/cooking-session-context";
import { Clock, Pause, Play, RotateCcw, X, ChevronUp, ChevronDown, Bell, BellOff, BellRing } from "lucide-react";

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export function TimerBar() {
  const {
    timers,
    pauseTimer,
    resumeTimer,
    resetTimer,
    adjustTimer,
    removeTimer,
    sessions,
    setActiveSession,
    updateSession,
    persistentAlarm,
    setPersistentAlarm,
    hasActiveAlarm,
    dismissAlarm,
  } = useCookingSession();
  const [expanded, setExpanded] = useState(false);

  if (timers.length === 0) return null;

  const runningCount = timers.filter((t) => t.isRunning).length;
  const completedCount = timers.filter((t) => t.isComplete).length;

  // Compact bar: show count and the timer closest to finishing (or the first completed)
  const completed = timers.find((t) => t.isComplete);
  const running = timers
    .filter((t) => t.isRunning)
    .sort((a, b) => a.remainingSeconds - b.remainingSeconds)[0];
  const featured = completed || running || timers[0];

  function jumpToTimer(recipeId: string, stepIndex: number) {
    const hasSession = sessions.some((s) => s.recipeId === recipeId);
    if (hasSession) {
      setActiveSession(recipeId);
      updateSession(recipeId, { currentStep: stepIndex });
      setExpanded(false);
    }
  }

  return (
    <div
      className={`border-t backdrop-blur-md ${
        hasActiveAlarm ? "bg-success/15 animate-pulse" : "bg-card/95"
      }`}
    >
      {/* Stop-alarm banner (appears when a completed timer needs acknowledgment) */}
      {hasActiveAlarm && (
        <div className="flex items-center justify-between gap-3 px-4 py-2 md:px-6 border-b border-success/30 bg-success/10">
          <div className="flex items-center gap-2 min-w-0">
            <BellRing className="h-4 w-4 text-success shrink-0" />
            <span className="text-sm font-medium text-success truncate">
              Timer complete!
            </span>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-8 border-success/40 bg-background text-success hover:bg-success/10"
            onClick={dismissAlarm}
          >
            Stop alarm
          </Button>
        </div>
      )}

      {/* Compact bar */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-2 md:px-6 hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
            <Clock className="h-4 w-4 text-primary" />
          </div>
          <div className="text-left">
            <div className="text-sm font-medium">
              {timers.length} timer{timers.length !== 1 ? "s" : ""}
              {completedCount > 0 && (
                <span className="ml-2 text-success">· {completedCount} done</span>
              )}
              {runningCount > 0 && completedCount === 0 && (
                <span className="ml-2 text-muted-foreground">· {runningCount} running</span>
              )}
            </div>
            {featured && (
              <div className="text-xs text-muted-foreground truncate max-w-[200px] md:max-w-none">
                {featured.recipeTitle} · {featured.label} ·{" "}
                <span
                  className={`font-mono ${featured.isComplete ? "text-success" : ""}`}
                >
                  {featured.isComplete ? "Done!" : formatTime(featured.remainingSeconds)}
                </span>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              setPersistentAlarm(!persistentAlarm);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.stopPropagation();
                e.preventDefault();
                setPersistentAlarm(!persistentAlarm);
              }
            }}
            className={`inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted ${
              persistentAlarm ? "text-primary" : "text-muted-foreground"
            }`}
            aria-label={
              persistentAlarm
                ? "Persistent alarm: on (tap to turn off)"
                : "Persistent alarm: off (tap to turn on)"
            }
            title={
              persistentAlarm
                ? "Persistent alarm on — sounds keep repeating until dismissed"
                : "Persistent alarm off — sound plays once"
            }
          >
            {persistentAlarm ? (
              <Bell className="h-4 w-4" />
            ) : (
              <BellOff className="h-4 w-4" />
            )}
          </span>
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {/* Expanded list */}
      {expanded && (
        <div className="max-h-[40vh] overflow-y-auto border-t">
          {timers.map((timer) => (
            <div
              key={timer.id}
              className="flex items-center gap-3 px-4 py-3 md:px-6 border-b last:border-b-0"
            >
              <div className="flex-1 min-w-0">
                <button
                  type="button"
                  onClick={() => jumpToTimer(timer.recipeId, timer.stepIndex)}
                  className="text-left block w-full"
                >
                  <div className="text-sm font-medium truncate">
                    {timer.recipeTitle}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {timer.label}
                  </div>
                </button>
              </div>
              <div
                className={`font-mono text-base md:text-lg font-semibold min-w-[60px] text-right ${
                  timer.isComplete ? "text-success" : ""
                }`}
              >
                {timer.isComplete ? "Done!" : formatTime(timer.remainingSeconds)}
              </div>
              <div className="flex items-center gap-0.5">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-1.5 text-xs font-mono"
                  onClick={() => adjustTimer(timer.id, -60)}
                  disabled={!timer.isComplete && timer.remainingSeconds <= 0}
                  title="Subtract 1 minute"
                >
                  −1m
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-1.5 text-xs font-mono"
                  onClick={() => adjustTimer(timer.id, -10)}
                  disabled={!timer.isComplete && timer.remainingSeconds <= 0}
                  title="Subtract 10 seconds"
                >
                  −10s
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-1.5 text-xs font-mono"
                  onClick={() => adjustTimer(timer.id, 10)}
                  title="Add 10 seconds"
                >
                  +10s
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-1.5 text-xs font-mono"
                  onClick={() => adjustTimer(timer.id, 60)}
                  title="Add 1 minute"
                >
                  +1m
                </Button>
              </div>
              <div className="flex items-center gap-1">
                {!timer.isComplete && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() =>
                      timer.isRunning
                        ? pauseTimer(timer.id)
                        : resumeTimer(timer.id)
                    }
                  >
                    {timer.isRunning ? (
                      <Pause className="h-4 w-4" />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => resetTimer(timer.id)}
                >
                  <RotateCcw className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => removeTimer(timer.id)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
