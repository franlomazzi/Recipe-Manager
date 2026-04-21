"use client";

import type { ActiveTimer, CookingSession } from "@/lib/types/cooking-session";
import { parseDurationSeconds } from "./number-words";

export interface CommandContext {
  activeSession: CookingSession | null;
  sessions: CookingSession[];
  timers: ActiveTimer[];
  // Session actions (already on CookingSessionContextValue)
  updateSession: (recipeId: string, updates: Partial<CookingSession>) => void;
  startTimer: (
    t: Omit<ActiveTimer, "id" | "isRunning" | "isComplete">
  ) => string;
  pauseTimer: (id: string) => void;
  resumeTimer: (id: string) => void;
  resetTimer: (id: string) => void;
  adjustTimer: (id: string, deltaSeconds: number) => void;
  dismissAlarm: () => void;
  // Voice-layer actions
  speak: (text: string) => void;
  /**
   * Speak longer content with the higher-quality AI voice. Falls back to
   * `speak` if the AI path fails. Use for step instructions / explanations,
   * not for short confirmations (those are snappier on local browser TTS).
   */
  speakRich: (text: string, opts?: { style?: string }) => void;
  toast: (text: string) => void;
  enterDictation: () => void;
}

export interface CommandMatch {
  id: string;
  remainder: string;
}

export interface CommandDef {
  id: string;
  patterns: RegExp[];
  handler: (ctx: CommandContext, match: CommandMatch) => void;
}

/**
 * Strip the wake word prefix from a transcript. Returns null if the utterance
 * did not begin with a recognized wake word.
 *
 * Recognized wake words: "chef", "hey chef", "okay chef", "recipe" (secondary).
 * We also tolerate common STT confusions: "sheaf", "cheff".
 */
const WAKE_WORDS = [
  "chef",
  "chefs",
  "sheaf",
  "cheff",
  "hey chef",
  "ok chef",
  "okay chef",
  "recipe",
];

export function stripWakeWord(transcript: string): string | null {
  const normalized = transcript.trim().toLowerCase().replace(/[.,!?]/g, "");
  for (const w of WAKE_WORDS) {
    if (normalized === w) return "";
    if (normalized.startsWith(w + " ") || normalized.startsWith(w + ",")) {
      return normalized.slice(w.length).replace(/^[\s,]+/, "");
    }
  }
  return null;
}

/**
 * Helper: find the timer that belongs to the currently-active step, if any.
 * Current step numbering: 0 = ingredients, 1..N = real steps.
 */
function findCurrentStepTimer(ctx: CommandContext): ActiveTimer | null {
  const s = ctx.activeSession;
  if (!s) return null;
  return (
    ctx.timers.find(
      (t) => t.recipeId === s.recipeId && t.stepIndex === s.currentStep
    ) ?? null
  );
}

function currentStepText(session: CookingSession): string {
  if (session.currentStep === 0) {
    return `Ingredients — ${session.recipe.ingredients.length} items for ${session.recipe.servings} servings.`;
  }
  const step = session.recipe.steps[session.currentStep - 1];
  return step?.instruction ?? "";
}

function formatDurationSpeech(seconds: number): string {
  if (seconds <= 0) return "zero seconds";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s} second${s === 1 ? "" : "s"}`;
  if (s === 0) return `${m} minute${m === 1 ? "" : "s"}`;
  return `${m} minute${m === 1 ? "" : "s"} and ${s} second${s === 1 ? "" : "s"}`;
}

export const COMMANDS: CommandDef[] = [
  // ── Navigation ─────────────────────────────────────────────────────────
  {
    id: "next",
    patterns: [
      /^(?:go\s+)?(?:to\s+the\s+)?next(?:\s+step)?$/,
      /^continue$/,
      /^forward$/,
      /^move on$/,
      /^skip$/,
    ],
    handler: (ctx) => {
      const s = ctx.activeSession;
      if (!s) return;
      const isLast = s.currentStep >= s.recipe.steps.length;
      if (isLast) {
        ctx.speak("You're on the last step.");
        return;
      }
      ctx.updateSession(s.recipeId, { currentStep: s.currentStep + 1 });
      const next = s.currentStep + 1;
      ctx.speak(`Step ${next}.`);
    },
  },
  {
    id: "prev",
    patterns: [
      /^(?:go\s+)?back$/,
      /^previous(?:\s+step)?$/,
      /^go\s+back$/,
      /^last\s+step$/,
    ],
    handler: (ctx) => {
      const s = ctx.activeSession;
      if (!s) return;
      if (s.currentStep <= 0) {
        ctx.speak("You're at the start.");
        return;
      }
      ctx.updateSession(s.recipeId, { currentStep: s.currentStep - 1 });
      const to = s.currentStep - 1;
      ctx.speak(to === 0 ? "Ingredients." : `Step ${to}.`);
    },
  },
  {
    id: "ingredients",
    patterns: [
      /^(?:go\s+to\s+)?ingredients$/,
      /^show\s+ingredients$/,
      /^back\s+to\s+ingredients$/,
    ],
    handler: (ctx) => {
      const s = ctx.activeSession;
      if (!s) return;
      ctx.updateSession(s.recipeId, { currentStep: 0 });
      ctx.speak("Ingredients.");
    },
  },
  {
    id: "read-step",
    patterns: [
      /^(?:repeat|read)(?:\s+(?:the\s+)?step)?$/,
      /^read\s+(?:it|that)(?:\s+again)?$/,
      /^what('?s| is)\s+(?:the\s+)?(?:current\s+)?step$/,
      /^say\s+(?:it\s+)?again$/,
    ],
    handler: (ctx) => {
      const s = ctx.activeSession;
      if (!s) return;
      const text = currentStepText(s);
      if (!text) return;
      // Step instructions get the higher-quality AI voice — this is the
      // content the user actually wants to listen to, so it's worth the
      // network round-trip.
      ctx.speakRich(text);
    },
  },

  // ── Timers ─────────────────────────────────────────────────────────────
  {
    id: "start-timer",
    patterns: [
      /^start(?:\s+(?:the\s+|a\s+))?timer$/,
      /^start$/,
      /^begin\s+timer$/,
    ],
    handler: (ctx) => {
      const s = ctx.activeSession;
      if (!s) return;
      if (s.currentStep === 0) {
        ctx.speak("No timer on the ingredients step.");
        return;
      }
      const step = s.recipe.steps[s.currentStep - 1];
      const existing = findCurrentStepTimer(ctx);
      if (existing) {
        if (existing.isComplete) {
          ctx.resetTimer(existing.id);
          ctx.resumeTimer(existing.id);
          ctx.speak("Timer restarted.");
          return;
        }
        if (!existing.isRunning) {
          ctx.resumeTimer(existing.id);
          ctx.speak("Timer resumed.");
          return;
        }
        ctx.speak("Timer already running.");
        return;
      }
      if (!step?.timerMinutes) {
        ctx.speak("This step has no timer set. Say, start a five minute timer, for example.");
        return;
      }
      const total = step.timerMinutes * 60;
      ctx.startTimer({
        recipeId: s.recipeId,
        recipeTitle: s.recipe.title,
        stepIndex: s.currentStep,
        label: step.timerLabel || "Timer",
        totalSeconds: total,
        remainingSeconds: total,
      });
      ctx.speak(`Timer started. ${formatDurationSpeech(total)}.`);
    },
  },
  {
    id: "start-timer-duration",
    patterns: [
      /^start\s+(?:a\s+|the\s+)?(.+?)\s+(?:timer|countdown)$/,
      /^set\s+(?:a\s+|the\s+)?timer\s+(?:for\s+)?(.+)$/,
      /^timer\s+(?:for\s+)?(.+)$/,
    ],
    handler: (ctx, m) => {
      const s = ctx.activeSession;
      if (!s) return;
      const seconds = parseDurationSeconds(m.remainder);
      if (!seconds || seconds <= 0) {
        ctx.speak("I didn't catch the duration.");
        return;
      }
      const existing = findCurrentStepTimer(ctx);
      if (existing) ctx.resetTimer(existing.id);
      ctx.startTimer({
        recipeId: s.recipeId,
        recipeTitle: s.recipe.title,
        stepIndex: s.currentStep,
        label: s.recipe.steps[s.currentStep - 1]?.timerLabel || "Timer",
        totalSeconds: seconds,
        remainingSeconds: seconds,
      });
      ctx.speak(`Timer started. ${formatDurationSpeech(seconds)}.`);
    },
  },
  {
    id: "pause-timer",
    patterns: [/^pause(?:\s+(?:the\s+)?timer)?$/, /^stop(?:\s+(?:the\s+)?timer)?$/, /^hold on$/],
    handler: (ctx) => {
      const t = findCurrentStepTimer(ctx);
      if (!t) {
        ctx.speak("No timer to pause.");
        return;
      }
      if (!t.isRunning) {
        ctx.speak("Timer is already paused.");
        return;
      }
      ctx.pauseTimer(t.id);
      ctx.speak("Paused.");
    },
  },
  {
    id: "resume-timer",
    patterns: [/^resume(?:\s+(?:the\s+)?timer)?$/, /^unpause$/, /^keep going$/],
    handler: (ctx) => {
      const t = findCurrentStepTimer(ctx);
      if (!t) {
        ctx.speak("No timer to resume.");
        return;
      }
      if (t.isRunning) {
        ctx.speak("Already running.");
        return;
      }
      ctx.resumeTimer(t.id);
      ctx.speak("Resumed.");
    },
  },
  {
    id: "reset-timer",
    patterns: [/^reset(?:\s+(?:the\s+)?timer)?$/, /^restart\s+(?:the\s+)?timer$/],
    handler: (ctx) => {
      const t = findCurrentStepTimer(ctx);
      if (!t) {
        ctx.speak("No timer to reset.");
        return;
      }
      ctx.resetTimer(t.id);
      ctx.speak("Timer reset.");
    },
  },
  {
    id: "add-time",
    patterns: [
      /^add\s+(.+)$/,
      /^plus\s+(.+)$/,
      /^extend\s+(?:the\s+)?timer\s+(?:by\s+)?(.+)$/,
    ],
    handler: (ctx, m) => {
      const t = findCurrentStepTimer(ctx);
      if (!t) {
        ctx.speak("No timer to adjust.");
        return;
      }
      const seconds = parseDurationSeconds(m.remainder);
      if (!seconds || seconds <= 0) {
        ctx.speak("I didn't catch how much.");
        return;
      }
      ctx.adjustTimer(t.id, seconds);
      ctx.speak(`Added ${formatDurationSpeech(seconds)}.`);
    },
  },
  {
    id: "subtract-time",
    patterns: [
      /^(?:subtract|remove|cut)\s+(.+)$/,
      /^minus\s+(.+)$/,
      /^take\s+(?:off|away)\s+(.+)$/,
    ],
    handler: (ctx, m) => {
      const t = findCurrentStepTimer(ctx);
      if (!t) {
        ctx.speak("No timer to adjust.");
        return;
      }
      const seconds = parseDurationSeconds(m.remainder);
      if (!seconds || seconds <= 0) {
        ctx.speak("I didn't catch how much.");
        return;
      }
      ctx.adjustTimer(t.id, -seconds);
      ctx.speak(`Removed ${formatDurationSpeech(seconds)}.`);
    },
  },
  {
    id: "time-left",
    patterns: [
      /^how\s+(?:much\s+)?(?:long|time)(?:\s+(?:is\s+)?left)?$/,
      /^time\s+(?:left|remaining)$/,
      /^how\s+long\s+(?:do\s+i\s+have|(?:is|'s)\s+left)$/,
    ],
    handler: (ctx) => {
      const t = findCurrentStepTimer(ctx);
      if (!t) {
        ctx.speak("No active timer.");
        return;
      }
      if (t.isComplete) {
        ctx.speak("Timer is done.");
        return;
      }
      ctx.speak(`${formatDurationSpeech(t.remainingSeconds)} left.`);
    },
  },
  {
    id: "dismiss-alarm",
    patterns: [
      /^(?:dismiss|stop|silence|mute)(?:\s+(?:the\s+)?alarm)?$/,
      /^(?:ok|okay|alright|got it|thanks)$/,
    ],
    handler: (ctx) => {
      ctx.dismissAlarm();
    },
  },
  // ── Notes ──────────────────────────────────────────────────────────────
  {
    id: "add-note",
    patterns: [
      /^(?:add|take|make|write|record|start)(?:\s+(?:a|the))?\s+note$/,
      /^note\s+this$/,
      /^dictate\s+(?:a\s+)?note$/,
    ],
    handler: (ctx) => {
      if (!ctx.activeSession) {
        ctx.speak("No active recipe.");
        return;
      }
      ctx.enterDictation();
    },
  },

  // ── Help ───────────────────────────────────────────────────────────────
  {
    id: "help",
    patterns: [/^help$/, /^what can (?:i|you) say$/, /^commands$/],
    handler: (ctx) => {
      ctx.speak(
        "Try: next step, previous, start timer, pause, add three minutes, how long left, read step, ingredients."
      );
    },
  },
];

export interface MatchResult {
  command: CommandDef;
  remainder: string;
}

export type DictationDirective = "save" | "cancel" | "scratch" | "none";

const SAVE_PATTERNS: RegExp[] = [
  /^(?:save|end|finish|commit)(?:\s+(?:the\s+)?note)?$/,
  /^(?:i'?m\s+)?done$/,
  /^that'?s?\s+it$/,
  /^stop\s+(?:the\s+)?(?:note|dictation)$/,
];
const CANCEL_PATTERNS: RegExp[] = [
  /^cancel(?:\s+(?:the\s+)?note)?$/,
  /^discard(?:\s+(?:the\s+)?note)?$/,
  /^nevermind$/,
  /^never\s+mind$/,
  /^forget\s+(?:that|it)$/,
];
const SCRATCH_PATTERNS: RegExp[] = [
  /^scratch\s+that$/,
  /^clear\s+(?:the\s+)?note$/,
  /^start\s+over$/,
  /^erase\s+that$/,
];

/**
 * Classify a dictation utterance into a control directive or "none" (= append).
 * Accepts an optional leading wake word so users can still say "Chef, save note".
 */
export function classifyDictation(raw: string): DictationDirective {
  let text = raw.trim().toLowerCase().replace(/[.,!?]$/, "").trim();
  const stripped = stripWakeWord(text);
  if (stripped !== null) text = stripped;
  for (const p of SAVE_PATTERNS) if (p.test(text)) return "save";
  for (const p of CANCEL_PATTERNS) if (p.test(text)) return "cancel";
  for (const p of SCRATCH_PATTERNS) if (p.test(text)) return "scratch";
  return "none";
}

export function matchCommand(stripped: string): MatchResult | null {
  const normalized = stripped.trim().toLowerCase();
  if (!normalized) return null;
  for (const cmd of COMMANDS) {
    for (const p of cmd.patterns) {
      const m = p.exec(normalized);
      if (m) {
        return { command: cmd, remainder: m[1] ?? "" };
      }
    }
  }
  return null;
}
