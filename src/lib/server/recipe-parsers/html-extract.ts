// Convert fetched HTML into something we can hand to Gemini. Two strategies
// in priority order:
//
//  1. schema.org Recipe JSON-LD. Most food blogs and recipe sites publish it
//     (NYT Cooking, Bon Appetit, Allrecipes, Serious Eats, food blogs using
//     WP Recipe Maker / Tasty / Create, etc.). When present it's clean,
//     structured, and cheap to parse. We still route it through Gemini
//     afterwards because JSON-LD ingredient strings come as free text
//     ("1 1/2 cups flour, sifted") — Gemini does that splitting better than
//     a regex would.
//
//  2. Fallback: strip the HTML to visible text. Aggressive — drops head,
//     scripts, styles, nav, footer, iframes, forms, aside. Gemini handles
//     the remaining ad copy fine.

export interface ExtractedContent {
  /** The text / JSON string we pass to Gemini. */
  source: string;
  /** Whether the content was structured (JSON-LD) or loose text. For logs. */
  kind: "json-ld" | "text";
}

type UnknownObj = Record<string, unknown>;

export function extractRecipeContent(html: string): ExtractedContent {
  const jsonLd = findRecipeJsonLd(html);
  if (jsonLd) {
    return { source: JSON.stringify(jsonLd, null, 2), kind: "json-ld" };
  }
  return { source: htmlToText(html), kind: "text" };
}

// -------------------------------------------------------------------------
// JSON-LD
// -------------------------------------------------------------------------

function findRecipeJsonLd(html: string): UnknownObj | null {
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const block = m[1];
    let data: unknown;
    try {
      data = JSON.parse(block);
    } catch {
      continue;
    }
    const found = findRecipeNode(data);
    if (found) return found;
  }
  return null;
}

function findRecipeNode(node: unknown): UnknownObj | null {
  if (!node) return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findRecipeNode(item);
      if (found) return found;
    }
    return null;
  }
  if (typeof node !== "object") return null;
  const obj = node as UnknownObj;
  if (isRecipeType(obj["@type"])) return obj;
  // Sites using schema.org/@graph wrap multiple entities in an array.
  const graph = obj["@graph"];
  if (Array.isArray(graph)) {
    for (const item of graph) {
      const found = findRecipeNode(item);
      if (found) return found;
    }
  }
  return null;
}

function isRecipeType(t: unknown): boolean {
  if (typeof t === "string") return t === "Recipe";
  if (Array.isArray(t)) return t.some((x) => x === "Recipe");
  return false;
}

// -------------------------------------------------------------------------
// HTML → text fallback
// -------------------------------------------------------------------------

const DROP_TAGS = [
  "head",
  "script",
  "style",
  "svg",
  "noscript",
  "iframe",
  "nav",
  "footer",
  "aside",
  "form",
  "template",
];

function htmlToText(html: string): string {
  let t = html;
  for (const tag of DROP_TAGS) {
    const re = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?</${tag}>`, "gi");
    t = t.replace(re, " ");
  }
  // Self-closing or orphan tags of the same set (rare but cheap to cover).
  for (const tag of DROP_TAGS) {
    t = t.replace(new RegExp(`<${tag}\\b[^>]*/?>`, "gi"), " ");
  }
  // Replace block-level closers with a newline to preserve paragraph breaks
  // before we strip remaining tags — makes the flattened text readable.
  t = t.replace(
    /<\/(p|div|li|ul|ol|h[1-6]|br|tr|section|article)\s*>/gi,
    "\n"
  );
  // Strip every remaining tag.
  t = t.replace(/<[^>]+>/g, " ");
  // Decode the handful of entities that actually matter for recipe text.
  t = t
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&frac12;/g, "1/2")
    .replace(/&frac14;/g, "1/4")
    .replace(/&frac34;/g, "3/4")
    .replace(/&#x27;/g, "'");
  // Collapse whitespace per line, then collapse runs of blank lines.
  t = t
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
  return t;
}
