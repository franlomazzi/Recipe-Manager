import { NextResponse } from "next/server";
import { verifyAuthorizedCaller } from "@/lib/firebase/admin";

// Server-side only — proxy to Google Gemini Imagen 4.0 to keep the API key
// off the client. Mirrors the food tracking app's /api/generate-meal-image
// route so we share the same key, model, and response shape.
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

    const apiKey = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY;
    if (!apiKey) {
      console.error("generate-recipe-image: GEMINI_API_KEY is not configured");
      return NextResponse.json(
        { error: "AI photo generation is not configured on the server." },
        { status: 500 }
      );
    }

    const prompt =
      customPrompt && customPrompt.trim()
        ? customPrompt.trim()
        : `A professional, high-quality food photography shot of ${title}. Delicious, appetizing, cinematic lighting, gourmet presentation.`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${apiKey}`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        instances: [{ prompt }],
        parameters: {
          sampleCount: 1,
          aspectRatio: "1:1",
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

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    console.error("generate-recipe-image internal error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
