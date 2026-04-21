"use client";

import type {
  SpeechBackend,
  SpeechBackendHandlers,
  SpeechErrorKind,
} from "./types";

type SpeechRecognitionResultLike = {
  [index: number]: { transcript: string; confidence?: number };
  length: number;
  isFinal: boolean;
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
};

type SpeechRecognitionErrorEventLike = { error: string };

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives?: number;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onerror: ((ev: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const KNOWN_ERRORS: ReadonlySet<SpeechErrorKind> = new Set([
  "no-speech",
  "audio-capture",
  "not-allowed",
  "network",
  "aborted",
  "language-not-supported",
  "service-not-allowed",
  "bad-grammar",
]);

function normalizeError(raw: string): SpeechErrorKind {
  return (KNOWN_ERRORS as Set<string>).has(raw) ? (raw as SpeechErrorKind) : "unknown";
}

export class WebSpeechBackend implements SpeechBackend {
  private ctor: SpeechRecognitionCtor | null;
  private recognition: SpeechRecognitionLike | null = null;
  private handlers: SpeechBackendHandlers | null = null;
  private lang: string;

  constructor(lang = "en-US") {
    this.ctor = getCtor();
    this.lang = lang;
  }

  get isSupported(): boolean {
    return this.ctor !== null;
  }

  start(handlers: SpeechBackendHandlers): void {
    if (!this.ctor) return;
    this.handlers = handlers;
    const rec = new this.ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = this.lang;
    // Ask the recognizer for multiple guesses per utterance. When the user
    // has an accent or there's kitchen noise, the top pick is often wrong
    // but the second or third is right — we try each against the command
    // pattern list in the consumer.
    if ("maxAlternatives" in rec) rec.maxAlternatives = 3;

    rec.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        const alts: string[] = [];
        const len = res.length ?? 1;
        for (let j = 0; j < len; j++) {
          const t = res[j]?.transcript;
          if (t) alts.push(t);
        }
        const transcript = alts[0] ?? "";
        this.handlers?.onResult({
          transcript,
          alternatives: alts,
          isFinal: res.isFinal,
        });
      }
    };
    rec.onerror = (event) => {
      this.handlers?.onError(normalizeError(event.error), event.error);
    };
    rec.onend = () => {
      this.handlers?.onEnd();
    };
    rec.onstart = () => {
      this.handlers?.onStart();
    };

    this.recognition = rec;
    try {
      rec.start();
    } catch {
      // "already started" — fire onEnd so caller can restart cleanly
      this.handlers?.onEnd();
    }
  }

  stop(): void {
    try {
      this.recognition?.stop();
    } catch {
      /* noop */
    }
  }

  abort(): void {
    try {
      this.recognition?.abort();
    } catch {
      /* noop */
    }
  }

  setLang(lang: string): void {
    this.lang = lang;
    // Takes effect on the next start() — the already-running recognizer
    // keeps its locked-in language until it ends.
  }
}
