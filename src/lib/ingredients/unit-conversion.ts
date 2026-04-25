"use client";

import { getAuth } from "@/lib/firebase/config";
import { saveIngredientToLibrary } from "@/lib/firebase/ingredient-library";
import type { LibraryIngredient, Ingredient } from "@/lib/types/recipe";

// Mirrors the same helpers in src/lib/server/recipe-parsers/unit-convert.ts
// so audit notes use the same format on both import-time and save-time paths.
function roundForDisplay(value: number): number {
  if (value >= 100) return Math.round(value / 5) * 5;
  if (value >= 10) return Math.round(value);
  return Math.round(value * 10) / 10;
}

function formatOriginal(q: number): string {
  return q % 1 === 0 ? String(q) : q.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

export type ConversionResult = { factor: number; targetUnit: string };

/**
 * Returns a cached conversion factor for `fromUnit → libraryItem.servingUnit`,
 * calling the AI endpoint on the first miss and persisting the result on the
 * LibraryIngredient so subsequent calls are instant.
 *
 * Returns `null` when AI confidence is low or the call fails — callers should
 * leave the ingredient unconverted in that case.
 */
export async function getOrFetchConversion(
  userId: string,
  libraryItem: LibraryIngredient,
  fromUnit: string
): Promise<ConversionResult | null> {
  const toUnit = libraryItem.servingUnit;
  if (!toUnit || fromUnit === toUnit) return null;

  const cached = libraryItem.unitConversions?.[fromUnit];
  if (cached) return cached;

  const currentUser = getAuth().currentUser;
  if (!currentUser) return null;

  let idToken: string;
  try {
    idToken = await currentUser.getIdToken();
  } catch {
    return null;
  }

  let factor: number;
  try {
    const response = await fetch("/api/convert-unit", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        ingredientName: libraryItem.name,
        brand: libraryItem.brand,
        fromUnit,
        toUnit,
      }),
    });

    if (!response.ok) return null;

    const data = (await response.json()) as { factor?: number };
    if (!data.factor || data.factor <= 0) return null;
    factor = data.factor;
  } catch {
    return null;
  }

  const conversion: ConversionResult = { factor, targetUnit: toUnit };

  // Persist to library so this path is never taken again for this ingredient+unit pair.
  try {
    await saveIngredientToLibrary(userId, {
      ...libraryItem,
      unitConversions: {
        ...libraryItem.unitConversions,
        [fromUnit]: conversion,
      },
    });
  } catch {
    // Cache write failure is non-fatal — we already have the factor.
  }

  return conversion;
}

/**
 * Apply a unit conversion to a recipe ingredient, returning the updated
 * ingredient with converted quantity/unit and an audit note ("was 0.25 tsp").
 */
export function applyConversion(
  ingredient: Ingredient,
  conversion: ConversionResult
): Ingredient {
  if (ingredient.quantity == null) {
    return { ...ingredient, unit: conversion.targetUnit };
  }

  const converted = roundForDisplay(ingredient.quantity * conversion.factor);
  const audit = `was ${formatOriginal(ingredient.quantity)} ${ingredient.unit}`;
  const note = ingredient.note?.trim()
    ? `${ingredient.note} (${audit})`
    : audit;

  return {
    ...ingredient,
    quantity: converted,
    unit: conversion.targetUnit,
    note,
  };
}
