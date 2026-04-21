import { NextResponse } from "next/server";
import { verifyAuthorizedCaller } from "@/lib/firebase/admin";

// Server-side proxy to Google Gemini TTS. Takes a short piece of text (a
// recipe step, a timer confirmation, etc.) and returns natural-sounding
// speech audio as base64-encoded WAV. The Gemini API key never touches the
// client; every request must carry a Firebase ID token whose uid is on the
// whitelist defined in src/lib/firebase/admin.ts so random callers can't
// drain our TTS quota.
//
// Gemini TTS returns raw 16-bit PCM. Browsers won't decode that without a
// WAV header, so we wrap it on the server and send one self-contained file
// down the wire. This avoids shipping a Node Buffer shim to the browser.

const TTS_MODEL = "gemini-2.5-flash-preview-tts";
const DEFAULT_VOICE = "Aoede"; // warm, even-paced; good fit for instructions
const MAX_TEXT_LEN = 2000; // Gemini TTS cap — hard-fail long requests server-side

export async function POST(req: Request) {
  try {
    await verifyAuthorizedCaller(req);
  } catch (err) {
    const status = (err as { status?: number }).status ?? 401;
    const message = err instanceof Error ? err.message : "Unauthorized";
    return NextResponse.json({ error: message }, { status });
  }

  try {
    const { text, voice, style } = (await req.json()) as {
      text?: string;
      voice?: string;
      style?: string;
    };

    if (!text || !text.trim()) {
      return NextResponse.json({ error: "text is required" }, { status: 400 });
    }
    if (text.length > MAX_TEXT_LEN) {
      return NextResponse.json(
        { error: `text exceeds ${MAX_TEXT_LEN} characters` },
        { status: 400 }
      );
    }

    const apiKey =
      process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY;
    if (!apiKey) {
      console.error("voice-speak: GEMINI_API_KEY is not configured");
      return NextResponse.json(
        { error: "AI voice is not configured on the server." },
        { status: 500 }
      );
    }

    // Gemini TTS supports natural-language style instructions in the prompt
    // itself — wrapping the content in a "say like X:" preface changes
    // delivery without changing the words. Default is a warm-chef style.
    const styleHint =
      style && style.trim()
        ? style.trim()
        : "Read naturally and warmly, like a friendly chef guiding someone through a recipe, clear and unhurried";
    const prompt = `${styleHint}: ${text.trim()}`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${TTS_MODEL}:generateContent?key=${apiKey}`;
    const upstream = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: voice || DEFAULT_VOICE },
            },
          },
        },
      }),
    });

    if (!upstream.ok) {
      const errText = await upstream.text();
      console.error("Gemini TTS error", upstream.status, errText);
      return NextResponse.json(
        { error: "Gemini TTS error", details: errText.slice(0, 500) },
        { status: upstream.status }
      );
    }

    const data = (await upstream.json()) as {
      candidates?: Array<{
        content?: {
          parts?: Array<{
            inlineData?: { data?: string; mimeType?: string };
          }>;
        };
      }>;
    };
    const part = data.candidates?.[0]?.content?.parts?.[0]?.inlineData;
    const base64Pcm = part?.data;
    const mimeType = part?.mimeType ?? "audio/L16;rate=24000";
    if (!base64Pcm) {
      console.error("Gemini TTS: no audio in response", JSON.stringify(data).slice(0, 400));
      return NextResponse.json(
        { error: "No audio returned by TTS model." },
        { status: 502 }
      );
    }

    // Gemini labels PCM responses like "audio/L16;codec=pcm;rate=24000".
    // Default to 24 kHz if we can't parse.
    const rateMatch = /rate=(\d+)/.exec(mimeType);
    const sampleRate = rateMatch ? parseInt(rateMatch[1], 10) : 24000;

    const pcm = Buffer.from(base64Pcm, "base64");
    const wav = wrapPcmAsWav(pcm, sampleRate, 1, 16);
    return NextResponse.json({
      audio: wav.toString("base64"),
      mime: "audio/wav",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("voice-speak internal error", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Prepend a standard 44-byte PCM WAV header so the browser's <audio> element
// can decode the blob directly. Assumes little-endian PCM, which matches
// what Gemini returns.
function wrapPcmAsWav(
  pcm: Buffer,
  sampleRate: number,
  channels: number,
  bitsPerSample: number
): Buffer {
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;
  const dataSize = pcm.length;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16); // PCM fmt chunk size
  header.writeUInt16LE(1, 20); // format = PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);
  return Buffer.concat([header, pcm]);
}
