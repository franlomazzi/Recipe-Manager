import type { Recipe, CookLog } from "./recipe";

export interface ActiveTimer {
  id: string;
  recipeId: string;
  recipeTitle: string;
  stepIndex: number;
  label: string;
  totalSeconds: number;
  remainingSeconds: number;
  isRunning: boolean;
  isComplete: boolean;
}

export interface CookingSession {
  recipeId: string;
  recipe: Recipe;
  cookLogs: CookLog[];
  currentStep: number;
  servingMultiplier: number;
  servingsLocked: boolean;
  suggestionsDismissed: boolean;
  startedAt: number;
  stepNotes: Record<number, string>;
}

export interface CookingSessionContextValue {
  sessions: CookingSession[];
  activeSessionId: string | null;
  timers: ActiveTimer[];
  addSession: (recipe: Recipe, cookLogs: CookLog[], servingMultiplier?: number) => void;
  removeSession: (recipeId: string) => void;
  setActiveSession: (recipeId: string) => void;
  updateSession: (recipeId: string, updates: Partial<CookingSession>) => void;
  startTimer: (timer: Omit<ActiveTimer, "id" | "isRunning" | "isComplete">) => string;
  pauseTimer: (timerId: string) => void;
  resumeTimer: (timerId: string) => void;
  resetTimer: (timerId: string) => void;
  adjustTimer: (timerId: string, deltaSeconds: number) => void;
  removeTimer: (timerId: string) => void;
  setStepNote: (recipeId: string, stepIndex: number, note: string) => void;
  isAnyCooking: boolean;
  persistentAlarm: boolean;
  setPersistentAlarm: (value: boolean) => void;
  hasActiveAlarm: boolean;
  dismissAlarm: () => void;
}
