export type VoiceStatus =
  | "off"
  | "starting"
  | "listening"
  | "thinking"
  | "reconnecting"
  | "error-permission"
  | "error-hardware"
  | "error-unsupported";

export interface SpeechResult {
  /** Primary (best-confidence) transcript. */
  transcript: string;
  /**
   * All alternatives the recognizer returned for this utterance, ordered by
   * confidence. `transcript` is `alternatives[0]`. Useful for accent-tolerant
   * command matching — if the primary guess doesn't match a pattern, we can
   * try the secondary guesses before giving up.
   */
  alternatives: string[];
  isFinal: boolean;
}

export type SpeechErrorKind =
  | "no-speech"
  | "audio-capture"
  | "not-allowed"
  | "network"
  | "aborted"
  | "language-not-supported"
  | "service-not-allowed"
  | "bad-grammar"
  | "unknown";

export interface SpeechBackendHandlers {
  onResult: (r: SpeechResult) => void;
  onError: (kind: SpeechErrorKind, raw: string) => void;
  onEnd: () => void;
  onStart: () => void;
}

export interface SpeechBackend {
  readonly isSupported: boolean;
  start: (handlers: SpeechBackendHandlers) => void;
  stop: () => void;
  abort: () => void;
  /**
   * Change the BCP-47 language tag for future `start()` calls. Does not
   * affect an already-running recognizer; callers that want the change to
   * take effect immediately should abort + restart.
   */
  setLang: (lang: string) => void;
}

export interface VoiceSupport {
  stt: boolean;
  tts: boolean;
  browser: "chrome-like" | "safari" | "firefox" | "unknown";
  notes: string[];
}
