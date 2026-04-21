"use client";

import {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useCallback,
  useRef,
  useState,
} from "react";
import type { Recipe, CookLog } from "@/lib/types/recipe";
import type {
  ActiveTimer,
  CookingSession,
  CookingSessionContextValue,
} from "@/lib/types/cooking-session";

type Action =
  | { type: "ADD_SESSION"; recipe: Recipe; cookLogs: CookLog[]; servingMultiplier: number }
  | { type: "REMOVE_SESSION"; recipeId: string }
  | { type: "SET_ACTIVE"; recipeId: string }
  | { type: "UPDATE_SESSION"; recipeId: string; updates: Partial<CookingSession> }
  | { type: "SET_STEP_NOTE"; recipeId: string; stepIndex: number; note: string }
  | { type: "APPEND_STEP_NOTE"; recipeId: string; stepIndex: number; text: string }
  | { type: "START_TIMER"; timer: ActiveTimer }
  | { type: "PAUSE_TIMER"; timerId: string }
  | { type: "RESUME_TIMER"; timerId: string }
  | { type: "RESET_TIMER"; timerId: string }
  | { type: "REMOVE_TIMER"; timerId: string }
  | { type: "ADJUST_TIMER"; timerId: string; deltaSeconds: number }
  | { type: "TICK_TIMERS"; completedIds: string[] }
  | { type: "ACKNOWLEDGE_ALL_ALARMS" }
  | { type: "ACKNOWLEDGE_TIMER"; timerId: string };

interface State {
  sessions: CookingSession[];
  activeSessionId: string | null;
  timers: ActiveTimer[];
  acknowledgedIds: string[];
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "ADD_SESSION": {
      if (state.sessions.some((s) => s.recipeId === action.recipe.id)) {
        return { ...state, activeSessionId: action.recipe.id };
      }
      return {
        ...state,
        sessions: [
          ...state.sessions,
          {
            recipeId: action.recipe.id,
            recipe: action.recipe,
            cookLogs: action.cookLogs,
            currentStep: 0,
            servingMultiplier: action.servingMultiplier,
            servingsLocked: true,
            suggestionsDismissed: false,
            startedAt: Date.now(),
            stepNotes: {},
          },
        ],
        activeSessionId: action.recipe.id,
      };
    }
    case "REMOVE_SESSION": {
      const remaining = state.sessions.filter(
        (s) => s.recipeId !== action.recipeId
      );
      const timersLeft = state.timers.filter(
        (t) => t.recipeId !== action.recipeId
      );
      const removedTimerIds = state.timers
        .filter((t) => t.recipeId === action.recipeId)
        .map((t) => t.id);
      return {
        ...state,
        sessions: remaining,
        timers: timersLeft,
        acknowledgedIds: state.acknowledgedIds.filter(
          (id) => !removedTimerIds.includes(id)
        ),
        activeSessionId:
          state.activeSessionId === action.recipeId
            ? remaining[0]?.recipeId ?? null
            : state.activeSessionId,
      };
    }
    case "SET_ACTIVE":
      return { ...state, activeSessionId: action.recipeId };
    case "UPDATE_SESSION":
      return {
        ...state,
        sessions: state.sessions.map((s) =>
          s.recipeId === action.recipeId ? { ...s, ...action.updates } : s
        ),
      };
    case "SET_STEP_NOTE":
      return {
        ...state,
        sessions: state.sessions.map((s) =>
          s.recipeId === action.recipeId
            ? { ...s, stepNotes: { ...s.stepNotes, [action.stepIndex]: action.note } }
            : s
        ),
      };
    case "APPEND_STEP_NOTE": {
      const text = action.text.trim();
      if (!text) return state;
      const now = new Date();
      const hh = now.getHours().toString().padStart(2, "0");
      const mm = now.getMinutes().toString().padStart(2, "0");
      const line = `[${hh}:${mm}] ${text}`;
      return {
        ...state,
        sessions: state.sessions.map((s) => {
          if (s.recipeId !== action.recipeId) return s;
          const existing = s.stepNotes[action.stepIndex] ?? "";
          const next = existing ? `${existing}\n${line}` : line;
          return { ...s, stepNotes: { ...s.stepNotes, [action.stepIndex]: next } };
        }),
      };
    }
    case "START_TIMER":
      return { ...state, timers: [...state.timers, action.timer] };
    case "PAUSE_TIMER":
      return {
        ...state,
        timers: state.timers.map((t) =>
          t.id === action.timerId ? { ...t, isRunning: false } : t
        ),
      };
    case "RESUME_TIMER":
      return {
        ...state,
        timers: state.timers.map((t) =>
          t.id === action.timerId ? { ...t, isRunning: true } : t
        ),
      };
    case "RESET_TIMER":
      return {
        ...state,
        timers: state.timers.map((t) =>
          t.id === action.timerId
            ? {
                ...t,
                remainingSeconds: t.totalSeconds,
                isRunning: false,
                isComplete: false,
              }
            : t
        ),
        acknowledgedIds: state.acknowledgedIds.filter(
          (id) => id !== action.timerId
        ),
      };
    case "REMOVE_TIMER":
      return {
        ...state,
        timers: state.timers.filter((t) => t.id !== action.timerId),
        acknowledgedIds: state.acknowledgedIds.filter(
          (id) => id !== action.timerId
        ),
      };
    case "ADJUST_TIMER": {
      return {
        ...state,
        timers: state.timers.map((t) => {
          if (t.id !== action.timerId) return t;
          const newRemaining = Math.max(0, t.remainingSeconds + action.deltaSeconds);
          const newTotal = Math.max(1, t.totalSeconds + action.deltaSeconds);
          const wasComplete = t.isComplete;
          const nowComplete = newRemaining === 0;
          return {
            ...t,
            remainingSeconds: newRemaining,
            totalSeconds: newTotal,
            isComplete: nowComplete,
            // If adding time to a completed timer, un-complete and start running
            isRunning: wasComplete && !nowComplete ? true : t.isRunning,
          };
        }),
        // Clear acknowledgment if the timer is no longer complete
        acknowledgedIds: state.acknowledgedIds.filter((id) => {
          if (id !== action.timerId) return true;
          const t = state.timers.find((x) => x.id === action.timerId);
          if (!t) return true;
          const newRemaining = Math.max(0, t.remainingSeconds + action.deltaSeconds);
          return newRemaining === 0;
        }),
      };
    }
    case "ACKNOWLEDGE_ALL_ALARMS": {
      const completedIds = state.timers
        .filter((t) => t.isComplete)
        .map((t) => t.id);
      return {
        ...state,
        acknowledgedIds: Array.from(
          new Set([...state.acknowledgedIds, ...completedIds])
        ),
      };
    }
    case "ACKNOWLEDGE_TIMER":
      return {
        ...state,
        acknowledgedIds: state.acknowledgedIds.includes(action.timerId)
          ? state.acknowledgedIds
          : [...state.acknowledgedIds, action.timerId],
      };
    case "TICK_TIMERS":
      return {
        ...state,
        timers: state.timers.map((t) => {
          if (!t.isRunning || t.isComplete) return t;
          const next = t.remainingSeconds - 1;
          if (next <= 0) {
            return {
              ...t,
              remainingSeconds: 0,
              isRunning: false,
              isComplete: true,
            };
          }
          return { ...t, remainingSeconds: next };
        }),
      };
    default:
      return state;
  }
}

const CookingSessionContext = createContext<CookingSessionContextValue | null>(
  null
);

export function CookingSessionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [state, dispatch] = useReducer(reducer, {
    sessions: [],
    activeSessionId: null,
    timers: [],
    acknowledgedIds: [],
  });

  const [persistentAlarm, setPersistentAlarmState] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const saved = localStorage.getItem("cooking-persistent-alarm");
    return saved === null ? true : saved === "true";
  });

  const setPersistentAlarm = useCallback((value: boolean) => {
    setPersistentAlarmState(value);
    if (typeof window !== "undefined") {
      localStorage.setItem("cooking-persistent-alarm", String(value));
    }
  }, []);

  const audioContextRef = useRef<AudioContext | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const prevTimersRef = useRef<ActiveTimer[]>([]);

  // Android-style notification chime: two marimba-like notes with decay envelope
  const playAlarm = useCallback(() => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext();
      }
      const ctx = audioContextRef.current;
      if (ctx.state === "suspended") ctx.resume();
      const now = ctx.currentTime;

      // Two descending notes (E6 → C6), triangle wave with fast attack + exponential decay
      const notes = [
        { freq: 1318.51, start: 0, duration: 0.35 }, // E6
        { freq: 1046.5, start: 0.18, duration: 0.45 }, // C6
      ];

      for (const note of notes) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(note.freq, now + note.start);

        // Envelope: quick attack, exponential decay (marimba-like)
        gain.gain.setValueAtTime(0, now + note.start);
        gain.gain.linearRampToValueAtTime(0.35, now + note.start + 0.01);
        gain.gain.exponentialRampToValueAtTime(
          0.0001,
          now + note.start + note.duration
        );

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + note.start);
        osc.stop(now + note.start + note.duration + 0.05);
      }
    } catch {
      // Audio not available
    }
  }, []);

  // Single interval ticks all running timers
  const hasRunning = state.timers.some((t) => t.isRunning);
  useEffect(() => {
    if (!hasRunning) return;
    const interval = setInterval(() => {
      // Check which timers will complete this tick
      const completing = state.timers
        .filter((t) => t.isRunning && !t.isComplete && t.remainingSeconds <= 1)
        .map((t) => t.id);
      dispatch({ type: "TICK_TIMERS", completedIds: completing });
    }, 1000);
    return () => clearInterval(interval);
  }, [hasRunning, state.timers]);

  // Detect newly completed timers and play alarm
  useEffect(() => {
    const prev = prevTimersRef.current;
    for (const timer of state.timers) {
      if (timer.isComplete) {
        const prevTimer = prev.find((t) => t.id === timer.id);
        if (prevTimer && !prevTimer.isComplete) {
          playAlarm();
          break;
        }
      }
    }
    prevTimersRef.current = state.timers;
  }, [state.timers, playAlarm]);

  // Persistent alarm: repeat the chime until acknowledged
  const hasUnacknowledgedAlarm = state.timers.some(
    (t) => t.isComplete && !state.acknowledgedIds.includes(t.id)
  );
  useEffect(() => {
    if (!persistentAlarm || !hasUnacknowledgedAlarm) return;
    const interval = setInterval(() => {
      playAlarm();
    }, 1800);
    return () => clearInterval(interval);
  }, [persistentAlarm, hasUnacknowledgedAlarm, playAlarm]);

  // Wake lock management
  useEffect(() => {
    if (state.sessions.length > 0 && !wakeLockRef.current) {
      navigator.wakeLock?.request("screen").then((lock) => {
        wakeLockRef.current = lock;
      }).catch(() => {});
    } else if (state.sessions.length === 0 && wakeLockRef.current) {
      wakeLockRef.current.release();
      wakeLockRef.current = null;
    }
  }, [state.sessions.length]);

  // Resume audio context on user interaction
  useEffect(() => {
    function resumeAudio() {
      if (audioContextRef.current?.state === "suspended") {
        audioContextRef.current.resume();
      }
    }
    document.addEventListener("touchstart", resumeAudio, { once: false });
    document.addEventListener("click", resumeAudio, { once: false });
    return () => {
      document.removeEventListener("touchstart", resumeAudio);
      document.removeEventListener("click", resumeAudio);
    };
  }, []);

  const addSession = useCallback(
    (recipe: Recipe, cookLogs: CookLog[], servingMultiplier = 1) => {
      dispatch({ type: "ADD_SESSION", recipe, cookLogs, servingMultiplier });
    },
    []
  );

  const removeSession = useCallback((recipeId: string) => {
    dispatch({ type: "REMOVE_SESSION", recipeId });
  }, []);

  const setActiveSession = useCallback((recipeId: string) => {
    dispatch({ type: "SET_ACTIVE", recipeId });
  }, []);

  const updateSession = useCallback(
    (recipeId: string, updates: Partial<CookingSession>) => {
      dispatch({ type: "UPDATE_SESSION", recipeId, updates });
    },
    []
  );

  const startTimer = useCallback(
    (
      timerData: Omit<ActiveTimer, "id" | "isRunning" | "isComplete">
    ): string => {
      const id = crypto.randomUUID();
      dispatch({
        type: "START_TIMER",
        timer: { ...timerData, id, isRunning: true, isComplete: false },
      });
      return id;
    },
    []
  );

  const pauseTimer = useCallback((timerId: string) => {
    dispatch({ type: "PAUSE_TIMER", timerId });
  }, []);

  const resumeTimer = useCallback((timerId: string) => {
    dispatch({ type: "RESUME_TIMER", timerId });
  }, []);

  const resetTimer = useCallback((timerId: string) => {
    dispatch({ type: "RESET_TIMER", timerId });
  }, []);

  const removeTimer = useCallback((timerId: string) => {
    dispatch({ type: "REMOVE_TIMER", timerId });
  }, []);

  const adjustTimer = useCallback((timerId: string, deltaSeconds: number) => {
    dispatch({ type: "ADJUST_TIMER", timerId, deltaSeconds });
  }, []);

  const dismissAlarm = useCallback(() => {
    dispatch({ type: "ACKNOWLEDGE_ALL_ALARMS" });
  }, []);

  const setStepNote = useCallback((recipeId: string, stepIndex: number, note: string) => {
    dispatch({ type: "SET_STEP_NOTE", recipeId, stepIndex, note });
  }, []);

  const appendStepNote = useCallback(
    (recipeId: string, stepIndex: number, text: string) => {
      dispatch({ type: "APPEND_STEP_NOTE", recipeId, stepIndex, text });
    },
    []
  );

  return (
    <CookingSessionContext.Provider
      value={{
        sessions: state.sessions,
        activeSessionId: state.activeSessionId,
        timers: state.timers,
        addSession,
        removeSession,
        setActiveSession,
        updateSession,
        setStepNote,
        appendStepNote,
        startTimer,
        pauseTimer,
        resumeTimer,
        resetTimer,
        adjustTimer,
        removeTimer,
        isAnyCooking: state.sessions.length > 0,
        persistentAlarm,
        setPersistentAlarm,
        hasActiveAlarm: hasUnacknowledgedAlarm,
        dismissAlarm,
      }}
    >
      {children}
    </CookingSessionContext.Provider>
  );
}

export function useCookingSession() {
  const ctx = useContext(CookingSessionContext);
  if (!ctx) {
    throw new Error(
      "useCookingSession must be used within a CookingSessionProvider"
    );
  }
  return ctx;
}
