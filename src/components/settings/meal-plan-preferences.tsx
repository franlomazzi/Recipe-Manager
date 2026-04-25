"use client";

import { useAuth } from "@/lib/contexts/auth-context";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { UtensilsCrossed } from "lucide-react";
import { MEAL_CATEGORIES } from "@/lib/types/meal-plan";
import { useMealPlanPrefs } from "@/lib/hooks/use-meal-plan-prefs";

const CATEGORY_EMOJI: Record<string, string> = {
  Breakfast: "🌅",
  Lunch: "☀️",
  Dinner: "🌙",
  Snacks: "🍿",
};

export function MealPlanPreferences() {
  const { user } = useAuth();
  const { forceShow, toggleForceShow } = useMealPlanPrefs();

  if (!user) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UtensilsCrossed className="h-5 w-5 text-primary" />
          Meal Plan
        </CardTitle>
        <CardDescription>
          Empty meal rows are hidden automatically. Toggle a row on to keep it
          visible even when nothing is planned — useful when you&apos;re about
          to start filling in that meal.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {MEAL_CATEGORIES.map((category) => (
          <div
            key={category}
            className="flex items-center justify-between rounded-lg border border-border px-4 py-3"
          >
            <div className="flex items-center gap-2">
              <span className="text-lg leading-none">{CATEGORY_EMOJI[category]}</span>
              <span className="text-sm font-medium">{category}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {forceShow.has(category) ? "Always show" : "Auto"}
              </span>
              <Switch
                checked={forceShow.has(category)}
                onCheckedChange={(checked) => toggleForceShow(category, checked)}
              />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
