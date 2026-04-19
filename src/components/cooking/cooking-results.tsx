"use client";

import { useState } from "react";
import { useAuth } from "@/lib/contexts/auth-context";
import { addCookLog, applyImprovement } from "@/lib/firebase/firestore";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Timestamp } from "firebase/firestore";
import {
  ChefHat,
  Star,
  Loader2,
  Lightbulb,
  ArrowUpCircle,
  PartyPopper,
  StickyNote,
} from "lucide-react";
import { toast } from "sonner";
import type { Recipe } from "@/lib/types/recipe";

interface CookingResultsProps {
  recipe: Recipe;
  servingsCooked: number;
  stepNotes?: Record<number, string>;
  onClose: () => void;
}

function formatStepNotes(stepNotes: Record<number, string>): string {
  return Object.entries(stepNotes)
    .filter(([, note]) => note.trim())
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([idx, note]) => `Step ${idx}: ${note}`)
    .join("\n");
}

export function CookingResults({
  recipe,
  servingsCooked,
  stepNotes,
  onClose,
}: CookingResultsProps) {
  const { user } = useAuth();
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [notes, setNotes] = useState(() =>
    stepNotes ? formatStepNotes(stepNotes) : ""
  );
  const [improvements, setImprovements] = useState("");
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    if (!user || rating === 0) {
      toast.error("Please rate your cooking session");
      return;
    }

    setSaving(true);
    try {
      await addCookLog(recipe.id, {
        recipeId: recipe.id,
        userId: user.uid,
        version: recipe.version || 1,
        rating,
        servingsCooked,
        notes,
        improvements,
        appliedToVersion: null,
        cookedAt: Timestamp.now(),
      });
      toast.success("Cook log saved!");
      setSaved(true);
    } catch {
      toast.error("Failed to save cook log");
    } finally {
      setSaving(false);
    }
  }

  async function handleApplyImprovements() {
    if (!improvements.trim()) return;

    setApplying(true);
    try {
      await applyImprovement(
        recipe.id,
        recipe,
        { notes: recipe.notes ? `${recipe.notes}\n\n--- Improvement (v${recipe.version || 1}) ---\n${improvements}` : improvements },
        `Applied improvements from cooking session: ${improvements.slice(0, 100)}`
      );
      toast.success(`Recipe updated to v${(recipe.version || 1) + 1}!`);
      onClose();
    } catch {
      toast.error("Failed to apply improvements");
    } finally {
      setApplying(false);
    }
  }

  const displayRating = hoverRating || rating;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background p-4 overflow-y-auto">
      <div className="w-full max-w-lg space-y-6 py-8">
        {/* Header celebration */}
        <div className="text-center space-y-2">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            {saved ? (
              <PartyPopper className="h-8 w-8 text-primary" />
            ) : (
              <ChefHat className="h-8 w-8 text-primary" />
            )}
          </div>
          <h1 className="text-2xl font-bold">
            {saved ? "Session Logged!" : "How did it go?"}
          </h1>
          <p className="text-muted-foreground">
            {saved
              ? `Your cook log for "${recipe.title}" has been saved.`
              : `You just cooked ${servingsCooked} servings of "${recipe.title}"`}
          </p>
        </div>

        {!saved ? (
          <>
            {/* Rating */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Rate this session</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex justify-center gap-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setRating(star)}
                      onMouseEnter={() => setHoverRating(star)}
                      onMouseLeave={() => setHoverRating(0)}
                      className="p-1 transition-transform hover:scale-110"
                    >
                      <Star
                        className={`h-8 w-8 transition-colors ${
                          star <= displayRating
                            ? "fill-primary text-primary"
                            : "text-muted-foreground/30"
                        }`}
                      />
                    </button>
                  ))}
                </div>
                {rating > 0 && (
                  <p className="mt-2 text-center text-sm text-muted-foreground">
                    {rating === 1 && "Needs work"}
                    {rating === 2 && "Below expectations"}
                    {rating === 3 && "Decent"}
                    {rating === 4 && "Great!"}
                    {rating === 5 && "Perfect!"}
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Step notes summary (read-only context) */}
            {stepNotes && Object.values(stepNotes).some((n) => n.trim()) && (
              <Card className="border-amber-500/30 bg-amber-500/5">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <StickyNote className="h-4 w-4 text-amber-600" />
                    Step Notes from This Session
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1.5">
                  {Object.entries(stepNotes)
                    .filter(([, note]) => note.trim())
                    .sort(([a], [b]) => Number(a) - Number(b))
                    .map(([idx, note]) => (
                      <div key={idx} className="flex gap-2 text-sm">
                        <span className="shrink-0 font-medium text-muted-foreground">
                          Step {idx}:
                        </span>
                        <span>{note}</span>
                      </div>
                    ))}
                </CardContent>
              </Card>
            )}

            {/* Notes */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Session Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  placeholder="How did it turn out? Any observations..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                />
                {stepNotes && Object.values(stepNotes).some((n) => n.trim()) && (
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Pre-filled from your step notes — edit as needed.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Improvements */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Lightbulb className="h-4 w-4 text-primary" />
                  Improvements for Next Time
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  placeholder="What would you change? More salt, less cook time, different technique..."
                  value={improvements}
                  onChange={(e) => setImprovements(e.target.value)}
                  rows={3}
                />
              </CardContent>
            </Card>

            {/* Actions */}
            <div className="flex gap-3">
              <Button className="flex-1" onClick={handleSave} disabled={saving || rating === 0}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Cook Log
              </Button>
              <Button variant="outline" onClick={onClose}>
                Skip
              </Button>
            </div>
          </>
        ) : (
          /* Post-save: option to apply improvements */
          <div className="space-y-4">
            {improvements.trim() && (
              <Card className="border-primary/30">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <ArrowUpCircle className="h-4 w-4 text-primary" />
                    Apply Improvements to Recipe?
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    This will save the current recipe as v{recipe.version || 1} and
                    update it with your improvement notes as v{(recipe.version || 1) + 1}.
                    You can always view previous versions from the recipe page.
                  </p>
                  <div className="rounded-md bg-muted/50 p-3">
                    <p className="text-sm">{improvements}</p>
                  </div>
                  <Button
                    onClick={handleApplyImprovements}
                    disabled={applying}
                    className="w-full"
                  >
                    {applying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    <ArrowUpCircle className="mr-2 h-4 w-4" />
                    Apply & Create v{(recipe.version || 1) + 1}
                  </Button>
                </CardContent>
              </Card>
            )}

            <Button variant="outline" className="w-full" onClick={onClose}>
              Done
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
