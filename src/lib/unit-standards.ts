// Shared ingredient unit vocabulary. The canonical list is owned by the food
// tracking app at C:\My food tracking app\src\services\standardsService.ts and
// persisted per-user in Firestore at user_preferences/{uid}_unit_standards.
//
// This module reads AND writes that list. Keep DEFAULT_STANDARDS in sync with
// the tracking app's DEFAULT_STANDARDS — no shared package, so duplication is
// intentional.

import { doc, getDoc, setDoc } from "firebase/firestore";
import { getDb, type AccountKey } from "@/lib/firebase/config";

export interface UnitStandards {
  authorizedUnits: string[];
  aliases: Record<string, string>;
}

// Mirror of C:\My food tracking app\src\services\standardsService.ts DEFAULT_STANDARDS.
export const DEFAULT_STANDARDS: UnitStandards = {
  authorizedUnits: [
    "g",
    "kg",
    "ml",
    "l",
    "tsp",
    "tbsp",
    "cup",
    "oz",
    "lb",
    "unit",
    "portion",
  ],
  aliases: {
    // Weight
    grams: "g",
    gram: "g",
    gramme: "g",
    grammes: "g",
    gr: "g",
    kilogram: "kg",
    kilograms: "kg",
    ounce: "oz",
    ounces: "oz",
    pound: "lb",
    pounds: "lb",
    // Volume
    milliliter: "ml",
    milliliters: "ml",
    millilitre: "ml",
    millilitres: "ml",
    milli: "ml",
    liter: "l",
    liters: "l",
    litre: "l",
    litres: "l",
    cups: "cup",
    // Spoons
    tablespoon: "tbsp",
    tablespoons: "tbsp",
    teaspoon: "tsp",
    teaspoons: "tsp",
    // Count
    piece: "unit",
    pieces: "unit",
    pcs: "unit",
    pc: "unit",
    slice: "unit",
    slices: "unit",
    clove: "unit",
    cloves: "unit",
    portions: "portion",
  },
};

/**
 * Display order for the dropdown, grouped by family (weight → volume → spoon
 * → count). Labels pair the canonical code with a human hint where useful.
 */
export const UNIT_OPTIONS: { value: string; label: string }[] = [
  { value: "g", label: "g (grams)" },
  { value: "kg", label: "kg (kilograms)" },
  { value: "ml", label: "ml (milliliters)" },
  { value: "l", label: "l (liters)" },
  { value: "tsp", label: "tsp" },
  { value: "tbsp", label: "tbsp" },
  { value: "cup", label: "cup" },
  { value: "oz", label: "oz" },
  { value: "lb", label: "lb" },
  { value: "unit", label: "unit (piece/slice)" },
  { value: "portion", label: "portion" },
];

let cached: UnitStandards | null = null;

/**
 * Fetch the user's authorized unit list from Firestore (written by the food
 * tracking app) and merge it into the bundled defaults. The recipe app never
 * writes — if the doc is missing or errors, fall back to DEFAULT_STANDARDS.
 *
 * Call once per session, after sign-in. Safe to call again to refresh.
 * Pass `accountKey` explicitly to avoid any timing ambiguity during account switches.
 */
export async function loadUnitStandards(userId: string, accountKey?: AccountKey): Promise<UnitStandards> {
  try {
    const ref = doc(getDb(accountKey), "user_preferences", `${userId}_unit_standards`);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const stored = snap.data() as UnitStandards;
      cached = {
        authorizedUnits: Array.from(
          new Set([
            ...DEFAULT_STANDARDS.authorizedUnits,
            ...(stored.authorizedUnits ?? []),
          ])
        ),
        // User overrides win over defaults.
        aliases: { ...DEFAULT_STANDARDS.aliases, ...(stored.aliases ?? {}) },
      };
    } else {
      cached = DEFAULT_STANDARDS;
    }
  } catch (e) {
    console.error("Failed to load unit standards, using defaults:", e);
    cached = DEFAULT_STANDARDS;
  }
  return cached;
}

export function getCachedStandards(): UnitStandards {
  return cached ?? DEFAULT_STANDARDS;
}

/**
 * Normalize a free-text unit to its canonical form. Lowercases, trims, then
 * checks the authorized list, then the alias map. Returns the original
 * (lowercased) string if neither matches — callers can still render legacy
 * values without dropping them.
 */
export function normalizeUnit(
  input: string,
  std: UnitStandards = getCachedStandards()
): string {
  const k = input.toLowerCase().trim();
  if (!k) return "";
  if (std.authorizedUnits.includes(k)) return k;
  return std.aliases[k] ?? k;
}

export function isCanonicalUnit(
  input: string,
  std: UnitStandards = getCachedStandards()
): boolean {
  return std.authorizedUnits.includes(input.toLowerCase().trim());
}

/**
 * Human-readable labels for the well-known built-in units. User-added units
 * won't have an entry here and display as-is.
 */
export const UNIT_LABELS: Record<string, string> = {
  g: "g (grams)",
  kg: "kg (kilograms)",
  ml: "ml (milliliters)",
  l: "l (liters)",
  tsp: "tsp",
  tbsp: "tbsp",
  cup: "cup",
  oz: "oz",
  lb: "lb",
  unit: "unit (piece/slice)",
  portion: "portion",
};

/**
 * Build the full list of unit options for the dropdown, merging the fixed
 * UNIT_OPTIONS with any user-added units from the standards cache.
 */
export function getUnitOptions(): { value: string; label: string }[] {
  const std = getCachedStandards();
  const builtInValues = new Set(UNIT_OPTIONS.map((o) => o.value));
  const userAdded = std.authorizedUnits.filter((u) => !builtInValues.has(u));
  return [
    ...UNIT_OPTIONS,
    ...userAdded.map((u) => ({ value: u, label: UNIT_LABELS[u] ?? u })),
  ];
}

/**
 * Read the raw stored standards (pre-merge) for a user. The settings UI edits
 * this directly so the user's overrides stay separate from DEFAULT_STANDARDS.
 * Returns an empty standards object if the doc is missing.
 */
async function readStoredStandards(userId: string, accountKey?: AccountKey): Promise<UnitStandards> {
  const ref = doc(getDb(accountKey), "user_preferences", `${userId}_unit_standards`);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    const data = snap.data() as Partial<UnitStandards>;
    return {
      authorizedUnits: data.authorizedUnits ?? [],
      aliases: data.aliases ?? {},
    };
  }
  return { authorizedUnits: [], aliases: {} };
}

/**
 * Merge DEFAULT_STANDARDS + stored overrides into the in-memory cache.
 * Mirrors the tracking app's getUnitStandards behavior: defaults always
 * re-appear, so removing a default locally is effectively a no-op.
 */
function refreshCache(stored: UnitStandards): UnitStandards {
  cached = {
    authorizedUnits: Array.from(
      new Set([
        ...DEFAULT_STANDARDS.authorizedUnits,
        ...stored.authorizedUnits,
      ])
    ),
    aliases: { ...DEFAULT_STANDARDS.aliases, ...stored.aliases },
  };
  return cached;
}

/**
 * Expose the raw stored standards to the settings editor so delete controls
 * operate on the user's own entries, not the baked-in defaults.
 */
export async function loadUserStandards(userId: string, accountKey?: AccountKey): Promise<UnitStandards> {
  return readStoredStandards(userId, accountKey);
}

/**
 * Write a full standards object for the user and refresh the in-memory cache.
 * Both apps merge DEFAULT_STANDARDS back in on read, so the stored doc only
 * needs to hold the user's additions/overrides.
 */
export async function updateUnitStandards(
  userId: string,
  std: UnitStandards,
  accountKey?: AccountKey
): Promise<UnitStandards> {
  const clean: UnitStandards = {
    authorizedUnits: Array.from(
      new Set(
        std.authorizedUnits.map((u) => u.toLowerCase().trim()).filter(Boolean)
      )
    ),
    aliases: Object.fromEntries(
      Object.entries(std.aliases)
        .map(
          ([k, v]) => [k.toLowerCase().trim(), v.toLowerCase().trim()] as const
        )
        .filter(([k, v]) => k && v)
    ),
  };
  await setDoc(
    doc(getDb(accountKey), "user_preferences", `${userId}_unit_standards`),
    clean,
    { merge: true }
  );
  refreshCache(clean);
  return clean;
}

/**
 * Add a new authorized unit to the shared Firestore doc so both the recipe
 * app and the food tracking app see it. Also updates the in-memory cache.
 */
export async function addAuthorizedUnit(
  userId: string,
  unit: string,
  accountKey?: AccountKey
): Promise<void> {
  const normalized = unit.toLowerCase().trim();
  if (!normalized) return;

  const std = getCachedStandards();
  if (std.authorizedUnits.includes(normalized)) return; // already exists

  const stored = await readStoredStandards(userId, accountKey);
  if (!stored.authorizedUnits.includes(normalized)) {
    stored.authorizedUnits.push(normalized);
  }
  await setDoc(
    doc(getDb(accountKey), "user_preferences", `${userId}_unit_standards`),
    stored,
    { merge: true }
  );
  refreshCache(stored);
}
