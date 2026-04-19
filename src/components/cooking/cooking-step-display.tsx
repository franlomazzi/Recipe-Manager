"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SessionStepTimer } from "./session-step-timer";
import { CookingResults } from "./cooking-results";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ArrowLeft,
  ArrowRight,
  ChefHat,
  ShoppingBasket,
  Lightbulb,
  Timer,
  Play,
  Pause,
  RotateCcw,
  StickyNote,
} from "lucide-react";
import { useCookingSession } from "@/lib/contexts/cooking-session-context";
import type { CookingSession } from "@/lib/types/cooking-session";
import { cn } from "@/lib/utils";

type ViewMode = "focus" | "split" | "grid" | "grid6" | "list";

function formatMMSS(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

interface InlineStepTimerProps {
  recipeId: string;
  recipeTitle: string;
  stepIndex: number;
  minutes: number;
  label: string;
}

function InlineStepTimer({
  recipeId,
  recipeTitle,
  stepIndex,
  minutes,
  label,
}: InlineStepTimerProps) {
  const { timers, startTimer, pauseTimer, resumeTimer, resetTimer, adjustTimer } =
    useCookingSession();

  const totalSeconds = minutes * 60;
  const timer = timers.find(
    (t) =>
      t.recipeId === recipeId &&
      t.stepIndex === stepIndex &&
      t.totalSeconds === totalSeconds
  );

  const remainingSeconds = timer?.remainingSeconds ?? totalSeconds;
  const isRunning = timer?.isRunning ?? false;
  const isComplete = timer?.isComplete ?? false;
  const hasStarted = timer !== undefined;

  function handleStartOrResume(e: React.MouseEvent) {
    e.stopPropagation();
    if (timer) {
      if (timer.isComplete) {
        resetTimer(timer.id);
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

  function handlePause(e: React.MouseEvent) {
    e.stopPropagation();
    if (timer) pauseTimer(timer.id);
  }

  function handleReset(e: React.MouseEvent) {
    e.stopPropagation();
    if (timer) resetTimer(timer.id);
  }

  return (
    <div
      className={cn(
        "mt-2 inline-flex items-center gap-1.5 rounded-full border px-1 py-1 pl-2.5",
        isComplete
          ? "border-success/40 bg-success/10 text-success"
          : isRunning
          ? "border-primary/40 bg-primary/10 text-primary"
          : "border-border bg-muted text-foreground"
      )}
    >
      <Timer className="h-3 w-3 shrink-0" />
      <span className="text-xs font-mono font-semibold tabular-nums">
        {isComplete ? "Done!" : hasStarted ? formatMMSS(remainingSeconds) : `${minutes} min`}
      </span>
      {label ? (
        <span className="text-xs text-muted-foreground truncate max-w-[80px]">
          · {label}
        </span>
      ) : null}
      {hasStarted && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            adjustTimer(timer!.id, -10);
          }}
          disabled={!isComplete && remainingSeconds <= 0}
          className="ml-1 flex h-6 shrink-0 items-center justify-center rounded-full bg-muted-foreground/10 text-muted-foreground hover:bg-muted-foreground/20 px-1.5 text-[10px] font-mono font-semibold disabled:opacity-40"
          aria-label="Subtract 10 seconds"
          title="−10s"
        >
          −10s
        </button>
      )}
      {hasStarted && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            adjustTimer(timer!.id, 10);
          }}
          className="flex h-6 shrink-0 items-center justify-center rounded-full bg-muted-foreground/10 text-muted-foreground hover:bg-muted-foreground/20 px-1.5 text-[10px] font-mono font-semibold"
          aria-label="Add 10 seconds"
          title="+10s"
        >
          +10s
        </button>
      )}
      {!isComplete && (
        <button
          onClick={isRunning ? handlePause : handleStartOrResume}
          className={cn(
            "ml-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-colors",
            isRunning
              ? "bg-primary text-primary-foreground hover:bg-primary/90"
              : "bg-primary text-primary-foreground hover:bg-primary/90"
          )}
          aria-label={isRunning ? "Pause timer" : "Start timer"}
          title={isRunning ? "Pause" : hasStarted && remainingSeconds < totalSeconds ? "Resume" : "Start"}
        >
          {isRunning ? (
            <Pause className="h-3 w-3" />
          ) : (
            <Play className="h-3 w-3 translate-x-[1px]" />
          )}
        </button>
      )}
      {hasStarted && (
        <button
          onClick={handleReset}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted-foreground/10 text-muted-foreground hover:bg-muted-foreground/20"
          aria-label="Reset timer"
          title="Reset"
        >
          <RotateCcw className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

interface CookingStepDisplayProps {
  session: CookingSession;
}

export function CookingStepDisplay({ session }: CookingStepDisplayProps) {
  const router = useRouter();
  const { updateSession, removeSession, setStepNote } = useCookingSession();
  const [showResults, setShowResults] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeNoteStep, setActiveNoteStep] = useState<number | null>(null);
  // Ingredient check state for the ingredients step (local, not persisted)
  const [checkedIngredients, setCheckedIngredients] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window === "undefined") return "focus";
    const saved = localStorage.getItem("cooking-view-mode") as ViewMode | null;
    return saved === "focus" ||
      saved === "split" ||
      saved === "grid" ||
      saved === "grid6" ||
      saved === "list"
      ? saved
      : "focus";
  });
  const touchStartX = useRef<number | null>(null);
  const currentCardRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("cooking-view-mode", viewMode);
    }
  }, [viewMode]);

  const { recipe, cookLogs, currentStep, servingMultiplier, suggestionsDismissed, stepNotes } = session;

  const unappliedImprovements = cookLogs.filter(
    (log) => log.improvements?.trim() && log.appliedToVersion === null
  );
  const hasImprovements = unappliedImprovements.length > 0;

  const steps = recipe.steps;
  // Virtual step 0 = ingredients, virtual steps 1..N map to steps[0..N-1]
  const totalVirtualSteps = steps.length; // "Step X of N" shows N real steps
  const isOnIngredientsStep = currentStep === 0;
  const isFirst = currentStep === 0;
  const isLast = currentStep === steps.length; // last real step = virtual index N
  const realStep = isOnIngredientsStep ? null : steps[currentStep - 1];
  const adjustedServings = recipe.servings * servingMultiplier;

  useEffect(() => {
    if (viewMode === "list" && currentCardRef.current) {
      currentCardRef.current.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [viewMode, currentStep]);

  // Auto-show suggestions on mount if there are unapplied improvements
  useEffect(() => {
    if (hasImprovements && !suggestionsDismissed) {
      setShowSuggestions(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipe.id]);

  const goNext = useCallback(() => {
    if (!isLast) {
      updateSession(recipe.id, { currentStep: currentStep + 1 });
    }
  }, [isLast, currentStep, recipe.id, updateSession]);

  const goPrev = useCallback(() => {
    if (!isFirst) {
      updateSession(recipe.id, { currentStep: currentStep - 1 });
    }
  }, [isFirst, currentStep, recipe.id, updateSession]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (showResults) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        goNext();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [goNext, goPrev, showResults]);

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
    return scaled % 1 === 0
      ? String(scaled)
      : scaled.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  }

  function toggleIngredient(id: string) {
    setCheckedIngredients((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Prefer explicit step-ingredient associations; fall back to text matching for older recipes
  const highlightedIngredients = realStep
    ? realStep.ingredients?.length
      ? realStep.ingredients
          .map((si) => {
            const ing = recipe.ingredients.find((i) => i.id === si.ingredientId);
            if (!ing) return null;
            return { ...ing, stepQuantity: si.quantity };
          })
          .filter(Boolean) as (typeof recipe.ingredients[number] & { stepQuantity: number | null })[]
      : recipe.ingredients
          .filter((ing) =>
            realStep.instruction?.toLowerCase().includes(ing.name.toLowerCase())
          )
          .map((ing) => ({ ...ing, stepQuantity: null }))
    : [];

  const progress = steps.length > 0
    ? (Math.max(0, currentStep - 1) / steps.length) * 100
    : 0;

  if (showResults) {
    return (
      <CookingResults
        recipe={recipe}
        servingsCooked={adjustedServings}
        stepNotes={stepNotes}
        onClose={() => {
          removeSession(recipe.id);
          router.push("/recipes");
        }}
      />
    );
  }

  return (
    <div
      className="flex flex-1 flex-col"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Step indicator row */}
      <div className="flex items-center justify-between px-4 py-3 md:px-6">
        <div className="text-sm text-muted-foreground">
          <span className="font-medium">{adjustedServings}</span> servings
        </div>

        {!isOnIngredientsStep && (
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline text-xs font-medium text-muted-foreground">
              Steps per view
            </span>
            <div className="inline-flex rounded-lg bg-muted p-0.5">
              {(["focus", "split", "grid", "grid6", "list"] as const).map((m) => {
                const label =
                  m === "focus"
                    ? "1"
                    : m === "split"
                    ? "2"
                    : m === "grid"
                    ? "4"
                    : m === "grid6"
                    ? "6"
                    : "All";
                return (
                  <button
                    key={m}
                    onClick={() => setViewMode(m)}
                    className={cn(
                      "px-2.5 py-1 text-xs font-medium rounded-md transition-colors min-w-[32px]",
                      viewMode === m
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                    aria-label={`Show ${label} step${label === "1" ? "" : "s"} per view`}
                    title={`Show ${label} step${label === "1" ? "" : "s"} per view`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

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
            {isOnIngredientsStep
              ? `Ingredients · ${steps.length} steps`
              : `${currentStep}/${steps.length}`}
          </span>
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-6 md:px-12 lg:px-16 overflow-y-auto">
        {isOnIngredientsStep ? (
          /* ── Ingredients step ── */
          <div className="w-full max-w-lg">
            <div className="mb-6 flex flex-col items-center text-center">
              <div className="mb-4 flex h-14 w-14 md:h-20 md:w-20 items-center justify-center rounded-2xl bg-primary/10 shadow-lg">
                <ShoppingBasket className="h-7 w-7 md:h-10 md:w-10 text-primary" />
              </div>
              <h2 className="text-2xl font-bold md:text-3xl">Get your ingredients</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {adjustedServings} servings · {recipe.ingredients.length} items
              </p>
            </div>

            <ul className="space-y-2.5">
              {recipe.ingredients.map((ing) => {
                const checked = checkedIngredients.has(ing.id);
                return (
                  <li
                    key={ing.id}
                    onClick={() => toggleIngredient(ing.id)}
                    className={`flex cursor-pointer items-start gap-3 rounded-xl px-4 py-3 transition-colors ${
                      checked ? "bg-muted/30 opacity-60" : "bg-card card-elevated"
                    }`}
                  >
                    <Checkbox
                      checked={checked}
                      className="mt-0.5 shrink-0"
                      onClick={(e) => e.stopPropagation()}
                      onCheckedChange={() => toggleIngredient(ing.id)}
                    />
                    <span className={`text-sm leading-snug md:text-base ${checked ? "line-through" : ""}`}>
                      {ing.quantity !== null && (
                        <span className="font-semibold">{scaleQuantity(ing.quantity)} </span>
                      )}
                      {ing.unit && (
                        <span className="text-muted-foreground">{ing.unit} </span>
                      )}
                      {ing.name}
                      {ing.note && (
                        <span className="text-muted-foreground italic"> — {ing.note}</span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : viewMode === "focus" ? (
          /* ── Focus: single large step ── */
          <div className="max-w-2xl lg:max-w-3xl text-center">
            <div className="mb-6 inline-flex h-14 w-14 md:h-20 md:w-20 items-center justify-center rounded-2xl bg-primary text-2xl md:text-3xl font-bold text-primary-foreground shadow-lg">
              {currentStep}
            </div>
            <p className="text-2xl font-medium leading-relaxed md:text-3xl lg:text-4xl">
              {realStep!.instruction}
            </p>

            {realStep!.timerMinutes && (
              <div className="mt-8">
                <SessionStepTimer
                  recipeId={recipe.id}
                  recipeTitle={recipe.title}
                  stepIndex={currentStep}
                  minutes={realStep!.timerMinutes}
                  label={realStep!.timerLabel || "Timer"}
                />
              </div>
            )}

            {highlightedIngredients.length > 0 && (
              <div className="mt-8 flex flex-wrap justify-center gap-2 md:gap-3">
                {highlightedIngredients.map((ing) => (
                  <Badge
                    key={ing.id}
                    variant="secondary"
                    className="text-sm md:text-base py-1 px-3 md:py-1.5 md:px-4"
                  >
                    {ing.stepQuantity !== null
                      ? `${scaleQuantity(ing.stepQuantity)} `
                      : ing.quantity !== null
                      ? `${scaleQuantity(ing.quantity)} `
                      : ""}
                    {ing.unit && `${ing.unit} `}
                    {ing.name}
                  </Badge>
                ))}
              </div>
            )}

            {/* Step note — focus mode */}
            <div className="mt-8 w-full max-w-lg">
              {activeNoteStep === currentStep ? (
                <textarea
                  autoFocus
                  placeholder="Add a note for this step..."
                  value={stepNotes[currentStep] || ""}
                  onChange={(e) => setStepNote(recipe.id, currentStep, e.target.value)}
                  onBlur={() => {
                    if (!stepNotes[currentStep]?.trim()) setActiveNoteStep(null);
                  }}
                  rows={2}
                  className="w-full resize-none rounded-xl border border-border bg-card px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/40"
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
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors"
                >
                  <StickyNote className="h-4 w-4" />
                  Add a note for this step
                </button>
              )}
            </div>
          </div>
        ) : (
          /* ── Multi-step views (split / grid / list) ── */
          (() => {
            let windowStart = 0;
            let windowEnd = steps.length; // exclusive
            if (viewMode === "split") {
              windowStart = currentStep - 1;
              windowEnd = Math.min(steps.length, currentStep + 1);
            } else if (viewMode === "grid") {
              windowStart = Math.max(
                0,
                Math.min(Math.max(0, steps.length - 4), currentStep - 2)
              );
              windowEnd = Math.min(steps.length, windowStart + 4);
            } else if (viewMode === "grid6") {
              windowStart = Math.max(
                0,
                Math.min(Math.max(0, steps.length - 6), currentStep - 3)
              );
              windowEnd = Math.min(steps.length, windowStart + 6);
            }
            const visible = steps.slice(windowStart, windowEnd);
            const textSize =
              viewMode === "split"
                ? "text-lg md:text-xl"
                : viewMode === "grid6"
                ? "text-sm md:text-base"
                : "text-base md:text-lg";
            const containerClasses =
              viewMode === "list"
                ? "w-full max-w-3xl flex flex-col gap-3"
                : viewMode === "grid6"
                ? "w-full max-w-6xl grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
                : "w-full max-w-5xl grid grid-cols-1 sm:grid-cols-2 gap-4";

            return (
              <div className={containerClasses}>
                {visible.map((step, idx) => {
                  const virtualIndex = windowStart + idx + 1;
                  const isCurrent = virtualIndex === currentStep;
                  return (
                    <div
                      key={step.id}
                      ref={isCurrent ? currentCardRef : null}
                      onClick={() =>
                        updateSession(recipe.id, { currentStep: virtualIndex })
                      }
                      className={cn(
                        "cursor-pointer rounded-2xl p-4 md:p-5 transition-all text-left",
                        isCurrent
                          ? "bg-card ring-2 ring-primary shadow-lg"
                          : "bg-card/60 card-elevated hover:bg-card"
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={cn(
                            "flex h-9 w-9 md:h-10 md:w-10 shrink-0 items-center justify-center rounded-xl font-bold",
                            isCurrent
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-muted-foreground"
                          )}
                        >
                          {virtualIndex}
                        </div>
                        <div className="flex-1 min-w-0">
                          {/* Note icon button — always visible in card header */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveNoteStep(activeNoteStep === virtualIndex ? null : virtualIndex);
                            }}
                            className={cn(
                              "float-right ml-2 flex h-7 w-7 items-center justify-center rounded-lg transition-colors",
                              stepNotes[virtualIndex]?.trim()
                                ? "bg-amber-500/15 text-amber-600"
                                : "text-muted-foreground/50 hover:bg-muted hover:text-foreground"
                            )}
                            title="Add step note"
                          >
                            <StickyNote className="h-3.5 w-3.5" />
                          </button>
                          <p
                            className={cn(
                              "font-medium leading-relaxed",
                              textSize
                            )}
                          >
                            {step.instruction}
                          </p>
                          {step.timerMinutes && (
                            <InlineStepTimer
                              recipeId={recipe.id}
                              recipeTitle={recipe.title}
                              stepIndex={virtualIndex}
                              minutes={step.timerMinutes}
                              label={step.timerLabel || "Timer"}
                            />
                          )}
                          {(() => {
                            const stepIngs = step.ingredients?.length
                              ? step.ingredients
                                  .map((si) => {
                                    const ing = recipe.ingredients.find((i) => i.id === si.ingredientId);
                                    if (!ing) return null;
                                    return { ...ing, stepQuantity: si.quantity };
                                  })
                                  .filter(Boolean) as (typeof recipe.ingredients[number] & { stepQuantity: number | null })[]
                              : recipe.ingredients.filter((ing) =>
                                  step.instruction?.toLowerCase().includes(ing.name.toLowerCase())
                                ).map((ing) => ({ ...ing, stepQuantity: null }));
                            if (stepIngs.length === 0) return null;
                            return (
                              <div className="mt-2 flex flex-wrap gap-1">
                                {stepIngs.map((ing) => (
                                  <Badge
                                    key={ing.id}
                                    variant="secondary"
                                    className="text-[11px] py-0.5 px-2"
                                  >
                                    {ing.stepQuantity !== null
                                      ? `${scaleQuantity(ing.stepQuantity)} `
                                      : ing.quantity !== null
                                      ? `${scaleQuantity(ing.quantity)} `
                                      : ""}
                                    {ing.unit && `${ing.unit} `}
                                    {ing.name}
                                  </Badge>
                                ))}
                              </div>
                            );
                          })()}

                          {/* Step note — inline editor */}
                          {activeNoteStep === virtualIndex && (
                            <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                              <textarea
                                autoFocus
                                placeholder="Add a note for this step..."
                                value={stepNotes[virtualIndex] || ""}
                                onChange={(e) =>
                                  setStepNote(recipe.id, virtualIndex, e.target.value)
                                }
                                onBlur={() => {
                                  if (!stepNotes[virtualIndex]?.trim())
                                    setActiveNoteStep(null);
                                }}
                                rows={2}
                                className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-primary/40"
                              />
                            </div>
                          )}
                          {activeNoteStep !== virtualIndex && stepNotes[virtualIndex]?.trim() && (
                            <div
                              className="mt-2 flex items-start gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 cursor-pointer"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveNoteStep(virtualIndex);
                              }}
                            >
                              <StickyNote className="h-3 w-3 shrink-0 mt-0.5 text-amber-600" />
                              <span className="text-[11px]">{stepNotes[virtualIndex]}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()
        )}
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
          {isOnIngredientsStep ? "Back" : "Previous"}
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
            {isOnIngredientsStep ? "Start cooking" : "Next"}
            <ArrowRight className="ml-2 h-4 w-4 md:h-5 md:w-5" />
          </Button>
        )}
      </div>

      {/* Progress bar — only shows once cooking starts */}
      <div className="h-1 w-full bg-muted">
        <div
          className="h-full bg-primary transition-all duration-300"
          style={{ width: `${isOnIngredientsStep ? 0 : progress}%` }}
        />
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
                    {log.notes && ` · "${log.notes}"`}
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
                  updateSession(recipe.id, { suggestionsDismissed: true });
                }}
              >
                Ignore
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
