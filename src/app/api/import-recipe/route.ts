import { NextResponse } from "next/server";
import { verifyAuthorizedCaller } from "@/lib/firebase/admin";
import {
  parseRecipeFromText,
  parseRecipeFromYouTube,
  parseRecipeFromUrl,
  parseRecipeFromImage,
  GeminiParseError,
} from "@/lib/server/recipe-parsers/gemini-parse";
import { normalizeYouTubeUrl } from "@/lib/server/recipe-parsers/youtube-url";
import type { ImportSource } from "@/lib/types/import";

// POST /api/import-recipe
//
// AUTH: identical to /api/generate-recipe-image — requires a Firebase ID
// token whose uid is on the whitelist in src/lib/firebase/admin.ts. This
// gates all Gemini quota burn.
//
// PAYLOAD: { source: ImportSource } — one of text, youtube, url, image.
// The Gemini API key never leaves the server.

// Hard limit on request body size. Bumped to 12 MB so the image source has
// headroom — base64 inflation gives a 12MB body roughly 8-9MB of raw image,
// which is plenty for phone photos without being extravagant. Text/URL/YT
// sources will never come close to this.
const MAX_BODY_BYTES = 12 * 1024 * 1024;

export async function POST(req: Request) {
  try {
    await verifyAuthorizedCaller(req);
  } catch (err) {
    const status = (err as { status?: number }).status ?? 401;
    const message = err instanceof Error ? err.message : "Unauthorized";
    return NextResponse.json({ error: message }, { status });
  }

  const contentLength = Number(req.headers.get("content-length") ?? "0");
  if (contentLength > MAX_BODY_BYTES) {
    return NextResponse.json(
      { error: "Content too large to import." },
      { status: 413 }
    );
  }

  let payload: { source?: ImportSource };
  try {
    payload = (await req.json()) as { source?: ImportSource };
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  const source = payload.source;
  if (!source || typeof source !== "object" || !("type" in source)) {
    return NextResponse.json(
      { error: "Missing source." },
      { status: 400 }
    );
  }

  try {
    if (source.type === "text") {
      const draft = await parseRecipeFromText({ text: source.text });
      return NextResponse.json({ draft });
    }

    if (source.type === "youtube") {
      const canonical = normalizeYouTubeUrl(source.url ?? "");
      if (!canonical) {
        return NextResponse.json(
          {
            error:
              "That doesn't look like a YouTube URL. Paste a link from youtube.com or youtu.be.",
          },
          { status: 400 }
        );
      }
      const draft = await parseRecipeFromYouTube({ url: canonical });
      return NextResponse.json({ draft });
    }

    if (source.type === "url") {
      const draft = await parseRecipeFromUrl({ url: source.url ?? "" });
      return NextResponse.json({ draft });
    }

    if (source.type === "image") {
      const draft = await parseRecipeFromImage({
        imageBase64: source.imageBase64 ?? "",
        mimeType: source.mimeType ?? "",
      });
      return NextResponse.json({ draft });
    }

    // Exhaustiveness guard — if a future ImportSource variant lands without
    // a handler, the client gets a clean error instead of a silent hang.
    return NextResponse.json(
      {
        error: `Source type "${(source as { type: string }).type}" is not supported yet.`,
      },
      { status: 400 }
    );
  } catch (err) {
    if (err instanceof GeminiParseError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const message =
      err instanceof Error ? err.message : "Import failed unexpectedly.";
    console.error("import-recipe internal error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
