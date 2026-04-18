// YouTube URL validator. We're handing the URL to Gemini which will fetch
// the video on our behalf, so we don't have SSRF concerns — but we DO want
// to reject random URLs that would just make Gemini fail with a confusing
// error. Accept only canonical YouTube hostnames and known video paths.

const ALLOWED_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
]);

export function normalizeYouTubeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return null;
  }

  const host = parsed.hostname.toLowerCase();
  if (!ALLOWED_HOSTS.has(host)) return null;

  // youtu.be/<id> — the id is the first path segment.
  if (host === "youtu.be") {
    const id = parsed.pathname.split("/").filter(Boolean)[0];
    if (!id) return null;
    return `https://www.youtube.com/watch?v=${id}`;
  }

  // youtube.com/watch?v=<id>
  if (parsed.pathname === "/watch") {
    const id = parsed.searchParams.get("v");
    if (!id) return null;
    return `https://www.youtube.com/watch?v=${id}`;
  }

  // youtube.com/shorts/<id>
  const shortsMatch = parsed.pathname.match(/^\/shorts\/([^/]+)/);
  if (shortsMatch) {
    return `https://www.youtube.com/watch?v=${shortsMatch[1]}`;
  }

  // youtube.com/embed/<id>
  const embedMatch = parsed.pathname.match(/^\/embed\/([^/]+)/);
  if (embedMatch) {
    return `https://www.youtube.com/watch?v=${embedMatch[1]}`;
  }

  return null;
}
