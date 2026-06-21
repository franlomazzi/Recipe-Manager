// Master switch for in-app voice features (microphone command input + Gemini
// AI text-to-speech in cooking mode).
//
// Turned OFF to stop the recurring Gemini TTS cost while voice isn't being
// used. Flipping this back to `true` fully restores the feature — the mic
// button reappears in cooking mode and spoken steps resume — with no other
// code changes required.
//
// When false:
//   - the VoiceControl mic button is hidden, so the recognizer can never start
//     (it only starts from that button's user-gesture toggle), and
//   - speakWithAI() short-circuits before hitting /api/voice-speak.
export const VOICE_ENABLED = false;
