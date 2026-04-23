"use client";

import { useTimer } from "@/lib/hooks/use-timer";
import { Button } from "@/components/ui/button";
import { Pause, Play, RotateCcw, Volume2 } from "lucide-react";
import { useCallback, useRef } from "react";

interface StepTimerProps {
  minutes: number;
  label: string;
}

export function StepTimer({ minutes, label }: StepTimerProps) {
  const audioContextRef = useRef<AudioContext | null>(null);

  const playAlarm = useCallback(() => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext();
      }
      const ctx = audioContextRef.current;
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.type = "sine";

      // Play 3 beeps
      const now = ctx.currentTime;
      for (let i = 0; i < 3; i++) {
        const start = now + i * 0.4;
        oscillator.frequency.setValueAtTime(880, start);
        gain.gain.setValueAtTime(0.3, start);
        gain.gain.setValueAtTime(0, start + 0.2);
      }
      oscillator.start(now);
      oscillator.stop(now + 1.2);
    } catch {
      // Silently fail if audio is not available
    }
  }, []);

  const timer = useTimer(minutes, { onComplete: playAlarm });

  const formattedTime = `${timer.minutes.toString().padStart(2, "0")}:${timer.seconds.toString().padStart(2, "0")}`;

  const circumference = 2 * Math.PI * 54;
  const strokeDashoffset = circumference * (1 - timer.progress);

  return (
    <div className="flex flex-col items-center gap-4">
      <p className="text-sm font-medium text-muted-foreground">{label}</p>

      {/* Circular progress */}
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
            className={timer.isComplete ? "text-success" : "text-primary"}
          />
        </svg>
        <span
          className={`text-3xl font-mono font-bold kt-cook-timer ${
            timer.isComplete ? "text-success" : ""
          }`}
        >
          {timer.isComplete ? "Done!" : formattedTime}
        </span>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2">
        {!timer.isComplete && (
          <Button
            variant={timer.isRunning ? "outline" : "default"}
            size="lg"
            onClick={timer.isRunning ? timer.pause : timer.start}
          >
            {timer.isRunning ? (
              <>
                <Pause className="mr-2 h-4 w-4" />
                Pause
              </>
            ) : (
              <>
                <Play className="mr-2 h-4 w-4" />
                {timer.remainingSeconds < minutes * 60 ? "Resume" : "Start"}
              </>
            )}
          </Button>
        )}
        <Button variant="outline" size="icon" onClick={timer.reset}>
          <RotateCcw className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
