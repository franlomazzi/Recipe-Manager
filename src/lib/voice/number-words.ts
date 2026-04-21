const ONES: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  // common STT misrecognitions
  to: 2,
  too: 2,
  for: 4,
};

const TENS: Record<string, number> = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};

export function wordsToNumber(raw: string): number | null {
  if (!raw) return null;
  const cleaned = raw.trim().toLowerCase().replace(/[^a-z0-9\s-]/g, "");
  if (!cleaned) return null;

  const digitMatch = /^(\d+)/.exec(cleaned);
  if (digitMatch) return parseInt(digitMatch[1], 10);

  const tokens = cleaned.split(/[\s-]+/);
  let total = 0;
  let matched = false;
  for (const tok of tokens) {
    if (tok in ONES) {
      total += ONES[tok];
      matched = true;
    } else if (tok in TENS) {
      total += TENS[tok];
      matched = true;
    } else if (tok === "a" || tok === "an") {
      total += 1;
      matched = true;
    } else if (tok === "half") {
      // half only meaningful with a unit multiplier, default to 30s
      total += 0.5;
      matched = true;
    } else if (matched) {
      break;
    }
  }
  return matched ? total : null;
}

const UNIT_RE =
  /(hours?|hrs?|minutes?|mins?|seconds?|secs?)/;

export function parseDurationSeconds(phrase: string): number | null {
  const lower = phrase.toLowerCase();
  // Match sequences like "three minutes", "1 hour 30 minutes", "90 seconds"
  const segmentRe = /([\d.]+|[a-z-]+(?:\s+[a-z-]+)*?)\s*(hours?|hrs?|minutes?|mins?|seconds?|secs?)/g;

  let total = 0;
  let found = false;
  let match: RegExpExecArray | null;
  while ((match = segmentRe.exec(lower)) !== null) {
    const rawQty = match[1].trim();
    const unit = match[2];
    const qty = wordsToNumber(rawQty);
    if (qty === null) continue;
    const mult = unit.startsWith("h") ? 3600 : unit.startsWith("s") ? 1 : 60;
    total += Math.round(qty * mult);
    found = true;
  }

  if (found) return total;

  // Fallback: bare number + no unit → assume minutes
  const bare = wordsToNumber(lower);
  if (bare !== null) return Math.round(bare * 60);

  // Last-ditch: phrase contains unit word but parser didn't match (e.g. "one minute")
  const unitMatch = UNIT_RE.exec(lower);
  if (unitMatch) {
    const before = lower.slice(0, unitMatch.index).trim();
    const qty = wordsToNumber(before);
    if (qty !== null) {
      const unit = unitMatch[1];
      const mult = unit.startsWith("h") ? 3600 : unit.startsWith("s") ? 1 : 60;
      return Math.round(qty * mult);
    }
  }

  return null;
}
