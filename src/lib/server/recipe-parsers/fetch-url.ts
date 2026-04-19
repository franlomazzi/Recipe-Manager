// Safe-ish server-side URL fetcher for the recipe import flow. "Safe-ish"
// because the endpoint is already gated to the whitelisted uid set, so this
// isn't protecting the internet from us — it's protecting us from fat-finger
// URLs pointed at internal metadata services or the filesystem.
//
// If the user base ever grows beyond the two of us, revisit this with real
// DNS-rebinding protection: resolve the hostname ourselves, check against
// private ranges, and pass the resolved IP into the fetch via a custom
// connect hook (node:undici's `connect` option).

export class UrlFetchError extends Error {
  status: number;
  constructor(message: string, status = 500) {
    super(message);
    this.status = status;
  }
}

// 3 MB. Long-form food blogs with inline images in the HTML can be huge;
// 3 MB catches the content without letting a pathological page eat memory.
const MAX_BYTES = 3_000_000;
const TIMEOUT_MS = 15_000;

// Identify ourselves so recipe sites that look at UA don't 403 us. Don't
// impersonate a browser — some sites ratelimit non-browser traffic harder,
// but honesty is worth more than the occasional block.
const USER_AGENT = "MyRecipeManager/1.0 (+personal recipe importer)";

// Obvious private / loopback names. Not comprehensive — a malicious hostname
// whose DNS resolves to a private IP would slip through — but for a two-user
// personal app it catches the realistic accidents.
function isForbiddenHost(host: string): boolean {
  const h = host.toLowerCase();
  if (h === "localhost" || h === "127.0.0.1" || h === "::1" || h === "0.0.0.0") return true;
  if (/^10\./.test(h)) return true;
  if (/^192\.168\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  if (/^169\.254\./.test(h)) return true; // link-local — AWS/GCP metadata lives here
  if (h.endsWith(".local") || h.endsWith(".internal")) return true;
  return false;
}

export function normalizeImportUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  if (isForbiddenHost(parsed.hostname)) return null;
  return parsed.toString();
}

export interface FetchedPage {
  html: string;
  /** URL after redirects — use this for source attribution. */
  finalUrl: string;
}

export async function fetchRecipePage(url: string): Promise<FetchedPage> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "fetch failed";
    throw new UrlFetchError(`Couldn't reach that page: ${msg}`, 502);
  }

  if (!response.ok) {
    throw new UrlFetchError(
      `That page returned ${response.status}. Try another URL.`,
      502
    );
  }

  // Re-check the redirected host — a site could 302 to something internal.
  if (isForbiddenHost(new URL(response.url).hostname)) {
    throw new UrlFetchError("That URL redirects somewhere we won't follow.", 400);
  }

  // Streaming read with byte cap. Avoids pulling a 100MB page into memory.
  const reader = response.body?.getReader();
  if (!reader) {
    throw new UrlFetchError("That page returned no content.", 502);
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > MAX_BYTES) {
      try { await reader.cancel(); } catch { /* ignore */ }
      throw new UrlFetchError("That page is too large to import.", 413);
    }
    chunks.push(value);
  }

  const buf = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    buf.set(c, offset);
    offset += c.length;
  }
  const html = new TextDecoder("utf-8", { fatal: false }).decode(buf);
  return { html, finalUrl: response.url };
}
