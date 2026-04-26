// Gemini responseSchema for structured recipe extraction. Uses the OpenAPI
// 3.0 subset Gemini accepts. Enums are sourced from the same constants the
// app uses elsewhere so the model can never produce values the UI can't
// render.

import {
  RECIPE_CATEGORIES,
  CUISINE_TAGS,
  DIET_TAGS,
} from "@/lib/types/recipe";
import { DEFAULT_STANDARDS } from "@/lib/unit-standards";

const INGREDIENT_CATEGORIES = [
  "produce",
  "dairy",
  "meat",
  "seafood",
  "bakery",
  "pantry",
  "frozen",
  "spices",
  "condiments",
  "beverages",
  "other",
] as const;

const ALL_CATEGORY_TAGS = [
  ...RECIPE_CATEGORIES,
  ...CUISINE_TAGS,
  ...DIET_TAGS,
];

export const RECIPE_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    title: {
      type: "STRING",
      description: "Recipe name. Required. Max ~80 chars.",
    },
    description: {
      type: "STRING",
      description:
        "1-3 sentence summary of the dish. Empty string if the source has none.",
    },
    prepTime: {
      type: "INTEGER",
      description:
        "Prep time in whole minutes. 0 if the source does not specify.",
    },
    cookTime: {
      type: "INTEGER",
      description:
        "Cook time in whole minutes. 0 if the source does not specify.",
    },
    servings: {
      type: "INTEGER",
      description:
        "Number of servings the recipe yields. Default to 4 if unknown.",
    },
    difficulty: {
      type: "STRING",
      enum: ["easy", "medium", "hard"],
      description:
        'Inferred from technique and ingredient count. Default "medium".',
    },
    categories: {
      type: "ARRAY",
      description:
        "0-4 tags chosen only from the provided enum. Combine meal type, cuisine, and dietary tags where they apply.",
      items: {
        type: "STRING",
        enum: ALL_CATEGORY_TAGS,
      },
    },
    notes: {
      type: "STRING",
      description:
        "Any tips, storage advice, substitutions, or warnings worth preserving. Empty string if none.",
    },
    ingredients: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          quantity: {
            type: "NUMBER",
            description:
              "Numeric quantity in the given unit. Use 0 when unmeasured (e.g. 'salt to taste'). Convert fractions to decimals (1/2 -> 0.5).",
          },
          unit: {
            type: "STRING",
            enum: DEFAULT_STANDARDS.authorizedUnits,
            description:
              "Canonical unit code. Use 'unit' for counted items without a weight/volume unit (e.g. '3 eggs' -> quantity=3 unit='unit'). Prefer metric when the source gives both.",
          },
          name: {
            type: "STRING",
            description:
              "Plain ingredient name only, lowercase, no quantity or prep (e.g. 'garlic', not '2 cloves minced garlic'). Prep goes in 'note'.",
          },
          category: {
            type: "STRING",
            enum: INGREDIENT_CATEGORIES,
          },
          note: {
            type: "STRING",
            description:
              "Prep instruction or qualifier like 'finely chopped', 'room temperature', 'optional'. Empty string if none.",
          },
        },
        required: ["quantity", "unit", "name", "category", "note"],
      },
    },
    steps: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          order: { type: "INTEGER" },
          instruction: {
            type: "STRING",
            description:
              "One cooking step. Keep imperative and concise. Include explicit timings (e.g. 'simmer for 10 minutes') in the text — the timer fields below duplicate that signal in structured form.",
          },
          timerMinutes: {
            type: "INTEGER",
            description:
              "If the step has an explicit, bounded cooking time (e.g. 'bake for 30 minutes', 'simmer 10-12 minutes'), set this to the duration in whole minutes. For ranges, use the upper bound so the cook isn't caught short. Use 0 when the step has no explicit time or only vague cues like 'until golden', 'to taste', 'overnight'. Do NOT guess — only set when the source gives a number.",
          },
          timerLabel: {
            type: "STRING",
            description:
              "Short label for the timer, 1-3 words, imperative verb preferred (e.g. 'Simmer', 'Bake', 'Rest', 'Proof'). Empty string when timerMinutes is 0.",
          },
        },
        required: ["order", "instruction", "timerMinutes", "timerLabel"],
      },
    },
    detectedLanguage: {
      type: "STRING",
      enum: ["en", "es", "other"],
      description:
        "Primary language of the recipe text. 'en' for English, 'es' for Spanish, 'other' for anything else.",
    },
  },
  required: [
    "title",
    "description",
    "prepTime",
    "cookTime",
    "servings",
    "difficulty",
    "categories",
    "notes",
    "ingredients",
    "steps",
    "detectedLanguage",
  ],
} as const;

export const SYSTEM_PROMPT = `You convert raw recipe content (pasted text, webpages, images, or videos) into a strict JSON recipe for a personal cooking app. Follow these rules:

- Extract only what the source supports. Never invent ingredients, quantities, or steps.
- If the source is not a recipe, return a schema-valid response with an empty ingredients array and steps array so the caller can detect it.
- Normalize units to the allowed enum. Convert grams of weight to 'g', milliliters to 'ml', etc. If the source gives both metric and imperial, prefer metric.
- Split compound ingredient lines like '2 cups flour, sifted' into quantity=2, unit='cup', name='flour', note='sifted'.
- Steps should read as imperative cooking actions. Preserve any explicit timings in the step text, and mirror them in the structured timerMinutes / timerLabel fields. Only set timerMinutes when the source names a concrete duration — leave it at 0 for vague cues like "until golden", "to taste", or "overnight". For ranges like "10-12 minutes", use the upper bound.
- Use 0 for unknown times and 4 for unknown servings. Do not leave numbers blank.
- Set detectedLanguage to the primary language of the recipe text: 'en' for English, 'es' for Spanish, or 'other' for anything else.`;
