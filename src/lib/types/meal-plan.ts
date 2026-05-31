import type { Timestamp } from "firebase/firestore";

// ── Shared types matching food tracking app ──

export interface PlanMealMacros {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  netCarbs?: number;
}

export interface PlanMeal {
  category: string; // "Breakfast" | "Lunch" | "Dinner" | "Snacks"
  mealId: string; // ID in nutrition_meals collection
  mealName: string;
  mealPhoto?: string;
  macros: PlanMealMacros;
  /**
   * Number of servings for this component (e.g. how many you'll plate up).
   * Shared verbatim with the food tracking app, which uses the same field name
   * and the same meaning: macros and shopping quantities scale by
   * `servingAmount / recipe.servings`. Absent ⇒ treat as the recipe's own
   * default servings (×1), identical to single-recipe-per-meal behaviour.
   */
  servingAmount?: number;
}

export interface PlanDay {
  meals: PlanMeal[];
}

export interface PlanWeek {
  days: PlanDay[]; // Index 0-6 for Monday-Sunday
}

export interface PlanGoals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  calculationMode: "grams" | "percentage";
  percentages?: {
    protein: number;
    carbs: number;
    fat: number;
  };
}

export interface PlanTemplate {
  id: string;
  userId: string;
  name: string;
  description?: string;
  weeks: PlanWeek[];
  goals?: PlanGoals;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface PlanInstance {
  id: string;
  userId: string;
  templateId: string;
  templateName: string;
  snapshot: PlanWeek[];
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  status: "active" | "completed" | "ended_early" | "adhoc";
  goals?: PlanGoals;
  endedEarlyNote?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export const MEAL_CATEGORIES = [
  "Breakfast",
  "Lunch",
  "Dinner",
  "Snacks",
] as const;

export const DAYS_OF_WEEK = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;
