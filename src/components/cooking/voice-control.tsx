"use client";

import { useEffect, useRef, useState } from "react";
import {
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  AlertCircle,
  Loader2,
  Globe,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  SUPPORTED_LANGS,
  type UseVoiceControlReturn,
} from "@/lib/voice/use-voice-control";

interface VoiceControlProps {
  voice: UseVoiceControlReturn;
}

// How long to keep the final transcript visible in the live caption before
// fading out. Keeps short commands ("chef, next") on screen long enough to
// read, without cluttering the UI during a long idle.
const FINAL_CAPTION_HOLD_MS = 2500;

export function VoiceControl({ voice }: VoiceControlProps) {
  const {
    status,
    enabled,
    ttsEnabled,
    support,
    lastTranscript,
    interimTranscript,
    lang,
    toggle,
    setTTSEnabled,
    setLang,
  } = voice;

  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const langMenuRef = useRef<HTMLDivElement | null>(null);

  // Close the language menu on outside click.
  useEffect(() => {
    if (!langMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (
        langMenuRef.current &&
        !langMenuRef.current.contains(e.target as Node)
      ) {
        setLangMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [langMenuOpen]);

  // Caption visibility — we store the transcript whose hold window has
  // ELAPSED. Any lastTranscript that differs from that is still "fresh"
  // and should be shown. This pattern keeps the only setState call inside
  // the setTimeout callback (async), satisfying the set-state-in-effect
  // rule while still giving us a timed fade-out.
  const [expiredTranscript, setExpiredTranscript] = useState<string>("");
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!lastTranscript) return;
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    const captured = lastTranscript;
    holdTimerRef.current = setTimeout(() => {
      setExpiredTranscript(captured);
      holdTimerRef.current = null;
    }, FINAL_CAPTION_HOLD_MS);
    return () => {
      if (holdTimerRef.current) {
        clearTimeout(holdTimerRef.current);
        holdTimerRef.current = null;
      }
    };
  }, [lastTranscript]);

  const finalStillFresh =
    lastTranscript.length > 0 && lastTranscript !== expiredTranscript;
  const captionText = interimTranscript
    ? interimTranscript
    : finalStillFresh
    ? lastTranscript
    : "";
  const captionKind: "interim" | "final" = interimTranscript ? "interim" : "final";

  if (!support.stt && !enabled) {
    return null;
  }

  const statusLabel =
    status === "listening"
      ? "Listening"
      : status === "starting"
      ? "Starting"
      : status === "thinking"
      ? "Thinking\u2026"
      : status === "reconnecting"
      ? "Reconnecting"
      : status === "error-permission"
      ? "Mic blocked"
      : status === "error-hardware"
      ? "No mic"
      : status === "error-unsupported"
      ? "Unsupported"
      : "Off";

  const statusClasses =
    status === "listening"
      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30"
      : status === "thinking"
      ? "bg-sky-500/15 text-sky-700 dark:text-sky-400 border-sky-500/30"
      : status === "reconnecting"
      ? "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30"
      : status === "error-permission" ||
        status === "error-hardware" ||
        status === "error-unsupported"
      ? "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30"
      : status === "starting"
      ? "bg-muted text-muted-foreground border-border"
      : "bg-muted text-muted-foreground border-transparent";

  const StatusIcon =
    status === "starting"
      ? Loader2
      : status === "thinking"
      ? Loader2
      : status === "reconnecting"
      ? Loader2
      : status === "error-permission" ||
        status === "error-hardware" ||
        status === "error-unsupported"
      ? AlertCircle
      : null;

  const currentLangLabel =
    SUPPORTED_LANGS.find((l) => l.code === lang)?.label ?? lang;

  return (
    <div className="relative flex items-center gap-1.5">
      <button
        type="button"
        onClick={toggle}
        className={cn(
          "relative flex h-9 w-9 items-center justify-center rounded-xl border transition-colors",
          enabled
            ? "bg-primary text-primary-foreground border-primary hover:bg-primary/90"
            : "bg-muted text-muted-foreground border-transparent hover:bg-muted/80"
        )}
        aria-label={enabled ? "Turn voice control off" : "Turn voice control on"}
        title={
          enabled
            ? "Voice on \u2014 say \u201cChef, next step\u201d"
            : "Turn voice control on"
        }
      >
        {enabled ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
        {enabled && status === "listening" && (
          <span className="absolute right-0.5 top-0.5 h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
        )}
      </button>

      {enabled && (
        <>
          <div
            className={cn(
              "hidden sm:flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
              statusClasses
            )}
            title={lastTranscript ? `Heard: ${lastTranscript}` : statusLabel}
          >
            {StatusIcon && (
              <StatusIcon
                className={cn(
                  "h-3 w-3",
                  (status === "starting" ||
                    status === "reconnecting" ||
                    status === "thinking") &&
                    "animate-spin"
                )}
              />
            )}
            <span>{statusLabel}</span>
          </div>

          {/* Language selector — helps non-US-English speakers pick a
              dialect model that transcribes their accent more accurately. */}
          <div className="relative" ref={langMenuRef}>
            <button
              type="button"
              onClick={() => setLangMenuOpen((o) => !o)}
              className="hidden sm:flex h-9 items-center gap-1 rounded-xl border border-transparent bg-muted px-2 text-[11px] font-medium text-muted-foreground hover:bg-muted/80"
              aria-label={`Voice language: ${currentLangLabel}`}
              title={`Voice language: ${currentLangLabel}`}
            >
              <Globe className="h-3.5 w-3.5" />
              <span className="hidden md:inline">{lang}</span>
            </button>
            {langMenuOpen && (
              <div className="absolute right-0 top-full z-[60] mt-1 w-52 rounded-xl border border-border bg-popover p-1 shadow-lg">
                {SUPPORTED_LANGS.map((l) => {
                  const active = l.code === lang;
                  return (
                    <button
                      key={l.code}
                      type="button"
                      onClick={() => {
                        setLang(l.code);
                        setLangMenuOpen(false);
                      }}
                      className={cn(
                        "flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs hover:bg-muted",
                        active
                          ? "text-foreground font-medium"
                          : "text-muted-foreground"
                      )}
                    >
                      <span>{l.label}</span>
                      {active && <Check className="h-3.5 w-3.5" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => setTTSEnabled(!ttsEnabled)}
            className={cn(
              "hidden sm:flex h-9 w-9 items-center justify-center rounded-xl border transition-colors",
              ttsEnabled
                ? "bg-muted text-foreground border-transparent hover:bg-muted/80"
                : "bg-muted/50 text-muted-foreground border-transparent hover:bg-muted"
            )}
            aria-label={
              ttsEnabled ? "Mute voice responses" : "Unmute voice responses"
            }
            title={ttsEnabled ? "Mute voice responses" : "Unmute voice responses"}
          >
            {ttsEnabled ? (
              <Volume2 className="h-4 w-4" />
            ) : (
              <VolumeX className="h-4 w-4" />
            )}
          </button>
        </>
      )}

      {/* Live caption — floats below the mic button so the user can see
          exactly what the recognizer is picking up in real time. This is
          the single biggest UX fix for "did it hear me?" latency
          perception. Anchored absolutely so it doesn't shift layout. */}
      {enabled && captionText && (
        <div
          className={cn(
            "pointer-events-none absolute left-1/2 top-full z-[55] mt-2 -translate-x-1/2 whitespace-nowrap rounded-full border px-3 py-1 text-xs shadow-md backdrop-blur-sm transition-opacity",
            captionKind === "interim"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200 italic"
              : "border-border bg-background/90 text-foreground"
          )}
          aria-live="polite"
        >
          <span className="max-w-[60vw] inline-block truncate align-middle">
            {captionText}
          </span>
        </div>
      )}
    </div>
  );
}
