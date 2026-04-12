"use client";

import { useState } from "react";
import { useAuth } from "@/lib/contexts/auth-context";
import { useRecipes } from "@/lib/hooks/use-recipes";
import { saveTemplate } from "@/lib/firebase/meal-plans";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Plus,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { MealPickerDialog } from "./meal-picker-dialog";
import type {
  PlanTemplate,
  PlanWeek,
  PlanDay,
  PlanMeal,
} from "@/lib/types/meal-plan";
import { MEAL_CATEGORIES, DAYS_OF_WEEK } from "@/lib/types/meal-plan";

interface TemplateEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template?: PlanTemplate;
  onSaved?: () => void;
}

function createEmptyDay(): PlanDay {
  return { meals: [] };
}

function createEmptyWeek(): PlanWeek {
  return { days: Array.from({ length: 7 }, createEmptyDay) };
}

export function TemplateEditor({
  open,
  onOpenChange,
  template,
  onSaved,
}: TemplateEditorProps) {
  const { user } = useAuth();
  const { recipes } = useRecipes();
  const isEditing = !!template;

  const [name, setName] = useState(template?.name ?? "");
  const [description, setDescription] = useState(template?.description ?? "");
  const [weeks, setWeeks] = useState<PlanWeek[]>(
    template?.weeks?.length ? template.weeks : [createEmptyWeek()]
  );
  const [currentWeekIdx, setCurrentWeekIdx] = useState(0);
  const [saving, setSaving] = useState(false);

  // Meal picker state
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<{
    dayIndex: number;
    category: string;
  } | null>(null);

  const currentWeek = weeks[currentWeekIdx];

  function getMeal(dayIndex: number, category: string): PlanMeal | undefined {
    return currentWeek.days[dayIndex].meals.find(
      (m) => m.category === category
    );
  }

  function openPicker(dayIndex: number, category: string) {
    setPickerTarget({ dayIndex, category });
    setPickerOpen(true);
  }

  function handleMealSelect(meal: PlanMeal) {
    if (!pickerTarget) return;
    const { dayIndex, category } = pickerTarget;

    setWeeks((prev) => {
      const updated = [...prev];
      const week = {
        ...updated[currentWeekIdx],
        days: [...updated[currentWeekIdx].days],
      };
      const day = { ...week.days[dayIndex] };
      // Remove existing meal for this category, then add the new one
      day.meals = [
        ...day.meals.filter((m) => m.category !== category),
        meal,
      ];
      week.days[dayIndex] = day;
      updated[currentWeekIdx] = week;
      return updated;
    });
  }

  function removeMeal(dayIndex: number, category: string) {
    setWeeks((prev) => {
      const updated = [...prev];
      const week = {
        ...updated[currentWeekIdx],
        days: [...updated[currentWeekIdx].days],
      };
      const day = { ...week.days[dayIndex] };
      day.meals = day.meals.filter((m) => m.category !== category);
      week.days[dayIndex] = day;
      updated[currentWeekIdx] = week;
      return updated;
    });
  }

  function addWeek() {
    setWeeks((prev) => [...prev, createEmptyWeek()]);
    setCurrentWeekIdx(weeks.length);
  }

  function removeWeek() {
    if (weeks.length <= 1) return;
    setWeeks((prev) => prev.filter((_, i) => i !== currentWeekIdx));
    setCurrentWeekIdx((prev) => Math.max(0, prev - 1));
  }

  async function handleSave() {
    if (!user) return;
    if (!name.trim()) {
      toast.error("Please enter a template name");
      return;
    }
    setSaving(true);
    try {
      await saveTemplate(user.uid, {
        id: template?.id,
        name: name.trim(),
        description: description.trim(),
        weeks,
      });
      toast.success(isEditing ? "Template updated!" : "Template created!");
      onSaved?.();
      onOpenChange(false);
    } catch (err) {
      toast.error("Failed to save template");
    } finally {
      setSaving(false);
    }
  }

  const currentMealId = pickerTarget
    ? getMeal(pickerTarget.dayIndex, pickerTarget.category)?.mealId
    : undefined;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>
              {isEditing ? "Edit Template" : "New Template"}
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4 overflow-y-auto flex-1 min-h-0 px-1">
            {/* Template info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="tpl-name">Name *</Label>
                <Input
                  id="tpl-name"
                  placeholder="e.g., Lean Bulk Program"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tpl-desc">Description</Label>
                <Input
                  id="tpl-desc"
                  placeholder="Optional description..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
            </div>

            {/* Week navigation */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  disabled={currentWeekIdx === 0}
                  onClick={() => setCurrentWeekIdx((i) => i - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm font-medium">
                  Week {currentWeekIdx + 1} of {weeks.length}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  disabled={currentWeekIdx === weeks.length - 1}
                  onClick={() => setCurrentWeekIdx((i) => i + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addWeek}
                >
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Add Week
                </Button>
                {weeks.length > 1 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={removeWeek}
                  >
                    <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                    Remove
                  </Button>
                )}
              </div>
            </div>

            {/* Weekly grid */}
            <div className="overflow-x-auto">
              <div className="min-w-[700px]">
                {/* Header row */}
                <div className="grid grid-cols-8 gap-1 mb-1">
                  <div className="text-xs font-medium text-muted-foreground p-1" />
                  {DAYS_OF_WEEK.map((day) => (
                    <div
                      key={day}
                      className="text-xs font-medium text-center p-1"
                    >
                      {day.slice(0, 3)}
                    </div>
                  ))}
                </div>

                {/* Meal category rows */}
                {MEAL_CATEGORIES.map((category) => (
                  <div key={category} className="grid grid-cols-8 gap-1 mb-1">
                    <div className="text-xs font-medium text-muted-foreground p-1 flex items-center">
                      {category}
                    </div>
                    {DAYS_OF_WEEK.map((_, dayIdx) => {
                      const meal = getMeal(dayIdx, category);
                      return (
                        <button
                          key={dayIdx}
                          type="button"
                          className={`rounded-md border p-1.5 text-left transition-colors min-h-[56px] ${
                            meal
                              ? "border-primary/30 bg-primary/5 hover:bg-primary/10"
                              : "border-dashed border-border hover:border-primary/50 hover:bg-muted/50"
                          }`}
                          onClick={() => openPicker(dayIdx, category)}
                        >
                          {meal ? (
                            <div className="flex items-start gap-1">
                              <span className="text-xs leading-tight line-clamp-2 flex-1">
                                {meal.mealName}
                              </span>
                              <button
                                type="button"
                                className="shrink-0 p-0.5 text-muted-foreground hover:text-destructive"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeMeal(dayIdx, category);
                                }}
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-center h-full">
                              <Plus className="h-3.5 w-3.5 text-muted-foreground/50" />
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-2 pt-3 border-t">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEditing ? "Update" : "Create"} Template
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <MealPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        category={pickerTarget?.category ?? ""}
        recipes={recipes}
        onSelect={handleMealSelect}
        onRemove={
          pickerTarget
            ? () => removeMeal(pickerTarget.dayIndex, pickerTarget.category)
            : undefined
        }
        currentMealId={currentMealId}
      />
    </>
  );
}
