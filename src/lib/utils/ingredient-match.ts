// Fuzzy match for the imported-recipe review step: given an AI-produced
// ingredient name, surface the best existing library candidates so the user
// can confirm a mapping instead of accidentally creating a duplicate library
// entry. Intentionally lightweight — we're ranking for a visible list, not
// auto-picking.

import type { LibraryIngredient } from "@/lib/types/recipe";

// Lowercase, drop parenthetical asides ("(cold)"), collapse whitespace, trim,
// strip a trailing plural 's'. Crude on purpose: stemming libraries are
// overkill for personal recipe data.
export function normalizeIngredientName(name: string): string {
  const cleaned = name
    .toLowerCase()
    .replace(/\([^)]*\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.endsWith("s") ? cleaned.slice(0, -1) : cleaned;
}

export interface IngredientMatch {
  item: LibraryIngredient;
  // 1.0 exact normalized match, 0.7 prefix overlap, 0.5 substring overlap.
  score: number;
}

export function findLibraryMatches(
  name: string,
  library: LibraryIngredient[],
  limit = 5
): IngredientMatch[] {
  const n = normalizeIngredientName(name);
  if (!n) return [];

  const scored: IngredientMatch[] = [];
  for (const item of library) {
    const ln = normalizeIngredientName(item.name);
    if (!ln) continue;
    let score = 0;
    if (ln === n) score = 1;
    else {
      // Partial overlap only makes sense when both sides have enough
      // characters to mean something. Without this guard a library
      // ingredient literally named "e" substring-matches every other
      // ingredient because "e" is in "pepper", "butter", "onion", etc.
      const shorter = Math.min(n.length, ln.length);
      if (shorter >= 3) {
        if (ln.startsWith(n) || n.startsWith(ln)) score = 0.7;
        else if (ln.includes(n) || n.includes(ln)) score = 0.5;
      }
    }
    if (score > 0) scored.push({ item, score });
  }
  scored.sort(
    (a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name)
  );
  return scored.slice(0, limit);
}
