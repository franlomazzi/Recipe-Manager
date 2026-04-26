"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/contexts/auth-context";
import {
  createRecipe,
  updateRecipe,
  saveRecipeVersion,
  markImprovementsApplied,
  deleteRecipe,
} from "@/lib/firebase/firestore";
import { uploadRecipeImage, deleteRecipeImage } from "@/lib/firebase/storage";
import { generateSearchTerms } from "@/lib/utils/ingredient-parser";
import { detectTimer } from "@/lib/utils/timer-detector";
import { guessIngredientCategory } from "@/lib/utils/category-mapper";
import { normalizeUnit } from "@/lib/unit-standards";
import { UnitCombobox } from "@/components/recipe/unit-combobox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Trash2,
  GripVertical,
  Loader2,
  Clock,
  ImagePlus,
  X,
  Lightbulb,
  Star,
  ShoppingBasket,
  Sparkles,
} from "lucide-react";
import { generateRecipeImage } from "@/lib/services/gemini-service";
import { mapStepIngredientsWithAI } from "@/lib/services/step-ingredient-mapper-service";
import { getOrFetchConversion, applyConversion } from "@/lib/ingredients/unit-conversion";
import { toast } from "sonner";
import type { Recipe, Ingredient, Step, StepIngredient, Difficulty, CookLog, LibraryIngredient } from "@/lib/types/recipe";
import { RECIPE_CATEGORIES, CUISINE_TAGS, DIET_TAGS } from "@/lib/types/recipe";
import { useIngredientLibrary } from "@/lib/hooks/use-ingredient-library";
import { findLibraryMatches } from "@/lib/utils/ingredient-match";
import { saveIngredientToLibrary } from "@/lib/firebase/ingredient-library";
import { IngredientCombobox } from "@/components/recipe/ingredient-combobox";
import { CheckCircle2, Package, Pencil } from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface RecipeFormProps {
  recipe?: Recipe;
  improvements?: CookLog[];
  /**
   * When true, every ingredient carried in from `recipe` is treated as
   * needing explicit library-mapping review before save. Used by the import
   * flow (AI-produced drafts) to stop duplicate library entries from being
   * silently created. Manually-added rows after the fact don't need review.
   */
  needsIngredientReview?: boolean;
}

// Review state per ingredient. Only populated for imported drafts when
// needsIngredientReview=true — absence means "no review needed".
// - pending: user hasn't decided yet; save is gated on this
// - matched: user picked a library ingredient (the row's id is now the lib id)
// - new: user confirmed this is a new library entry
type IngredientReview =
  | { type: "pending" }
  | { type: "matched"; libraryId: string }
  | { type: "new" };

/**
 * Scale library reference macros to the recipe's actual quantity. Returns
 * the macro fields to spread onto an Ingredient. When quantity is null/0,
 * macros are zeroed (a linked row with no amount yet contributes nothing).
 *
 * This is the write-time scaling that fixes the stale-calories bug: the
 * food tracker reads `calories`/`protein`/... from the Firestore doc
 * directly, so those values must already be correct for the recipe's qty.
 */
function scaleFromReference(
  reference: {
    amount: number;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    fiber?: number;
    netCarbs?: number;
  },
  quantity: number | null
): Pick<Ingredient, "calories" | "protein" | "carbs" | "fat" | "fiber" | "netCarbs"> {
  const qty = quantity ?? 0;
  const ref = reference.amount || 100;
  const factor = qty / ref;
  return {
    calories: Math.round(reference.calories * factor),
    protein: Number((reference.protein * factor).toFixed(1)),
    carbs: Number((reference.carbs * factor).toFixed(1)),
    fat: Number((reference.fat * factor).toFixed(1)),
    ...(reference.fiber !== undefined && {
      fiber: Number((reference.fiber * factor).toFixed(1)),
    }),
    ...(reference.netCarbs !== undefined && {
      netCarbs: Number((reference.netCarbs * factor).toFixed(1)),
    }),
  };
}

function createEmptyIngredient(): Ingredient {
  return {
    id: crypto.randomUUID(),
    quantity: null,
    unit: "",
    name: "",
    category: "other",
    note: "",
  };
}

function createEmptyStep(order: number): Step {
  return {
    id: crypto.randomUUID(),
    order,
    instruction: "",
    timerMinutes: null,
    timerLabel: null,
    ingredients: [],
  };
}

interface SortableIngredientRowProps {
  ing: Ingredient;
  index: number;
  isOnly: boolean;
  review: IngredientReview | undefined;
  original: { quantity: number | null; unit: string; name: string } | undefined;
  libraryItems: LibraryIngredient[];
  onUpdateIngredient: (index: number, field: keyof Ingredient, value: string | number | null) => void;
  onRemove: (index: number) => void;
  onSelectLibraryItem: (index: number, item: LibraryIngredient) => void;
  onPickMatch: (index: number, item: LibraryIngredient) => void;
  onKeepAsNew: (ingredientId: string) => void;
  onReopenReview: (ingredientId: string) => void;
  onRestore: (index: number, original: { quantity: number | null; unit: string }) => void;
  onUnitChange?: (index: number, newUnit: string) => Promise<void>;
  isConvertingUnit?: boolean;
}

function SortableIngredientRow({
  ing,
  index,
  isOnly,
  review,
  original,
  libraryItems,
  onUpdateIngredient,
  onRemove,
  onSelectLibraryItem,
  onPickMatch,
  onKeepAsNew,
  onReopenReview,
  onRestore,
  onUnitChange,
  isConvertingUnit,
}: SortableIngredientRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: ing.id });

  const isPending = review?.type === "pending";
  const isMatched = review?.type === "matched";
  const isNew = review?.type === "new";

  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(ing.name);

  function openRename() {
    setRenameValue(ing.name);
    setIsRenaming(true);
  }

  function commitRename() {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== ing.name) {
      onUpdateIngredient(index, "name", trimmed);
    }
    setIsRenaming(false);
  }
  const hasDrifted =
    !!original &&
    (original.quantity !== ing.quantity ||
      original.unit !== ing.unit ||
      original.name !== ing.name);

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 1 : undefined,
      }}
      className={
        isPending
          ? "rounded-md border-l-4 border-amber-500 bg-amber-500/5 p-2"
          : isMatched || isNew
            ? "rounded-md border-l-4 border-emerald-500/60 bg-emerald-500/5 p-2"
            : ""
      }
    >
      <div className="flex items-start gap-2">
        <div
          className="mt-2.5 hidden cursor-grab active:cursor-grabbing touch-none text-muted-foreground/50 hover:text-muted-foreground transition-colors sm:block"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4 shrink-0" />
        </div>
        <div className="grid flex-1 grid-cols-2 sm:grid-cols-12 gap-2">
          <Input
            className="col-span-1 sm:col-span-2"
            placeholder="Qty"
            type="number"
            step="any"
            min="0"
            value={ing.quantity ?? ""}
            onChange={(e) =>
              onUpdateIngredient(index, "quantity", e.target.value ? parseFloat(e.target.value) : null)
            }
          />
          <UnitCombobox
            className="col-span-1 sm:col-span-2"
            value={ing.unit}
            onValueChange={(v) => onUnitChange ? void onUnitChange(index, v) : onUpdateIngredient(index, "unit", v)}
            lockedUnit={isConvertingUnit ? ing.unit : ing.reference?.unit}
          />
          <IngredientCombobox
            className="col-span-2 sm:col-span-5"
            value={ing.name}
            libraryItems={libraryItems}
            onSelectLibraryItem={(item) => onSelectLibraryItem(index, item)}
            onNameChange={(name) => onUpdateIngredient(index, "name", name)}
            onConfirmNew={() => onKeepAsNew(ing.id)}
            isConfirmedNew={isNew}
          />
          <Input
            className="col-span-2 sm:col-span-3"
            placeholder="Note (optional)"
            value={ing.note}
            onChange={(e) => onUpdateIngredient(index, "note", e.target.value)}
          />
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="mt-1 h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
          onClick={() => onRemove(index)}
          disabled={isOnly}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {original && (isPending || isMatched) && hasDrifted && (
        <ImportReference
          original={original}
          current={{ quantity: ing.quantity, unit: ing.unit, name: ing.name }}
          onRestore={() => onRestore(index, original)}
        />
      )}

      {isPending && (
        <ReviewPanel
          name={ing.name}
          library={libraryItems}
          onPickMatch={(item) => onPickMatch(index, item)}
          onKeepAsNew={() => onKeepAsNew(ing.id)}
        />
      )}

      {(isMatched || isNew) && (
        <div className="mt-2 ml-6 flex items-center gap-2 text-xs">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
          {isNew && isRenaming ? (
            <>
              <input
                autoFocus
                className="border border-border rounded px-1.5 py-0.5 text-xs bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); commitRename(); }
                  if (e.key === "Escape") setIsRenaming(false);
                }}
                onBlur={commitRename}
              />
              <span className="text-muted-foreground">as new library ingredient</span>
            </>
          ) : (
            <span className="text-muted-foreground">
              {isMatched ? (
                <>
                  Mapped to library ingredient{" "}
                  <span className="font-medium text-foreground">{ing.name}</span>
                </>
              ) : (
                <>
                  Will be saved as{" "}
                  <span className="font-medium text-foreground">{ing.name}</span>
                  {" "}as new library ingredient
                </>
              )}
            </span>
          )}
          {isNew && !isRenaming && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={openRename}
            >
              <Pencil className="h-3 w-3 mr-1" />
              Rename
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => onReopenReview(ing.id)}
          >
            Change
          </Button>
        </div>
      )}
    </div>
  );
}

interface SortableStepCardProps {
  step: Step;
  index: number;
  isOnly: boolean;
  ingredients: Ingredient[];
  onUpdateStep: (index: number, field: keyof Step, value: string | number | null) => void;
  onToggleTimer: (index: number) => void;
  onRemoveStep: (index: number) => void;
  onAddStepIngredient: (stepIndex: number, ingredientId: string) => void;
  onUpdateStepIngredient: (stepIndex: number, ingredientId: string, quantity: number | null) => void;
  onRemoveStepIngredient: (stepIndex: number, ingredientId: string) => void;
  getUsedQuantity: (ingredientId: string, excludeStepIndex?: number) => number;
  disabled?: boolean;
}

function SortableStepCard({
  step,
  index,
  isOnly,
  ingredients,
  onUpdateStep,
  onToggleTimer,
  onRemoveStep,
  onAddStepIngredient,
  onUpdateStepIngredient,
  onRemoveStepIngredient,
  getUsedQuantity,
  disabled,
}: SortableStepCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: step.id });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 1 : undefined,
      }}
      className="relative rounded-lg border border-border bg-muted/30 p-4"
    >
      <div className="flex items-start gap-3">
        <div
          className={`touch-none self-center text-muted-foreground/40 transition-colors ${disabled ? "cursor-default opacity-30" : "cursor-grab active:cursor-grabbing hover:text-muted-foreground"}`}
          {...(!disabled ? { ...attributes, ...listeners } : {})}
          aria-label="Drag to reorder step"
        >
          <GripVertical className="h-5 w-5" />
        </div>
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
          {index + 1}
        </div>
        <div className="flex-1 space-y-3">
          <Textarea
            placeholder={`Describe step ${index + 1}... (e.g., "Preheat oven to 375°F")`}
            value={step.instruction}
            onChange={(e) => onUpdateStep(index, "instruction", e.target.value)}
            rows={2}
            className="bg-background"
          />

          {/* Timer controls */}
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant={step.timerMinutes ? "default" : "outline"}
              size="sm"
              onClick={() => onToggleTimer(index)}
              className="gap-1.5"
            >
              <Clock className="h-3.5 w-3.5" />
              {step.timerMinutes ? "Timer on" : "Add timer"}
            </Button>

            {step.timerMinutes !== null && step.timerMinutes !== undefined && (
              <div className="flex items-center gap-2 rounded-md border border-border bg-background px-2 py-1">
                <Input
                  type="number"
                  min="1"
                  value={step.timerMinutes}
                  onChange={(e) =>
                    onUpdateStep(index, "timerMinutes", parseInt(e.target.value) || 1)
                  }
                  className="h-7 w-16 border-0 bg-transparent p-0 text-center text-sm"
                />
                <span className="text-xs text-muted-foreground">min</span>
                <Separator orientation="vertical" className="h-4" />
                <Input
                  type="text"
                  placeholder="Label"
                  value={step.timerLabel || ""}
                  onChange={(e) => onUpdateStep(index, "timerLabel", e.target.value)}
                  className="h-7 w-24 border-0 bg-transparent p-0 text-sm"
                />
              </div>
            )}
          </div>

          {/* Step ingredients */}
          <div className="space-y-2">
            {step.ingredients.length > 0 && (
              <div className="space-y-1.5">
                {step.ingredients.map((si) => {
                  const ing = ingredients.find((i) => i.id === si.ingredientId);
                  if (!ing) return null;
                  const usedElsewhere = getUsedQuantity(si.ingredientId, index);
                  const maxAvailable =
                    ing.quantity !== null
                      ? Math.max(0, ing.quantity - usedElsewhere)
                      : null;
                  return (
                    <div
                      key={si.ingredientId}
                      className="flex items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5"
                    >
                      <span className="text-sm truncate flex-1 min-w-0">
                        {ing.name}
                        {ing.unit && (
                          <span className="text-muted-foreground"> ({ing.unit})</span>
                        )}
                      </span>
                      {ing.quantity !== null && (
                        <div className="flex items-center gap-1 shrink-0">
                          <Input
                            type="number"
                            step="any"
                            min="0"
                            max={maxAvailable ?? undefined}
                            value={si.quantity ?? ""}
                            placeholder="Qty"
                            onChange={(e) =>
                              onUpdateStepIngredient(
                                index,
                                si.ingredientId,
                                e.target.value ? parseFloat(e.target.value) : null
                              )
                            }
                            className="h-7 w-16 text-center text-sm"
                          />
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            / {maxAvailable}
                          </span>
                        </div>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() => onRemoveStepIngredient(index, si.ingredientId)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Add ingredient dropdown */}
            {ingredients.some(
              (ing) =>
                ing.name.trim() &&
                !step.ingredients.some((si) => si.ingredientId === ing.id)
            ) && (
              <Select
                value=""
                onValueChange={(id) => id && onAddStepIngredient(index, id)}
              >
                <SelectTrigger className="h-8 w-auto max-w-[260px] text-xs gap-1.5">
                  <ShoppingBasket className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <SelectValue placeholder="Add ingredient to step..." />
                </SelectTrigger>
                <SelectContent>
                  {ingredients
                    .filter(
                      (ing) =>
                        ing.name.trim() &&
                        !step.ingredients.some((si) => si.ingredientId === ing.id)
                    )
                    .map((ing) => {
                      const remaining =
                        ing.quantity !== null
                          ? ing.quantity - getUsedQuantity(ing.id)
                          : null;
                      return (
                        <SelectItem
                          key={ing.id}
                          value={ing.id}
                          disabled={remaining !== null && remaining <= 0}
                        >
                          {ing.name}
                          {ing.quantity !== null && (
                            <span className="text-muted-foreground">
                              {" "}
                              — {remaining} {ing.unit} left
                            </span>
                          )}
                        </SelectItem>
                      );
                    })}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
          onClick={() => onRemoveStep(index)}
          disabled={isOnly}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

export function RecipeForm({
  recipe,
  improvements,
  needsIngredientReview = false,
}: RecipeFormProps) {
  const { user } = useAuth();
  const router = useRouter();
  // An imported draft is passed in via the `recipe` prop with no id so we can
  // reuse all the pre-fill logic below — but it must still save as a new
  // recipe. Key off the id, not presence of the object.
  const isEditing = !!recipe?.id;
  const { items: libraryItems, loading: libraryLoading } = useIngredientLibrary();

  const [title, setTitle] = useState(recipe?.title || "");
  const [description, setDescription] = useState(recipe?.description || "");
  const [prepTime, setPrepTime] = useState(recipe?.prepTime?.toString() || "");
  const [cookTime, setCookTime] = useState(recipe?.cookTime?.toString() || "");
  const [servings, setServings] = useState(recipe?.servings?.toString() || "4");
  const [difficulty, setDifficulty] = useState<Difficulty>(recipe?.difficulty || "medium");
  const [categories, setCategories] = useState<string[]>(recipe?.categories || []);
  const [notes, setNotes] = useState(recipe?.notes || "");
  // Silent-normalize any legacy free-text units on form init so the Unit
  // dropdown shows the canonical value from first paint. Persistence only
  // happens when the user saves, so unopened recipes remain untouched.
  const [ingredients, setIngredients] = useState<Ingredient[]>(
    recipe?.ingredients?.length
      ? recipe.ingredients.map((ing) => ({
          ...ing,
          unit: normalizeUnit(ing.unit),
        }))
      : [createEmptyIngredient()]
  );
  const [steps, setSteps] = useState<Step[]>(
    recipe?.steps?.length ? recipe.steps : [createEmptyStep(1)]
  );

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function reorderSteps(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setSteps((prev) => {
      const oldIndex = prev.findIndex((s) => s.id === active.id);
      const newIndex = prev.findIndex((s) => s.id === over.id);
      return arrayMove(prev, oldIndex, newIndex).map((s, i) => ({ ...s, order: i + 1 }));
    });
  }
  // Review status keyed by ingredient.id. Only populated when the caller asked
  // for review (import flow). New ingredients added during this session are
  // never added here — they're assumed intentional.
  const [reviewStatus, setReviewStatus] = useState<Record<string, IngredientReview>>(
    () => {
      if (!needsIngredientReview || !recipe?.ingredients?.length) return {};
      const out: Record<string, IngredientReview> = {};
      for (const ing of recipe.ingredients) {
        out[ing.id] = { type: "pending" };
      }
      return out;
    }
  );
  // Snapshot of what the AI produced, keyed by the current ingredient id.
  // Shown as a muted reference in the review row so the user never loses
  // sight of the source recipe's intent while they remap/edit. Keys migrate
  // alongside reviewStatus when a row adopts a library ingredient's id.
  const [originalImports, setOriginalImports] = useState<
    Record<string, { quantity: number | null; unit: string; name: string }>
  >(() => {
    if (!needsIngredientReview || !recipe?.ingredients?.length) return {};
    const out: Record<string, { quantity: number | null; unit: string; name: string }> = {};
    for (const ing of recipe.ingredients) {
      out[ing.id] = { quantity: ing.quantity, unit: ing.unit, name: ing.name };
    }
    return out;
  });
  const [convertingUnitForId, setConvertingUnitForId] = useState<string | null>(null);

  // Auto-link imported ingredients with exact library name matches the first
  // time the library finishes loading. Prevents common condiments (salt,
  // pepper, oil, etc.) from being saved as duplicates when the user doesn't
  // notice or manually click the match suggestion.
  const autoLinkedRef = useRef(false);
  useEffect(() => {
    if (!needsIngredientReview || libraryLoading || libraryItems.length === 0 || autoLinkedRef.current) return;
    autoLinkedRef.current = true;
    ingredients.forEach((ing, index) => {
      if (reviewStatus[ing.id]?.type !== "pending") return;
      const matches = findLibraryMatches(ing.name, libraryItems, 1);
      if (matches[0]?.score === 1) {
        void selectLibraryIngredient(index, matches[0].item);
      }
    });
  // ingredients/reviewStatus intentionally omitted: autoLinkedRef guards
  // single execution, so we capture their initial state on first library load.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [libraryItems, libraryLoading, needsIngredientReview]);

  const pendingReviewCount = Object.values(reviewStatus).filter(
    (s) => s.type === "pending"
  ).length;
  // When an import lands, we gate step-level editing (instruction text,
  // AI mapping, timer auto-detect, add/remove step, per-step timer + ingredient
  // widgets) until the user has resolved every imported ingredient. Reasoning:
  // the AI step-ingredient mapper matches on ingredient names and ids; if the
  // user is still mid-review, those ids are about to change as rows adopt
  // library ingredients, and any mapping done now would be stale. Same logic
  // for timers — cheap to postpone, avoids confusing half-reviewed state.
  const stepsLocked = needsIngredientReview && pendingReviewCount > 0;

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(recipe?.photoURL || null);
  const [saving, setSaving] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showVersionDialog, setShowVersionDialog] = useState(false);
  const [pendingRecipeData, setPendingRecipeData] = useState<Partial<Omit<Recipe, "id" | "userId" | "createdAt">> | null>(null);
  const [aiPromptOpen, setAiPromptOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [generatingPhoto, setGeneratingPhoto] = useState(false);
  const [mappingSteps, setMappingSteps] = useState(false);

  function toggleCategory(cat: string) {
    setCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  }

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  }

  function removeImage() {
    setImageFile(null);
    setImagePreview(null);
  }

  async function handleGenerateAiPhoto() {
    if (!title.trim()) {
      toast.error("Add a recipe title first so the AI knows what to draw.");
      return;
    }
    setGeneratingPhoto(true);
    try {
      const blob = await generateRecipeImage(title.trim(), aiPrompt.trim() || undefined);
      // Wrap the blob in a File so the existing save flow (which expects a
      // File for compressImage + uploadRecipeImage) handles it unchanged.
      const fileName = `${title.trim().toLowerCase().replace(/\s+/g, "-")}-ai.jpg`;
      const file = new File([blob], fileName, { type: "image/jpeg" });
      // Revoke any previous object URL we created so we don't leak.
      if (imagePreview && imagePreview.startsWith("blob:")) {
        URL.revokeObjectURL(imagePreview);
      }
      setImageFile(file);
      setImagePreview(URL.createObjectURL(blob));
      setAiPromptOpen(false);
      toast.success("AI photo ready — save the recipe to keep it.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't generate photo");
    } finally {
      setGeneratingPhoto(false);
    }
  }

  function updateIngredient(index: number, field: keyof Ingredient, value: string | number | null) {
    setIngredients((prev) => {
      const updated = [...prev];
      const current = updated[index];
      const next: Ingredient = { ...current, [field]: value };

      if (field === "name" && typeof value === "string") {
        next.category = guessIngredientCategory(value);
        // Editing the name on a linked row means the user is deviating from
        // the library ingredient. Drop the reference + library id so the
        // unit unlocks and macros stop being authoritative. A re-link via
        // the combobox restores them.
        if (current.reference && value.trim() !== current.name.trim()) {
          delete next.reference;
          next.id = crypto.randomUUID();
          next.calories = undefined;
          next.protein = undefined;
          next.carbs = undefined;
          next.fat = undefined;
          next.fiber = undefined;
          next.netCarbs = undefined;
        }
      }

      // Re-scale macros whenever quantity changes on a linked row. Write-time
      // scaling keeps the Firestore doc's `calories` etc. correct for
      // whatever the user typed — the food tracker reads those directly.
      if (field === "quantity" && next.reference) {
        const scaled = scaleFromReference(
          next.reference,
          typeof value === "number" ? value : null
        );
        Object.assign(next, scaled);
      }

      updated[index] = next;
      return updated;
    });
  }

  async function selectLibraryIngredient(index: number, item: LibraryIngredient) {
    const oldId = ingredients[index]?.id;
    // Capture pre-link unit/quantity for AI conversion below.
    const preLinkUnit = ingredients[index]?.unit;
    const preLinkQty = ingredients[index]?.quantity;
    const preLinkNote = ingredients[index]?.note ?? "";

    setIngredients((prev) => {
      const updated = [...prev];
      // Adopt the library's reference unit on link. Scaling is only coherent
      // when the recipe's amount and the library's reference share a unit
      // (we don't carry density data, so ml↔g can't be converted). The UI
      // locks the unit dropdown while linked; to override, unlink by
      // renaming the ingredient.
      const reference = {
        amount: item.servingSize || 100,
        unit: item.servingUnit || "g",
        calories: item.calories,
        protein: item.protein,
        carbs: item.carbs,
        fat: item.fat,
        ...(item.fiber !== undefined && { fiber: item.fiber }),
        ...(item.netCarbs !== undefined && { netCarbs: item.netCarbs }),
      };
      const scaled = scaleFromReference(reference, updated[index].quantity);

      updated[index] = {
        ...updated[index],
        id: item.id,
        name: item.name,
        unit: reference.unit,
        reference,
        ...scaled,
        category: guessIngredientCategory(item.name),
      };
      return updated;
    });
    // If this row was flagged for review, record the mapping and migrate the
    // review entry to the new (library) id so the pending count updates and
    // the lookup still finds this row on re-render.
    if (oldId && reviewStatus[oldId]) {
      setReviewStatus((prev) => {
        const next = { ...prev };
        delete next[oldId];
        next[item.id] = { type: "matched", libraryId: item.id };
        return next;
      });
      // Migrate the "original import" snapshot too so we can keep showing
      // the recipe's stated qty/unit/name on the now-matched row.
      setOriginalImports((prev) => {
        if (!prev[oldId]) return prev;
        const next = { ...prev };
        const snapshot = next[oldId];
        delete next[oldId];
        next[item.id] = snapshot;
        return next;
      });
    }
    // Re-parent any step linkages that referenced the old id.
    if (oldId && oldId !== item.id) {
      setSteps((prev) =>
        prev.map((s) => ({
          ...s,
          ingredients: s.ingredients.map((si) =>
            si.ingredientId === oldId
              ? { ...si, ingredientId: item.id }
              : si
          ),
        }))
      );
    }

    // If the pre-link unit differs from the library's canonical unit, use AI
    // to convert the quantity. This handles e.g. "0.25 tsp" linked to a
    // library item tracked in grams.
    if (user && preLinkUnit && preLinkUnit !== item.servingUnit && preLinkQty != null) {
      const conversion = await getOrFetchConversion(user.uid, item, preLinkUnit);
      if (conversion) {
        setIngredients((prev) => {
          const idx = prev.findIndex((i) => i.id === item.id);
          if (idx === -1) return prev;
          const updated = [...prev];
          const ing = updated[idx];
          // Apply conversion to the original (pre-link) quantity and unit so
          // the result is correct in the canonical unit.
          const converted = applyConversion(
            { ...ing, quantity: preLinkQty, unit: preLinkUnit, note: preLinkNote },
            conversion
          );
          const scaled = ing.reference ? scaleFromReference(ing.reference, converted.quantity) : {};
          updated[idx] = { ...ing, ...converted, ...scaled };
          return updated;
        });
      } else {
        toast.warning(
          `Couldn't auto-convert ${item.name} from ${preLinkUnit} to ${item.servingUnit} — review manually.`,
          { duration: 5000 }
        );
      }
    }
  }

  function confirmKeepAsNew(ingredientId: string) {
    setReviewStatus((prev) => ({
      ...prev,
      [ingredientId]: { type: "new" },
    }));
  }

  function reopenReview(ingredientId: string) {
    setReviewStatus((prev) => ({
      ...prev,
      [ingredientId]: { type: "pending" },
    }));
  }

  async function handleImportIngredientUnitChange(index: number, newUnit: string) {
    const ing = ingredients[index];
    if (!ing || ing.reference) return; // linked rows are handled elsewhere
    const original = originalImports[ing.id];
    if (!original) {
      // Not an imported ingredient — plain update
      updateIngredient(index, "unit", newUnit);
      return;
    }

    updateIngredient(index, "unit", newUnit);

    // If reverting to the original import unit, restore original qty too
    if (newUnit === original.unit) {
      updateIngredient(index, "quantity", original.quantity);
      return;
    }

    if (!user || original.quantity == null) return;

    setConvertingUnitForId(ing.id);
    try {
      const idToken = await user.getIdToken();
      const response = await fetch("/api/convert-unit", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ ingredientName: ing.name, fromUnit: original.unit, toUnit: newUnit }),
      });

      if (!response.ok) {
        toast.warning(
          `Couldn't auto-convert ${ing.name} from ${original.unit} to ${newUnit} — review manually.`,
          { duration: 5000 }
        );
        return;
      }

      const data = (await response.json()) as { factor?: number };
      if (!data.factor || data.factor <= 0) {
        toast.warning(
          `Couldn't auto-convert ${ing.name} from ${original.unit} to ${newUnit} — review manually.`,
          { duration: 5000 }
        );
        return;
      }

      const converted = applyConversion(
        { ...ing, quantity: original.quantity, unit: original.unit },
        { factor: data.factor, targetUnit: newUnit }
      );
      setIngredients((prev) => {
        const updated = [...prev];
        updated[index] = { ...updated[index], quantity: converted.quantity, note: converted.note };
        return updated;
      });
    } catch {
      toast.warning(`Unit conversion failed — review manually.`, { duration: 5000 });
    } finally {
      setConvertingUnitForId(null);
    }
  }

  function addIngredient() {
    setIngredients((prev) => [...prev, createEmptyIngredient()]);
  }

  function removeIngredient(index: number) {
    setIngredients((prev) => prev.filter((_, i) => i !== index));
  }

  function reorderIngredients(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setIngredients((prev) => {
      const oldIndex = prev.findIndex((i) => i.id === active.id);
      const newIndex = prev.findIndex((i) => i.id === over.id);
      return arrayMove(prev, oldIndex, newIndex);
    });
  }

  function updateStep(index: number, field: keyof Step, value: string | number | null) {
    setSteps((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };

      // Auto-detect timer from instruction text if user hasn't manually set one
      if (field === "instruction" && typeof value === "string") {
        const timer = detectTimer(value);
        if (timer && !updated[index].timerMinutes) {
          updated[index].timerMinutes = timer.minutes;
          updated[index].timerLabel = timer.label;
        }
      }
      return updated;
    });
  }

  function toggleStepTimer(index: number) {
    setSteps((prev) => {
      const updated = [...prev];
      if (updated[index].timerMinutes) {
        updated[index] = { ...updated[index], timerMinutes: null, timerLabel: null };
      } else {
        updated[index] = { ...updated[index], timerMinutes: 5, timerLabel: "Timer" };
      }
      return updated;
    });
  }

  function addStep() {
    setSteps((prev) => [...prev, createEmptyStep(prev.length + 1)]);
  }

  function removeStep(index: number) {
    setSteps((prev) =>
      prev
        .filter((_, i) => i !== index)
        .map((s, i) => ({ ...s, order: i + 1 }))
    );
  }

  // Clean up step ingredients when an ingredient is removed from the recipe
  function removeIngredientAndCleanSteps(ingIndex: number) {
    const removedId = ingredients[ingIndex].id;
    setIngredients((prev) => prev.filter((_, i) => i !== ingIndex));
    setSteps((prev) =>
      prev.map((s) => ({
        ...s,
        ingredients: s.ingredients.filter((si) => si.ingredientId !== removedId),
      }))
    );
    if (reviewStatus[removedId]) {
      setReviewStatus((prev) => {
        const next = { ...prev };
        delete next[removedId];
        return next;
      });
    }
    if (originalImports[removedId]) {
      setOriginalImports((prev) => {
        const next = { ...prev };
        delete next[removedId];
        return next;
      });
    }
  }

  // Compute how much of each ingredient is already allocated across all steps
  function getUsedQuantity(ingredientId: string, excludeStepIndex?: number): number {
    return steps.reduce((sum, step, idx) => {
      if (idx === excludeStepIndex) return sum;
      const si = step.ingredients.find((i) => i.ingredientId === ingredientId);
      return sum + (si?.quantity ?? 0);
    }, 0);
  }

  function addStepIngredient(stepIndex: number, ingredientId: string) {
    setSteps((prev) => {
      const updated = [...prev];
      const step = { ...updated[stepIndex] };
      if (step.ingredients.some((si) => si.ingredientId === ingredientId)) return prev;
      step.ingredients = [...step.ingredients, { ingredientId, quantity: null }];
      updated[stepIndex] = step;
      return updated;
    });
  }

  function updateStepIngredient(
    stepIndex: number,
    ingredientId: string,
    quantity: number | null
  ) {
    setSteps((prev) => {
      const updated = [...prev];
      const step = { ...updated[stepIndex] };
      step.ingredients = step.ingredients.map((si) =>
        si.ingredientId === ingredientId ? { ...si, quantity } : si
      );
      updated[stepIndex] = step;
      return updated;
    });
  }

  function removeStepIngredient(stepIndex: number, ingredientId: string) {
    setSteps((prev) => {
      const updated = [...prev];
      const step = { ...updated[stepIndex] };
      step.ingredients = step.ingredients.filter(
        (si) => si.ingredientId !== ingredientId
      );
      updated[stepIndex] = step;
      return updated;
    });
  }

  async function handleMapStepIngredientsWithAI() {
    const validIngredients = ingredients.filter((i) => i.name.trim());
    const validSteps = steps.filter((s) => s.instruction.trim());

    if (validIngredients.length === 0) {
      toast.error("Add some ingredients first.");
      return;
    }
    if (validSteps.length === 0) {
      toast.error("Add some steps first.");
      return;
    }

    // Warn before overwriting existing manual mappings.
    const hasExisting = steps.some((s) => s.ingredients.length > 0);
    if (hasExisting) {
      const ok = window.confirm(
        "This will replace any ingredients already mapped to steps. Continue?"
      );
      if (!ok) return;
    }

    setMappingSteps(true);
    try {
      const mappings = await mapStepIngredientsWithAI({
        ingredients: validIngredients.map((i) => ({
          id: i.id,
          name: i.name,
          quantity: i.quantity,
          unit: i.unit,
          note: i.note || undefined,
        })),
        steps: validSteps.map((s) => ({
          id: s.id,
          order: s.order,
          instruction: s.instruction,
        })),
      });

      const byStepId = new Map(mappings.map((m) => [m.stepId, m.ingredients]));
      setSteps((prev) =>
        prev.map((s) => {
          const mapped = byStepId.get(s.id);
          if (!mapped) return { ...s, ingredients: [] };
          return { ...s, ingredients: mapped };
        })
      );
      const mappedCount = mappings.reduce(
        (sum, m) => sum + m.ingredients.length,
        0
      );
      toast.success(
        mappedCount > 0
          ? `Mapped ${mappedCount} ingredient${mappedCount === 1 ? "" : "s"} across ${mappings.length} step${mappings.length === 1 ? "" : "s"}.`
          : "AI couldn't confidently map any ingredients — review the steps and try again."
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "AI mapping failed."
      );
    } finally {
      setMappingSteps(false);
    }
  }

  // Run the regex timer detector across every step that currently has no
  // timer set. Used by the "Auto-detect timers" button so saved recipes
  // predating AI-defined timers (or steps the import path missed) can be
  // bulk-enriched in one click. Won't overwrite manually-set timers — if the
  // user deliberately removed one in the past, they're safe from re-adding.
  function handleAutoDetectTimers() {
    let filledCount = 0;
    setSteps((prev) =>
      prev.map((s) => {
        if (s.timerMinutes !== null && s.timerMinutes !== undefined) return s;
        const detected = detectTimer(s.instruction ?? "");
        if (!detected) return s;
        filledCount += 1;
        return {
          ...s,
          timerMinutes: detected.minutes,
          timerLabel: detected.label,
        };
      })
    );
    if (filledCount === 0) {
      toast.info(
        "No new timers detected. Steps either already have timers or don't mention an explicit duration."
      );
    } else {
      toast.success(
        `Added ${filledCount} timer${filledCount === 1 ? "" : "s"}. Review and adjust before saving.`
      );
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;

    if (!title.trim()) {
      toast.error("Please enter a recipe title");
      return;
    }

    const rawIngredients = ingredients.filter((i) => i.name.trim());
    const validSteps = steps
      .filter((s) => s.instruction.trim())
      .map((s, i) => ({ ...s, order: i + 1 }));

    if (rawIngredients.length === 0) {
      toast.error("Please add at least one ingredient");
      return;
    }

    if (validSteps.length === 0) {
      toast.error("Please add at least one step");
      return;
    }

    if (pendingReviewCount > 0) {
      toast.error(
        `Review ${pendingReviewCount} imported ingredient${pendingReviewCount === 1 ? "" : "s"} before saving.`
      );
      return;
    }

    // Fix any legacy linked ingredients where the recipe's unit still differs
    // from the library's canonical unit (e.g. saved before this feature).
    const libraryMap = new Map(libraryItems.map((li) => [li.id, li]));
    const validIngredients = await Promise.all(
      rawIngredients.map(async (ing) => {
        if (!ing.reference || ing.unit === ing.reference.unit) return ing;
        const libItem = libraryMap.get(ing.id);
        if (!libItem) return ing;
        const conversion = await getOrFetchConversion(user.uid, libItem, ing.unit);
        if (!conversion) return ing;
        const converted = applyConversion(ing, conversion);
        const scaled = scaleFromReference(ing.reference, converted.quantity);
        return { ...converted, ...scaled };
      })
    );

    const prep = parseInt(prepTime) || 0;
    const cook = parseInt(cookTime) || 0;

    const recipeData = {
      title: title.trim(),
      description: description.trim(),
      prepTime: prep,
      cookTime: cook,
      totalTime: prep + cook,
      servings: parseInt(servings) || 4,
      difficulty,
      categories,
      notes: notes.trim(),
      isFavorite: recipe?.isFavorite || false,
      version: recipe?.version || 1,
      parentRecipeId: recipe?.parentRecipeId || null,
      parentRecipeTitle: recipe?.parentRecipeTitle || null,
      forkedFromVersion: recipe?.forkedFromVersion || null,
      rating: recipe?.rating || null,
      cookCount: recipe?.cookCount || 0,
      ingredients: validIngredients,
      steps: validSteps,
      searchTerms: generateSearchTerms(title, categories),
      photoURL: recipe?.photoURL || null,
      photoStoragePath: recipe?.photoStoragePath || null,
      ingredientExtensions: recipe?.ingredientExtensions || {},
      // Carry the import attribution through save. Hand-authored recipes
      // won't have one — meal-mapper.ts strips `undefined` before write.
      sourceUrl: recipe?.sourceUrl ?? null,
    };

    if (isEditing) {
      setPendingRecipeData(recipeData);
      setShowVersionDialog(true);
      return;
    }

    setSaving(true);
    try {
      const recipeId = await createRecipe(user.uid, recipeData);
      await saveNewIngredients(recipeId, validIngredients);
      await saveImageIfNeeded(recipeId);
      toast.success("Recipe created!");
      router.push(`/recipes/${recipeId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save recipe");
    } finally {
      setSaving(false);
    }
  }

  async function saveNewIngredients(recipeId: string, validIngredients: typeof ingredients) {
    const libraryIds = new Set(libraryItems.map((li) => li.id));
    const newIngredients = validIngredients.filter((ing) => !libraryIds.has(ing.id));
    await Promise.all(
      newIngredients.map((ing) =>
        saveIngredientToLibrary(user!.uid, {
          id: ing.id,
          name: ing.name,
          servingSize: ing.quantity ?? 1,
          servingUnit: ing.unit || "unit",
          calories: ing.calories ?? 0,
          protein: ing.protein ?? 0,
          carbs: ing.carbs ?? 0,
          fat: ing.fat ?? 0,
          fiber: ing.fiber,
          netCarbs: ing.netCarbs,
        })
      )
    );
  }

  async function saveImageIfNeeded(recipeId: string) {
    if (!imageFile) return;
    const { compressImage } = await import("@/lib/utils/image-compress");
    const compressed = await compressImage(imageFile);
    const { url, path } = await uploadRecipeImage(user!.uid, recipeId, compressed);
    await updateRecipe(recipeId, { photoURL: url, photoStoragePath: path });
  }

  async function handleDelete() {
    if (!recipe) return;
    setDeleting(true);
    try {
      if (recipe.photoStoragePath) {
        await deleteRecipeImage(recipe.photoStoragePath);
      }
      await deleteRecipe(recipe.id);
      toast.success("Recipe deleted");
      router.replace("/recipes");
    } catch {
      toast.error("Failed to delete recipe");
      setDeleting(false);
    }
  }

  async function handleVersionChoice(saveAsNew: boolean) {
    if (!pendingRecipeData || !recipe || !user) return;
    setShowVersionDialog(false);
    setSaving(true);
    try {
      const recipeId = recipe.id;
      const data = { ...pendingRecipeData };

      if (saveAsNew) {
        const newVersion = (recipe.version || 1) + 1;
        await saveRecipeVersion(recipeId, recipe, "Saved as new version");
        data.version = newVersion;
        await updateRecipe(recipeId, data);
        if (improvements && improvements.length > 0) {
          await markImprovementsApplied(recipeId, newVersion);
        }
      } else {
        await updateRecipe(recipeId, data);
        if (improvements && improvements.length > 0) {
          await markImprovementsApplied(recipeId, recipe.version || 1);
        }
      }

      await saveNewIngredients(recipeId, (data.ingredients as typeof ingredients) ?? []);
      await saveImageIfNeeded(recipeId);
      toast.success("Recipe updated!");
      router.push(`/recipes/${recipeId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save recipe");
    } finally {
      setSaving(false);
      setPendingRecipeData(null);
    }
  }

  const allTags = [
    ...RECIPE_CATEGORIES,
    ...CUISINE_TAGS,
    ...DIET_TAGS,
  ];

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Improvements reference banner */}
      {improvements && improvements.length > 0 && (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-primary" />
              Applying Improvements
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Edit the recipe below using these notes as reference. Saving will create a new version and mark these as applied.
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {improvements.map((log) => (
              <div key={log.id} className="rounded-md bg-background/80 p-3 space-y-1">
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-0.5">
                    {Array.from({ length: 5 }, (_, i) => (
                      <Star
                        key={i}
                        className={`h-3 w-3 ${
                          i < log.rating ? "fill-primary text-primary" : "text-muted-foreground/30"
                        }`}
                      />
                    ))}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {log.cookedAt?.toDate?.()
                      ? log.cookedAt.toDate().toLocaleDateString()
                      : ""}
                  </span>
                </div>
                <p className="text-sm font-medium">{log.improvements}</p>
                {log.notes && (
                  <p className="text-xs text-muted-foreground italic">Session note: {log.notes}</p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Basic Info */}
      <Card>
        <CardHeader>
          <CardTitle>Basic Info</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              placeholder="e.g., Grandma's Chocolate Chip Cookies"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="A brief description of the recipe..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="prepTime">Prep (min)</Label>
              <Input
                id="prepTime"
                type="number"
                min="0"
                placeholder="15"
                value={prepTime}
                onChange={(e) => setPrepTime(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cookTime">Cook (min)</Label>
              <Input
                id="cookTime"
                type="number"
                min="0"
                placeholder="30"
                value={cookTime}
                onChange={(e) => setCookTime(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="servings">Servings</Label>
              <Input
                id="servings"
                type="number"
                min="1"
                placeholder="4"
                value={servings}
                onChange={(e) => setServings(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Difficulty</Label>
              <Select value={difficulty} onValueChange={(v) => setDifficulty(v as Difficulty)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="easy">Easy</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="hard">Hard</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Photo */}
          <div className="space-y-2">
            <Label>Photo</Label>
            {imagePreview ? (
              <div className="relative w-full max-w-sm">
                <img
                  src={imagePreview}
                  alt="Recipe preview"
                  className="h-48 w-full rounded-lg object-cover"
                />
                <Button
                  type="button"
                  variant="destructive"
                  size="icon"
                  className="absolute right-2 top-2 h-7 w-7"
                  onClick={removeImage}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <label className="flex h-32 w-full max-w-sm cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-border hover:border-primary/50 transition-colors">
                <div className="flex flex-col items-center gap-1 text-muted-foreground">
                  <ImagePlus className="h-6 w-6" />
                  <span className="text-sm">Add photo</span>
                </div>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleImageChange}
                />
              </label>
            )}

            {/* AI photo generator */}
            <div className="w-full max-w-sm space-y-2 pt-1">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleGenerateAiPhoto}
                  disabled={generatingPhoto || !title.trim()}
                  className="gap-1.5"
                >
                  {generatingPhoto ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4 text-primary" />
                  )}
                  {imagePreview ? "Regenerate AI Photo" : "Generate AI Photo"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setAiPromptOpen((open) => !open)}
                  disabled={generatingPhoto}
                  className="text-xs text-muted-foreground"
                >
                  {aiPromptOpen ? "Hide custom prompt" : "Add custom prompt"}
                </Button>
              </div>
              {aiPromptOpen && (
                <Textarea
                  placeholder="Optional: describe the shot you want — e.g. 'rustic wooden table, soft morning light, top-down view'"
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  rows={2}
                  disabled={generatingPhoto}
                  className="text-sm"
                />
              )}
              {!title.trim() && (
                <p className="text-xs text-muted-foreground">
                  Add a recipe title to enable AI photo generation.
                </p>
              )}
            </div>
          </div>

          {/* Categories */}
          <div className="space-y-2">
            <Label>Categories & Tags</Label>
            <div className="flex flex-wrap gap-1.5">
              {allTags.map((tag) => (
                <Badge
                  key={tag}
                  variant={categories.includes(tag) ? "default" : "outline"}
                  className="cursor-pointer"
                  onClick={() => toggleCategory(tag)}
                >
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Ingredients */}
      <Card>
        <CardHeader>
          <CardTitle>Ingredients</CardTitle>
          {needsIngredientReview && (
            <p className="text-xs text-muted-foreground">
              {pendingReviewCount > 0
                ? `Review each imported ingredient below — map it to something you already have, or confirm it's new. ${pendingReviewCount} left.`
                : "All imported ingredients reviewed. You can save."}
            </p>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={reorderIngredients}
          >
            <SortableContext
              items={ingredients.map((i) => i.id)}
              strategy={verticalListSortingStrategy}
            >
              {ingredients.map((ing, index) => (
                <SortableIngredientRow
                  key={ing.id}
                  ing={ing}
                  index={index}
                  isOnly={ingredients.length === 1}
                  review={reviewStatus[ing.id]}
                  original={originalImports[ing.id]}
                  libraryItems={libraryItems}
                  onUpdateIngredient={updateIngredient}
                  onRemove={removeIngredientAndCleanSteps}
                  onSelectLibraryItem={selectLibraryIngredient}
                  onPickMatch={selectLibraryIngredient}
                  onKeepAsNew={confirmKeepAsNew}
                  onReopenReview={reopenReview}
                  onRestore={(idx, orig) => {
                    updateIngredient(idx, "quantity", orig.quantity);
                    updateIngredient(idx, "unit", orig.unit);
                  }}
                  onUnitChange={originalImports[ing.id] && !ing.reference ? handleImportIngredientUnitChange : undefined}
                  isConvertingUnit={convertingUnitForId === ing.id}
                />
              ))}
            </SortableContext>
          </DndContext>
          <Button type="button" variant="outline" size="sm" onClick={addIngredient}>
            <Plus className="mr-2 h-4 w-4" />
            Add Ingredient
          </Button>
        </CardContent>
      </Card>

      {/* Steps */}
      <Card className={stepsLocked ? "relative" : undefined}>
        {stepsLocked && (
          <div className="rounded-t-lg border-b border-amber-200 bg-amber-50 px-6 py-3 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
            <strong>Finish ingredient review first.</strong> Map the{" "}
            {pendingReviewCount} imported ingredient
            {pendingReviewCount === 1 ? "" : "s"} above before editing steps —
            AI mapping and timer detection both depend on the final ingredient
            list.
          </div>
        )}
        {/* fieldset disables all inputs/buttons inside natively — simpler and
            more accessible than gating each control one by one. */}
        <fieldset disabled={stepsLocked} className="contents">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>Instructions</CardTitle>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAutoDetectTimers}
                disabled={!steps.some((s) => s.instruction.trim())}
                className="gap-1.5"
                title="Scan each step for phrases like 'for 10 minutes' and fill in the timer automatically. Won't overwrite existing timers."
              >
                <Clock className="h-4 w-4 text-primary" />
                Auto-detect timers
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleMapStepIngredientsWithAI}
                disabled={
                  mappingSteps ||
                  !ingredients.some((i) => i.name.trim()) ||
                  !steps.some((s) => s.instruction.trim())
                }
                className="gap-1.5"
                title="Use AI to infer which ingredients each step uses and how much."
              >
                {mappingSteps ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4 text-primary" />
                )}
                Map ingredients to steps with AI
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={reorderSteps}
          >
            <SortableContext
              items={steps.map((s) => s.id)}
              strategy={verticalListSortingStrategy}
            >
              {steps.map((step, index) => (
                <SortableStepCard
                  key={step.id}
                  step={step}
                  index={index}
                  isOnly={steps.length === 1}
                  ingredients={ingredients}
                  onUpdateStep={updateStep}
                  onToggleTimer={toggleStepTimer}
                  onRemoveStep={removeStep}
                  onAddStepIngredient={addStepIngredient}
                  onUpdateStepIngredient={updateStepIngredient}
                  onRemoveStepIngredient={removeStepIngredient}
                  getUsedQuantity={getUsedQuantity}
                  disabled={stepsLocked}
                />
              ))}
            </SortableContext>
          </DndContext>
          <Button type="button" variant="outline" size="sm" onClick={addStep}>
            <Plus className="mr-2 h-4 w-4" />
            Add Step
          </Button>
        </CardContent>
        </fieldset>
      </Card>

      {/* Notes */}
      <Card>
        <CardHeader>
          <CardTitle>Notes</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            placeholder="Tips, variations, or personal notes..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
          />
        </CardContent>
      </Card>

      {/* Submit */}
      <div className="flex gap-3">
        <Button type="submit" disabled={saving || pendingReviewCount > 0}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {pendingReviewCount > 0
            ? `Review ${pendingReviewCount} ingredient${pendingReviewCount === 1 ? "" : "s"}`
            : isEditing
              ? "Update Recipe"
              : "Save Recipe"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>

      {isEditing && (
        <div className="flex justify-start border-t border-border pt-6">
          <Button
            type="button"
            variant="outline"
            className="text-destructive hover:text-destructive"
            onClick={() => setShowDeleteDialog(true)}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete Recipe
          </Button>
        </div>
      )}

      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Recipe</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &ldquo;{recipe?.title}&rdquo;? This action
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setShowDeleteDialog(false)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showVersionDialog} onOpenChange={setShowVersionDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>How do you want to save?</DialogTitle>
            <DialogDescription>
              Choose whether to update the current version or save your changes as a new version.
              Previous versions are always accessible from the recipe page.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-2">
            <Button
              onClick={() => handleVersionChoice(false)}
              variant="outline"
              disabled={saving}
              className="h-auto py-3 flex flex-col items-start gap-0.5 text-left"
            >
              <span className="font-semibold">Update existing (v{recipe?.version || 1})</span>
              <span className="text-xs font-normal text-muted-foreground">Overwrite the current version — use for small fixes or typos</span>
            </Button>
            <Button
              onClick={() => handleVersionChoice(true)}
              disabled={saving}
              className="h-auto py-3 flex flex-col items-start gap-0.5 text-left"
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <span className="font-semibold">Save as new version (v{(recipe?.version || 1) + 1})</span>
              <span className="text-xs font-normal text-primary-foreground/70">Keep the current version in history and create a new one</span>
            </Button>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowVersionDialog(false)} disabled={saving}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </form>
  );
}

// Muted one-liner reminder of what the AI produced. Rendered whenever the
// current row has drifted from the import (usually because the user picked a
// library ingredient whose default unit differs). Includes a one-click
// "restore" that pulls quantity + unit back to what the recipe said — the
// name is left alone because that's the mapping the user just chose.
function ImportReference({
  original,
  current,
  onRestore,
}: {
  original: { quantity: number | null; unit: string; name: string };
  current: { quantity: number | null; unit: string; name: string };
  onRestore: () => void;
}) {
  const qtyChanged = original.quantity !== current.quantity;
  const unitChanged = original.unit !== current.unit;
  const qtyUnitDrifted = qtyChanged || unitChanged;
  const formatQty = (q: number | null) => (q == null ? "" : String(q));
  return (
    <div className="mt-1 ml-6 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <span>
        From import:{" "}
        <span className="font-medium text-foreground/80">
          {formatQty(original.quantity)} {original.unit} {original.name}
        </span>
      </span>
      {qtyUnitDrifted && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs"
          onClick={onRestore}
          title="Restore the recipe's original quantity and unit"
        >
          Restore qty/unit
        </Button>
      )}
    </div>
  );
}

// Inline review panel for imported ingredients. Surfaces top library matches
// so the user can pick one, or confirm a create-new. Kept as a subcomponent
// so the match recompute on each render is cheap (small library, small list).
function ReviewPanel({
  name,
  library,
  onPickMatch,
  onKeepAsNew,
}: {
  name: string;
  library: LibraryIngredient[];
  onPickMatch: (item: LibraryIngredient) => void;
  onKeepAsNew: () => void;
}) {
  const matches = findLibraryMatches(name, library, 5);
  return (
    <div className="mt-2 ml-6 space-y-2 rounded-md bg-background/60 p-2 text-sm">
      {matches.length > 0 ? (
        <>
          <p className="text-xs text-muted-foreground">
            Looks similar to these existing ingredients — pick one to avoid duplicates:
          </p>
          <div className="flex flex-wrap gap-1.5">
            {matches.map((m) => (
              <Button
                key={m.item.id}
                type="button"
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 text-xs"
                onClick={() => onPickMatch(m.item)}
                title={`Use ${m.item.name} from your library`}
              >
                <Package className="h-3 w-3 text-muted-foreground" />
                {m.item.name}
              </Button>
            ))}
          </div>
        </>
      ) : (
        <p className="text-xs text-muted-foreground">
          No similar ingredients in your library.
        </p>
      )}
      <div className="flex items-center gap-2 pt-1">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="h-7 text-xs"
          onClick={onKeepAsNew}
        >
          Keep as new
        </Button>
        <span className="text-xs text-muted-foreground">
          — or edit the name above to refine the search.
        </span>
      </div>
    </div>
  );
}
