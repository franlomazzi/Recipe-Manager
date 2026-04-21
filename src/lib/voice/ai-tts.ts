"use client";

// Higher-quality TTS backed by Gemini's TTS API. Used for content the user
// will actually *listen* to (step instructions, explanations) rather than
// quick confirmations like "next step" or "timer paused" — those stay on
// the fast, local Web Speech synthesizer in ./tts.ts so there's no network
// round-trip.
//
// On any failure (no auth, offline, quota, etc.) we fall back to the
// browser's built-in TTS so the user still hears *something* — cooking
// workflows can't be left hanging on a flaky network.

import { getAuth } from "@/lib/firebase/config";
import { cancelSpeech, speak as speakBrowser } from "./tts";

let currentAudio: HTMLAudioElement | null = null;
let currentUrl: string | null = null;
let currentAbort: AbortController | null = null;

/** Stop any AI-TTS playback and any pending request. Also cancels browser TTS. */
export function cancelAITTS(): void {
  if (currentAbort) {
    try {
      currentAbort.abort();
    } catch {
      /* noop */
    }
    currentAbort = null;
  }
  if (currentAudio) {
    try {
      currentAudio.pause();
      currentAudio.src = "";
    } catch {
      /* noop */
    }
    currentAudio = null;
  }
  if (currentUrl) {
    try {
      URL.revokeObjectURL(currentUrl);
    } catch {
      /* noop */
    }
    currentUrl = null;
  }
  cancelSpeech();
}

export interface AITTSOptions {
  /** Natural-language delivery hint, e.g. "Read slowly and calmly". */
  style?: string;
  /** Gemini prebuilt voice name, e.g. "Aoede", "Kore", "Puck". */
  voice?: string;
  /** If true, fall through to browser TTS silently on failure. Default: true. */
  fallback?: boolean;
}

/**
 * Request AI-generated speech for `text` and play it. Returns once playback
 * has started (or fallback has been initiated). Safe to call repeatedly —
 * each call cancels anything previously playing.
 */
export async function speakWithAI(
  text: string,
  opts: AITTSOptions = {}
): Promise<void> {
  if (!text || !text.trim()) return;
  cancelAITTS();

  const fallback = opts.fallback !== false;
  const abort = new AbortController();
  currentAbort = abort;

  try {
    const user = getAuth().currentUser;
    if (!user) {
      // Not signed in → no way to call the gated TTS route. Fall back.
      if (fallback) speakBrowser(text);
      return;
    }
    const token = await user.getIdToken();
    const res = await fetch("/api/voice-speak", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        text,
        style: opts.style,
        voice: opts.voice,
      }),
      signal: abort.signal,
    });
    if (abort.signal.aborted) return;
    if (!res.ok) {
      throw new Error(`voice-speak ${res.status}`);
    }
    const data = (await res.json()) as { audio?: string; mime?: string };
    if (abort.signal.aborted) return;
    if (!data.audio) throw new Error("no audio in response");

    const bytes = base64ToBytes(data.audio);
    // Allocate a fresh ArrayBuffer and copy so TS's BlobPart typing (which
    // rejects the ArrayBufferLike union) is satisfied. The audio clip is
    // small (a few hundred KB at most), so the extra copy is negligible.
    const ab = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(ab).set(bytes);
    const blob = new Blob([ab], { type: data.mime || "audio/wav" });
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    currentAudio = audio;
    currentUrl = url;

    const cleanup = () => {
      if (currentAudio === audio) currentAudio = null;
      if (currentUrl === url) {
        try {
          URL.revokeObjectURL(url);
        } catch {
          /* noop */
        }
        currentUrl = null;
      }
    };
    audio.onended = cleanup;
    audio.onerror = cleanup;

    try {
      await audio.play();
    } catch (err) {
      // Autoplay blocked, audio element corrupt, etc.
      cleanup();
      throw err;
    }
  } catch (err) {
    if (abort.signal.aborted) return;
    console.warn("[voice] AI TTS failed, falling back to browser TTS", err);
    if (fallback) speakBrowser(text);
  } finally {
    if (currentAbort === abort) currentAbort = null;
  }
}

function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/\s/g, "");
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
