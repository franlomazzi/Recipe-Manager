import { NextResponse } from "next/server";
import { verifyAuthorizedCaller } from "@/lib/firebase/admin";
import { getGeminiApiKey } from "@/lib/server/gemini-key";

// Server-side only — proxy to Google's Gemini image-generation model to keep
// the API key off the client.
//
// Migrated off Imagen 4.0 (deprecated, shuts down 2026-08-17) to
// gemini-2.5-flash-image, which uses the :generateContent endpoint and returns
// the image as inlineData base64 (PNG) rather than Imagen's predictions[].
// We extract it and return a flat { image, mimeType } shape to the client.
//
// AUTH: every request must carry a valid Firebase ID token in the
// `Authorization: Bearer <token>` header, AND the token's uid must be in the
// whitelist defined in src/lib/firebase/admin.ts. This stops random callers
// from burning our Gemini quota even if they discover the URL.
export async function POST(req: Request) {
  // 1. Authenticate the caller before doing anything else.
  try {
    await verifyAuthorizedCaller(req);
  } catch (err) {
    const status = (err as { status?: number }).status ?? 401;
    const message = err instanceof Error ? err.message : "Unauthorized";
    return NextResponse.json({ error: message }, { status });
  }

  try {
    const { title, prompt: customPrompt } = (await req.json()) as {
      title?: string;
      prompt?: string;
    };

    if (!title || !title.trim()) {
      return NextResponse.json(
        { error: "Recipe title is required to generate a photo." },
        { status: 400 }
      );
    }

    const apiKey = await getGeminiApiKey();

    const prompt =
      customPrompt && customPrompt.trim()
        ? customPrompt.trim()
        : `A professional, high-quality food photography shot of ${title}. Delicious, appetizing, cinematic lighting, gourmet presentation.`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseModalities: ["TEXT", "IMAGE"],
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gemini API error:", response.status, errorText);
      try {
        const errorData = JSON.parse(errorText);
        return NextResponse.json(errorData, { status: response.status });
      } catch {
        return NextResponse.json(
          { error: "Gemini API error", details: errorText },
          { status: response.status }
        );
      }
    }

    const data = (await response.json()) as {
      candidates?: Array<{
        content?: {
          parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }>;
        };
      }>;
    };
    // The model can return both a text part and an image part — pick the image.
    const imgPart = data.candidates?.[0]?.content?.parts?.find(
      (p) => p.inlineData?.data
    )?.inlineData;
    if (!imgPart?.data) {
      console.error(
        "gemini image: no image in response",
        JSON.stringify(data).slice(0, 400)
      );
      return NextResponse.json(
        { error: "The AI returned no image. Try again." },
        { status: 502 }
      );
    }
    return NextResponse.json({
      image: imgPart.data,
      mimeType: imgPart.mimeType ?? "image/png",
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    console.error("generate-recipe-image internal error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
