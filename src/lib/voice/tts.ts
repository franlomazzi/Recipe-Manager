"use client";

export function isTTSSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

interface SpeakOptions {
  rate?: number;
  pitch?: number;
  volume?: number;
  interrupt?: boolean;
}

export function speak(text: string, opts: SpeakOptions = {}): void {
  if (!isTTSSupported() || !text) return;
  const synth = window.speechSynthesis;
  if (opts.interrupt !== false) {
    try {
      synth.cancel();
    } catch {
      /* noop */
    }
  }
  const utter = new SpeechSynthesisUtterance(text);
  utter.rate = opts.rate ?? 1.1;
  utter.pitch = opts.pitch ?? 1;
  utter.volume = opts.volume ?? 1;
  try {
    synth.speak(utter);
  } catch {
    /* noop */
  }
}

export function cancelSpeech(): void {
  if (!isTTSSupported()) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    /* noop */
  }
}

export function isSpeaking(): boolean {
  if (!isTTSSupported()) return false;
  return window.speechSynthesis.speaking;
}
