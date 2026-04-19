"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useWakeLock } from "@/lib/hooks/use-wake-lock";
import { useAuth } from "@/lib/contexts/auth-context";
import { StepTimer } from "./step-timer";
import { CookingResults } from "./cooking-results";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  ArrowRight,
  ChevronLeft,
  Clock,
  X,
  ChefHat,
  Minus,
  Plus,
  Lightbulb,
  StickyNote,
} from "lucide-react";
import { ImprovementSuggestions } from "@/components/recipe/improvement-suggestions";
import type { Recipe, CookLog } from "@/lib/types/recipe";

interface CookingModeViewProps {
  recipe: Recipe;
  cookLogs?: CookLog[];
}

export function CookingModeView({ recipe, cookLogs = [] }: CookingModeViewProps) {
  const router = useRouter();
  const { user } = useAuth();
  const [currentStep, setCurrentStep] = useState(0);
  const [showResults, setShowResults] = useState(false);
  const [servingMultiplier, setServingMultiplier] = useState(1);
  const { requestWakeLock, releaseWakeLock } = useWakeLock();
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestionsDismissed, setSuggestionsDismissed] = useState(false);
  const [servingsLocked, setServingsLocked] = useState(false);
  const [stepNotes, setStepNotes] = useState<Record<number, string>>({});
  const [activeNoteStep, setActiveNoteStep] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef<number | null>(null);

  const unappliedImprovements = cookLogs.filter(
    (log) => log.improvements?.trim() && log.appliedToVersion === null
  );
  const hasImprovements = unappliedImprovements.length > 0;

  const steps = recipe.steps;
  const step = steps[currentStep];
  const isFirst = currentStep === 0;
  const isLast = currentStep === steps.length - 1;
  const adjustedServings = recipe.servings * servingMultiplier;

  // Lock servings once cooking progresses past first step
  useEffect(() => {
    if (currentStep > 0 && !servingsLocked) {
      setServingsLocked(true);
    }
  }, [currentStep]);

  useEffect(() => {
    requestWakeLock();
    return () => {
      releaseWakeLock();
    };
  }, []);

  // Auto-show suggestions on mount if there are unapplied improvements
  useEffect(() => {
    if (hasImprovements && !suggestionsDismissed) {
      setShowSuggestions(true);
    }
  }, [hasImprovements]);

  const goNext = useCallback(() => {
    if (!isLast) setCurrentStep((s) => s + 1);
  }, [isLast]);

  const goPrev = useCallback(() => {
    if (!isFirst) setCurrentStep((s) => s - 1);
  }, [isFirst]);

  function setStepNote(stepIndex: number, note: string) {
    setStepNotes((prev) => ({ ...prev, [stepIndex]: note }));
  }

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (showResults) return;
      if (e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        goNext();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      } else if (e.key === "Escape") {
        router.back();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [goNext, goPrev, router, showResults]);

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null) return;
    const diff = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(diff) > 50) {
      if (diff < 0) goNext();
      else goPrev();
    }
    touchStartX.current = null;
  }

  function scaleQuantity(qty: number | null): string {
    if (qty === null) return "";
    const scaled = qty * servingMultiplier;
    return scaled % 1 === 0 ? String(scaled) : scaled.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  }

  // Find ingredients mentioned in current step
  const highlightedIngredients = recipe.ingredients.filter((ing) =>
    step?.instruction?.toLowerCase().includes(ing.name.toLowerCase())
  );

  const progress = ((currentStep + 1) / steps.length) * 100;

  if (showResults) {
    return (
      <CookingResults
        recipe={recipe}
        servingsCooked={adjustedServings}
        stepNotes={stepNotes}
        onClose={() => router.back()}
      />
    );
  }

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 flex flex-col bg-background"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Progress bar */}
      <div className="h-1 w-full bg-muted">
        <div
          className="h-full bg-primary transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 md:px-6 md:py-4">
        <Button variant="ghost" size="sm" className="md:text-base" onClick={() => router.back()}>
          <ChevronLeft className="mr-1 h-4 w-4 md:h-5 md:w-5" />
          <span className="hidden sm:inline">{recipe.title}</span>
          <span className="sm:hidden">Back</span>
        </Button>

        {/* Serving adjuster in top bar */}
        <div className="flex items-center gap-2 md:gap-3">
          {!servingsLocked && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 md:h-9 md:w-9"
              onClick={() => setServingMultiplier((m) => Math.max(0.5, m - 0.5))}
            >
              <Minus className="h-3 w-3 md:h-4 md:w-4" />
            </Button>
          )}
          <span className="text-xs md:text-sm font-medium text-muted-foreground min-w-[70px] md:min-w-[90px] text-center">
            {adjustedServings} servings
            {servingsLocked && servingMultiplier !== 1 && (
              <span className="block text-[10px] text-primary">{servingMultiplier}x</span>
            )}
          </span>
          {!servingsLocked && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 md:h-9 md:w-9"
              onClick={() => setServingMultiplier((m) => m + 0.5)}
            >
              <Plus className="h-3 w-3 md:h-4 md:w-4" />
            </Button>
          )}
        </div>

        <div className="flex items-center gap-2 md:gap-3">
          {hasImprovements && !suggestionsDismissed && (
            <Button
              variant="ghost"
              size="icon"
              className="relative h-8 w-8 md:h-10 md:w-10"
              onClick={() => setShowSuggestions(true)}
            >
              <Lightbulb className="h-4 w-4 md:h-5 md:w-5 text-primary" />
              <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-primary" />
            </Button>
          )}
          <span className="text-sm md:text-base font-medium text-muted-foreground">
            {currentStep + 1}/{steps.length}
          </span>
          <Button variant="ghost" size="icon" className="md:h-10 md:w-10" onClick={() => router.back()}>
            <X className="h-4 w-4 md:h-5 md:w-5" />
          </Button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-8 md:px-12 lg:px-16">
        {/* Step instruction */}
        <div className="max-w-2xl lg:max-w-3xl text-center">
          <div className="mb-6 inline-flex h-14 w-14 md:h-20 md:w-20 items-center justify-center rounded-2xl bg-primary text-2xl md:text-3xl font-bold text-primary-foreground shadow-lg">
            {currentStep + 1}
          </div>
          <p className="text-2xl font-medium leading-relaxed md:text-3xl lg:text-4xl">
            {step.instruction}
          </p>
        </div>

        {/* Timer */}
        {step.timerMinutes && (
          <div className="mt-8">
            <StepTimer
              minutes={step.timerMinutes}
              label={step.timerLabel || "Timer"}
            />
          </div>
        )}

        {/* Highlighted ingredients with scaled quantities */}
        {highlightedIngredients.length > 0 && (
          <div className="mt-8 flex flex-wrap justify-center gap-2 md:gap-3">
            {highlightedIngredients.map((ing) => (
              <Badge key={ing.id} variant="secondary" className="text-sm md:text-base py-1 px-3 md:py-1.5 md:px-4">
                {ing.quantity !== null && `${scaleQuantity(ing.quantity)} `}
                {ing.unit && `${ing.unit} `}
                {ing.name}
              </Badge>
            ))}
          </div>
        )}

        {/* Step note */}
        <div className="mt-8 w-full max-w-lg">
          {activeNoteStep === currentStep ? (
            <textarea
              autoFocus
              placeholder="Add a note for this step..."
              value={stepNotes[currentStep] || ""}
              onChange={(e) => setStepNote(currentStep, e.target.value)}
              onBlur={() => {
                if (!stepNotes[currentStep]?.trim()) setActiveNoteStep(null);
              }}
              rows={2}
              className="w-full resize-none rounded-xl border-2 border-primary/40 bg-card px-4 py-3 text-sm outline-none focus:border-primary"
            />
          ) : stepNotes[currentStep]?.trim() ? (
            <button
              onClick={() => setActiveNoteStep(currentStep)}
              className="w-full text-left rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3"
            >
              <div className="flex items-start gap-2">
                <StickyNote className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
                <span className="text-sm">{stepNotes[currentStep]}</span>
              </div>
            </button>
          ) : (
            <button
              onClick={() => setActiveNoteStep(currentStep)}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-muted px-4 py-3 text-sm font-medium text-muted-foreground hover:bg-muted/80 hover:text-foreground transition-colors"
            >
              <StickyNote className="h-4 w-4" />
              Add a note for this step
            </button>
          )}
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between px-6 py-4 md:px-12 md:py-6 lg:px-16">
        <Button
          variant="outline"
          size="lg"
          onClick={goPrev}
          disabled={isFirst}
          className="min-w-[120px] md:min-w-[160px] md:h-12 md:text-base rounded-xl"
        >
          <ArrowLeft className="mr-2 h-4 w-4 md:h-5 md:w-5" />
          Previous
        </Button>

        {isLast ? (
          <Button
            size="lg"
            onClick={() => setShowResults(true)}
            className="min-w-[120px] md:min-w-[160px] md:h-12 md:text-base rounded-xl"
          >
            <ChefHat className="mr-2 h-4 w-4 md:h-5 md:w-5" />
            Done!
          </Button>
        ) : (
          <Button
            size="lg"
            onClick={goNext}
            className="min-w-[120px] md:min-w-[160px] md:h-12 md:text-base rounded-xl"
          >
            Next
            <ArrowRight className="ml-2 h-4 w-4 md:h-5 md:w-5" />
          </Button>
        )}
      </div>

      {/* Suggestions overlay */}
      {showSuggestions && hasImprovements && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border-transparent bg-card shadow-2xl">
            <div className="flex items-center justify-between px-5 pt-5 pb-2">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10">
                  <Lightbulb className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold">Before You Start</h3>
                  <p className="text-xs text-muted-foreground">
                    Notes from past cooking sessions
                  </p>
                </div>
              </div>
            </div>
            <div className="px-5 py-3 max-h-[50vh] overflow-y-auto space-y-2.5">
              {unappliedImprovements.map((log) => (
                <div
                  key={log.id}
                  className="rounded-lg bg-muted/50 p-3 space-y-1"
                >
                  <p className="text-sm">{log.improvements}</p>
                  <p className="text-xs text-muted-foreground">
                    {log.cookedAt?.toDate?.()
                      ? log.cookedAt.toDate().toLocaleDateString()
                      : ""}
                    {log.notes && ` \u00B7 "${log.notes}"`}
                  </p>
                </div>
              ))}
            </div>
            <div className="flex gap-2 px-5 pb-5 pt-2">
              <Button
                className="flex-1 rounded-xl"
                onClick={() => setShowSuggestions(false)}
              >
                Got it, let&apos;s cook!
              </Button>
              <Button
                variant="outline"
                className="rounded-xl"
                onClick={() => {
                  setShowSuggestions(false);
                  setSuggestionsDismissed(true);
                }}
              >
                Ignore this session
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
