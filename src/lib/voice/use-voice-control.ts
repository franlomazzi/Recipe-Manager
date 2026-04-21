"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useCookingSession } from "@/lib/contexts/cooking-session-context";
import { WebSpeechBackend } from "./web-speech-backend";
import { cancelSpeech, isTTSSupported, speak } from "./tts";
import { cancelAITTS, speakWithAI } from "./ai-tts";
import { classifyDictation, matchCommand, stripWakeWord } from "./commands";
import type { CommandContext } from "./commands";
import type {
  SpeechBackend,
  SpeechErrorKind,
  VoiceStatus,
  VoiceSupport,
} from "./types";

const STORAGE_KEY_ENABLED = "voice.enabled";
const STORAGE_KEY_TTS = "voice.ttsEnabled";
const STORAGE_KEY_LANG = "voice.lang";
const DEFAULT_LANG = "en-US";
// BCP-47 tags known to be supported by Chrome's Web Speech. Offering multiple
// English variants directly helps non-US accents — the engine's acoustic
// model for en-GB/en-AU/en-IN is tuned for those speakers and often
// transcribes them more accurately than en-US.
export const SUPPORTED_LANGS: ReadonlyArray<{ code: string; label: string }> = [
  { code: "en-US", label: "English (US)" },
  { code: "en-GB", label: "English (UK)" },
  { code: "en-AU", label: "English (Australia)" },
  { code: "en-IN", label: "English (India)" },
  { code: "en-CA", label: "English (Canada)" },
  { code: "en-NZ", label: "English (New Zealand)" },
  { code: "en-IE", label: "English (Ireland)" },
  { code: "en-ZA", label: "English (South Africa)" },
];
const WATCHDOG_INTERVAL_MS = 5000;
const BACKOFF_INITIAL_MS = 200;
const BACKOFF_MAX_MS = 5000;
const DICTATION_SILENCE_AUTOSAVE_MS = 15000;

function detectSupport(): VoiceSupport {
  if (typeof window === "undefined") {
    return { stt: false, tts: false, browser: "unknown", notes: ["ssr"] };
  }
  const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
  const stt = !!(w.SpeechRecognition || w.webkitSpeechRecognition);
  const tts = isTTSSupported();
  const ua = navigator.userAgent.toLowerCase();
  let browser: VoiceSupport["browser"] = "unknown";
  const notes: string[] = [];
  if (/firefox/.test(ua)) {
    browser = "firefox";
    notes.push("Firefox has no Web Speech API support.");
  } else if (/edg\//.test(ua) || /chrome/.test(ua)) {
    browser = "chrome-like";
  } else if (/safari/.test(ua)) {
    browser = "safari";
    notes.push("iOS Safari stops continuous recognition after each utterance.");
  }
  return { stt, tts, browser, notes };
}

export interface DictationState {
  recipeId: string;
  recipeTitle: string;
  stepIndex: number;
  buffer: string;
  interim: string;
  startedAt: number;
}

export interface UseVoiceControlReturn {
  status: VoiceStatus;
  enabled: boolean;
  ttsEnabled: boolean;
  support: VoiceSupport;
  /** Last *final* transcript the recognizer returned (for history/debug). */
  lastTranscript: string;
  /** Currently-being-spoken partial transcript — drives the live caption. */
  interimTranscript: string;
  dictation: DictationState | null;
  lang: string;
  toggle: () => void;
  setTTSEnabled: (on: boolean) => void;
  setLang: (code: string) => void;
  cancelDictation: () => void;
  saveDictation: () => void;
}

export function useVoiceControl(): UseVoiceControlReturn {
  const session = useCookingSession();
  const [support] = useState<VoiceSupport>(() => detectSupport());
  // Always initialize off. Chrome requires a user gesture for each mic
  // grant in many states; we can't auto-start from a persisted preference
  // without that gesture, and trying to would loop on `not-allowed`.
  const [enabled, setEnabled] = useState<boolean>(false);
  const [ttsEnabled, setTTSEnabledState] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const raw = localStorage.getItem(STORAGE_KEY_TTS);
    return raw === null ? true : raw === "true";
  });
  const [status, setStatus] = useState<VoiceStatus>("off");
  const [lastTranscript, setLastTranscript] = useState("");
  /** Interim (still-being-spoken) transcript for the live caption UI. */
  const [interimTranscript, setInterimTranscript] = useState("");
  const [dictation, setDictation] = useState<DictationState | null>(null);
  const [lang, setLangState] = useState<string>(() => {
    if (typeof window === "undefined") return DEFAULT_LANG;
    const raw = localStorage.getItem(STORAGE_KEY_LANG);
    if (!raw) return DEFAULT_LANG;
    return SUPPORTED_LANGS.some((l) => l.code === raw) ? raw : DEFAULT_LANG;
  });

  // Refs for values the recognizer callbacks need to read freshly
  // without re-creating the backend on every session tick.
  const sessionRef = useRef(session);
  const ttsRef = useRef(ttsEnabled);
  const enabledRef = useRef(enabled);
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);
  useEffect(() => {
    ttsRef.current = ttsEnabled;
  }, [ttsEnabled]);
  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  const backendRef = useRef<SpeechBackend | null>(null);
  const manuallyStoppedRef = useRef(false);
  const backoffMsRef = useRef(BACKOFF_INITIAL_MS);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const watchdogTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastResultTsRef = useRef<number>(0);
  const recognizerAliveRef = useRef(false);
  // True between calling backend.start() and receiving either onstart or
  // onend/onerror — prevents double-starting when both the click handler and
  // the post-setState effect both try to start.
  const recognizerStartingRef = useRef(false);
  const dictationRef = useRef<DictationState | null>(null);
  const dictationSilenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  useEffect(() => {
    dictationRef.current = dictation;
  }, [dictation]);

  const speakIfEnabled = useCallback((text: string) => {
    if (ttsRef.current) speak(text);
  }, []);

  const speakRichIfEnabled = useCallback(
    (text: string, opts?: { style?: string }) => {
      if (!ttsRef.current) return;
      // The AI TTS round-trip takes 1–3 seconds on typical networks. Flip
      // the pill to "thinking" so the user sees immediate acknowledgment
      // of the command instead of silence. We snap back to "listening"
      // the moment playback actually starts (or the fallback fires).
      setStatus("thinking");
      speakWithAI(text, { style: opts?.style }).finally(() => {
        if (recognizerAliveRef.current) setStatus("listening");
      });
    },
    []
  );

  const clearDictationSilence = () => {
    if (dictationSilenceTimerRef.current) {
      clearTimeout(dictationSilenceTimerRef.current);
      dictationSilenceTimerRef.current = null;
    }
  };

  const armDictationSilence = useCallback(() => {
    clearDictationSilence();
    dictationSilenceTimerRef.current = setTimeout(() => {
      const d = dictationRef.current;
      if (!d) return;
      if (d.buffer.trim()) {
        const s = sessionRef.current;
        s.appendStepNote(d.recipeId, d.stepIndex, d.buffer);
        speakIfEnabled("Note saved.");
        toast.success("Note saved.");
      } else {
        speakIfEnabled("Note cancelled.");
      }
      setDictation(null);
    }, DICTATION_SILENCE_AUTOSAVE_MS);
  }, [speakIfEnabled]);

  const enterDictation = useCallback(() => {
    const s = sessionRef.current;
    const active =
      s.sessions.find((x) => x.recipeId === s.activeSessionId) ??
      s.sessions[0] ??
      null;
    if (!active) {
      speakIfEnabled("No active recipe.");
      return;
    }
    if (active.currentStep === 0) {
      speakIfEnabled("Notes are only for cooking steps, not ingredients.");
      return;
    }
    setDictation({
      recipeId: active.recipeId,
      recipeTitle: active.recipe.title,
      stepIndex: active.currentStep,
      buffer: "",
      interim: "",
      startedAt: Date.now(),
    });
    speakIfEnabled("Dictating note. Say save note when you're done.");
    armDictationSilence();
  }, [speakIfEnabled, armDictationSilence]);

  const saveDictation = useCallback(() => {
    const d = dictationRef.current;
    clearDictationSilence();
    if (!d) return;
    if (d.buffer.trim()) {
      const s = sessionRef.current;
      s.appendStepNote(d.recipeId, d.stepIndex, d.buffer);
      speakIfEnabled("Note saved.");
      toast.success("Note saved.");
    } else {
      speakIfEnabled("Nothing to save.");
    }
    setDictation(null);
  }, [speakIfEnabled]);

  const cancelDictation = useCallback(() => {
    clearDictationSilence();
    if (!dictationRef.current) return;
    speakIfEnabled("Note cancelled.");
    setDictation(null);
  }, [speakIfEnabled]);

  const handleDictationInput = useCallback(
    (transcript: string, isFinal: boolean) => {
      const d = dictationRef.current;
      if (!d) return;
      armDictationSilence();
      const cleaned = transcript.trim();
      if (!isFinal) {
        setDictation({ ...d, interim: cleaned });
        return;
      }
      const directive = classifyDictation(cleaned);
      if (directive === "save") {
        saveDictation();
        return;
      }
      if (directive === "cancel") {
        cancelDictation();
        return;
      }
      if (directive === "scratch") {
        setDictation({ ...d, buffer: "", interim: "" });
        speakIfEnabled("Cleared.");
        return;
      }
      // Strip a leading wake word if present (harmless if user habit-prefixes).
      const stripped = stripWakeWord(cleaned);
      const body = stripped ?? cleaned;
      if (!body) return;
      const next = d.buffer ? `${d.buffer} ${body}` : body;
      setDictation({ ...d, buffer: next, interim: "" });
    },
    [armDictationSilence, cancelDictation, saveDictation, speakIfEnabled]
  );

  const dispatchCommand = useCallback(
    (alternatives: string[]) => {
      // Try every alternative the recognizer returned. Many accent-driven
      // misrecognitions land in alt[1] or alt[2] — "chef" → "shaft", but
      // alt[1] is the correct "chef". We accept the first alternative that
      // both carries a wake word AND matches a command pattern.
      let wakeSeen = false;
      let matched: NonNullable<ReturnType<typeof matchCommand>> | null = null;
      for (const alt of alternatives) {
        if (!alt) continue;
        const stripped = stripWakeWord(alt);
        if (stripped === null) continue;
        wakeSeen = true;
        if (stripped === "") continue; // bare wake word — keep scanning
        const hit = matchCommand(stripped);
        if (hit) {
          matched = hit;
          break;
        }
      }
      if (!wakeSeen) return; // no wake word in any alternative; ignore
      if (!matched) {
        // Wake word heard, but none of the alternatives parsed to a known
        // command. Surface the top guess so the user sees what we heard.
        const top = alternatives[0] ?? "";
        speakIfEnabled(top ? "I didn't catch that." : "Yes?");
        return;
      }
      const result = matched;
      const s = sessionRef.current;
      const activeSession =
        s.sessions.find((x) => x.recipeId === s.activeSessionId) ??
        s.sessions[0] ??
        null;
      const ctx: CommandContext = {
        activeSession,
        sessions: s.sessions,
        timers: s.timers,
        updateSession: s.updateSession,
        startTimer: s.startTimer,
        pauseTimer: s.pauseTimer,
        resumeTimer: s.resumeTimer,
        resetTimer: s.resetTimer,
        adjustTimer: s.adjustTimer,
        dismissAlarm: s.dismissAlarm,
        speak: speakIfEnabled,
        speakRich: speakRichIfEnabled,
        toast: (text) => toast(text),
        enterDictation,
      };
      try {
        result.command.handler(ctx, { id: result.command.id, remainder: result.remainder });
      } catch (err) {
        console.error("[voice] command handler error", err);
      }
    },
    [speakIfEnabled, speakRichIfEnabled, enterDictation]
  );

  // Forward-declared refs so start/schedule/handleError can reference each other
  // without ordering issues or stale closures.
  const startRecognizerRef = useRef<() => void>(() => {});
  const scheduleRestartRef = useRef<() => void>(() => {});
  const handleErrorRef = useRef<(kind: SpeechErrorKind, raw: string) => void>(
    () => {}
  );

  const clearRestartTimer = () => {
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
  };

  const langRef = useRef(lang);
  useEffect(() => {
    langRef.current = lang;
  }, [lang]);

  const startRecognizer = useCallback(() => {
    if (!backendRef.current) {
      backendRef.current = new WebSpeechBackend(langRef.current);
    } else {
      backendRef.current.setLang(langRef.current);
    }
    if (!backendRef.current.isSupported) {
      setStatus("error-unsupported");
      return;
    }
    // Idempotency guard: if a recognizer is already alive or we're mid-start,
    // don't kick off another one. This matters because toggle() starts
    // synchronously and then the enable-state effect also tries to start.
    if (recognizerAliveRef.current || recognizerStartingRef.current) {
      return;
    }
    recognizerStartingRef.current = true;
    setStatus((prev) => (prev === "listening" ? prev : "starting"));
    backendRef.current.start({
      onStart: () => {
        recognizerStartingRef.current = false;
        recognizerAliveRef.current = true;
        lastResultTsRef.current = Date.now();
        backoffMsRef.current = BACKOFF_INITIAL_MS;
        setStatus("listening");
      },
      onResult: ({ transcript, alternatives, isFinal }) => {
        lastResultTsRef.current = Date.now();
        if (isFinal) {
          setLastTranscript(transcript);
          setInterimTranscript("");
        } else {
          // Drive the live caption. We only surface interim transcripts
          // outside of dictation mode — dictation has its own overlay.
          if (!dictationRef.current) setInterimTranscript(transcript);
        }
        if (dictationRef.current) {
          handleDictationInput(transcript, isFinal);
          return;
        }
        if (isFinal) {
          // Use the backend's full alternatives list. Fall back to just the
          // primary transcript if the backend returned none (older engines).
          const alts = alternatives.length > 0 ? alternatives : [transcript];
          dispatchCommand(alts);
        }
      },
      onError: (kind, raw) => {
        handleErrorRef.current(kind, raw);
      },
      onEnd: () => {
        recognizerAliveRef.current = false;
        recognizerStartingRef.current = false;
        if (manuallyStoppedRef.current) {
          manuallyStoppedRef.current = false;
          return;
        }
        if (!enabledRef.current) return;
        scheduleRestartRef.current();
      },
    });
  }, [dispatchCommand, handleDictationInput]);

  const scheduleRestart = useCallback(() => {
    clearRestartTimer();
    const delay = backoffMsRef.current;
    backoffMsRef.current = Math.min(Math.round(backoffMsRef.current * 2), BACKOFF_MAX_MS);
    restartTimerRef.current = setTimeout(() => {
      if (!enabledRef.current) return;
      startRecognizerRef.current();
    }, delay);
  }, []);

  const queryMicPermission = useCallback(async (): Promise<PermissionState | "unknown"> => {
    if (typeof navigator === "undefined" || !navigator.permissions?.query) {
      return "unknown";
    }
    try {
      const result = await navigator.permissions.query({
        name: "microphone" as PermissionName,
      });
      return result.state;
    } catch {
      return "unknown";
    }
  }, []);

  const handleError = useCallback(
    (kind: SpeechErrorKind, raw: string) => {
      switch (kind) {
        case "no-speech":
          // benign; will auto-restart on end
          break;
        case "aborted":
          // expected during manual stop
          break;
        case "network":
          setStatus("reconnecting");
          toast.warning("Voice offline — timers and controls still work.");
          break;
        case "not-allowed":
        case "service-not-allowed": {
          // Break the restart loop immediately — Chrome will keep re-emitting
          // not-allowed (and showing its native "blocked" popup) if we keep
          // calling start() without a user gesture. We disable voice mode
          // and ask the user to tap again; that tap gives us a fresh gesture.
          manuallyStoppedRef.current = true;
          enabledRef.current = false;
          clearRestartTimer();
          backendRef.current?.abort();
          recognizerAliveRef.current = false;
          recognizerStartingRef.current = false;
          queryMicPermission().then((state) => {
            if (state === "denied") {
              setStatus("error-permission");
              toast.error(
                "Microphone blocked by the browser. Allow mic access in site settings."
              );
            } else {
              // granted / prompt / unknown — Chrome rejected the start call
              // for gesture/focus reasons even though permission is there.
              setStatus("off");
              toast.message("Voice paused. Tap the mic to resume.");
            }
            setEnabled(false);
            if (typeof window !== "undefined") {
              localStorage.setItem(STORAGE_KEY_ENABLED, "false");
            }
          });
          break;
        }
        case "audio-capture":
          setStatus("error-hardware");
          toast.error("No microphone available. Voice mode disabled.");
          setEnabled(false);
          if (typeof window !== "undefined") {
            localStorage.setItem(STORAGE_KEY_ENABLED, "false");
          }
          break;
        default:
          console.warn("[voice] error", kind, raw);
      }
    },
    [queryMicPermission]
  );

  // Keep callback refs in sync
  useEffect(() => {
    startRecognizerRef.current = startRecognizer;
  }, [startRecognizer]);
  useEffect(() => {
    scheduleRestartRef.current = scheduleRestart;
  }, [scheduleRestart]);
  useEffect(() => {
    handleErrorRef.current = handleError;
  }, [handleError]);

  const stopRecognizer = useCallback(() => {
    manuallyStoppedRef.current = true;
    clearRestartTimer();
    clearDictationSilence();
    backendRef.current?.abort();
    recognizerAliveRef.current = false;
    recognizerStartingRef.current = false;
    cancelAITTS();
    cancelSpeech();
    setStatus("off");
    setInterimTranscript("");
    setDictation(null);
  }, []);

  // Unmount-only cleanup. We deliberately do NOT run a start/stop effect
  // keyed on `enabled`, because that effect's cleanup would abort the
  // recognizer that `toggle()` just started synchronously inside the user
  // gesture, and the subsequent restart from the effect would run outside
  // the gesture — which Chrome rejects as `not-allowed`.
  useEffect(() => {
    return () => {
      stopRecognizer();
    };
  }, [stopRecognizer]);


  // Watchdog — detect if recognizer went dead without firing onend.
  useEffect(() => {
    if (!enabled) return;
    watchdogTimerRef.current = setInterval(() => {
      if (!enabledRef.current) return;
      if (
        recognizerAliveRef.current === false &&
        !restartTimerRef.current
      ) {
        scheduleRestartRef.current();
      }
      if (
        recognizerAliveRef.current &&
        Date.now() - lastResultTsRef.current > 60_000
      ) {
        recognizerAliveRef.current = false;
        backendRef.current?.abort();
      }
    }, WATCHDOG_INTERVAL_MS);
    return () => {
      if (watchdogTimerRef.current) clearInterval(watchdogTimerRef.current);
      watchdogTimerRef.current = null;
    };
  }, [enabled]);

  // Visibility handling — recognizer pauses when tab hidden; restart on return.
  useEffect(() => {
    if (!enabled) return;
    const onVisibility = () => {
      if (document.visibilityState === "visible" && enabledRef.current) {
        // Give the browser a moment before re-acquiring the mic.
        setTimeout(() => {
          if (!enabledRef.current) return;
          if (!recognizerAliveRef.current) {
            speakIfEnabled("Voice resumed.");
            startRecognizer();
          }
        }, 300);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled, speakIfEnabled, startRecognizer]);

  const toggle = useCallback(() => {
    const curr = enabledRef.current;
    const next = !curr;
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY_ENABLED, String(next));
    }
    if (next) {
      if (!support.stt) {
        setStatus("error-unsupported");
        toast.error("Voice input not supported in this browser.");
        return;
      }
      toast.success("Voice on. Say \u201cChef, next step.\u201d");
      // Start the recognizer SYNCHRONOUSLY inside the click handler so the
      // browser treats this as a user-gesture-initiated mic request. We do
      // NOT rely on a useEffect to start it — by the time the effect runs
      // the user-gesture window has closed and Chrome rejects start() with
      // `not-allowed`.
      manuallyStoppedRef.current = false;
      backoffMsRef.current = BACKOFF_INITIAL_MS;
      enabledRef.current = true;
      startRecognizer();
    } else {
      toast("Voice off.");
      enabledRef.current = false;
      stopRecognizer();
    }
    setEnabled(next);
  }, [support.stt, startRecognizer, stopRecognizer]);

  const setLang = useCallback(
    (code: string) => {
      if (!SUPPORTED_LANGS.some((l) => l.code === code)) return;
      setLangState(code);
      langRef.current = code;
      if (typeof window !== "undefined") {
        localStorage.setItem(STORAGE_KEY_LANG, code);
      }
      backendRef.current?.setLang(code);
      // If voice is on, cycle the recognizer so the change takes effect
      // immediately rather than waiting for the next natural restart.
      if (enabledRef.current && recognizerAliveRef.current) {
        manuallyStoppedRef.current = false;
        backendRef.current?.abort();
        // onend will fire and scheduleRestart will re-open with the new lang.
      }
    },
    []
  );

  const setTTSEnabled = useCallback((on: boolean) => {
    setTTSEnabledState(on);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY_TTS, String(on));
    }
    if (!on) {
      cancelAITTS();
      cancelSpeech();
    }
  }, []);

  return {
    status,
    enabled,
    ttsEnabled,
    support,
    lastTranscript,
    interimTranscript,
    dictation,
    lang,
    toggle,
    setTTSEnabled,
    setLang,
    cancelDictation,
    saveDictation,
  };
}
