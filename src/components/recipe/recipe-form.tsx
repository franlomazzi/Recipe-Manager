"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/contexts/auth-context";
import {
  createRecipe,
  updateRecipe,
  saveRecipeVersion,
  markImprovementsApplied,
} from "@/lib/firebase/firestore";
import { uploadRecipeImage } from "@/lib/firebase/storage";
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
import { toast } from "sonner";
import type { Recipe, Ingredient, Step, StepIngredient, Difficulty, CookLog, LibraryIngredient } from "@/lib/types/recipe";
import { RECIPE_CATEGORIES, CUISINE_TAGS, DIET_TAGS } from "@/lib/types/recipe";
import { useIngredientLibrary } from "@/lib/hooks/use-ingredient-library";
import { saveIngredientToLibrary } from "@/lib/firebase/ingredient-library";
import { IngredientCombobox } from "@/components/recipe/ingredient-combobox";

interface RecipeFormProps {
  recipe?: Recipe;
  improvements?: CookLog[];
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

export function RecipeForm({ recipe, improvements }: RecipeFormProps) {
  const { user } = useAuth();
  const router = useRouter();
  const isEditing = !!recipe;
  const { items: libraryItems } = useIngredientLibrary();

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
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(recipe?.photoURL || null);
  const [saving, setSaving] = useState(false);
  const [aiPromptOpen, setAiPromptOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [generatingPhoto, setGeneratingPhoto] = useState(false);

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
      updated[index] = { ...updated[index], [field]: value };
      if (field === "name" && typeof value === "string") {
        updated[index].category = guessIngredientCategory(value);
      }
      return updated;
    });
  }

  function selectLibraryIngredient(index: number, item: LibraryIngredient) {
    setIngredients((prev) => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        id: item.id,
        name: item.name,
        unit: item.servingUnit || updated[index].unit,
        calories: item.calories,
        protein: item.protein,
        carbs: item.carbs,
        fat: item.fat,
        fiber: item.fiber,
        netCarbs: item.netCarbs,
        category: guessIngredientCategory(item.name),
      };
      return updated;
    });
  }

  function addIngredient() {
    setIngredients((prev) => [...prev, createEmptyIngredient()]);
  }

  function removeIngredient(index: number) {
    setIngredients((prev) => prev.filter((_, i) => i !== index));
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;

    if (!title.trim()) {
      toast.error("Please enter a recipe title");
      return;
    }

    const validIngredients = ingredients.filter((i) => i.name.trim());
    const validSteps = steps
      .filter((s) => s.instruction.trim())
      .map((s, i) => ({ ...s, order: i + 1 }));

    if (validIngredients.length === 0) {
      toast.error("Please add at least one ingredient");
      return;
    }

    if (validSteps.length === 0) {
      toast.error("Please add at least one step");
      return;
    }

    setSaving(true);

    try {
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
      };

      let recipeId: string;

      if (isEditing) {
        recipeId = recipe.id;

        // If applying improvements, save current state as version and bump
        if (improvements && improvements.length > 0) {
          const newVersion = (recipe.version || 1) + 1;
          await saveRecipeVersion(recipeId, recipe, "Before applying improvements");
          recipeData.version = newVersion;
          await updateRecipe(recipeId, recipeData);
          await markImprovementsApplied(recipeId, newVersion);
        } else {
          await updateRecipe(recipeId, recipeData);
        }
      } else {
        recipeId = await createRecipe(user.uid, recipeData);
      }

      // Save any new ingredients (not already in library) to nutrition_ingredients
      const libraryIds = new Set(libraryItems.map((li) => li.id));
      const newIngredients = validIngredients.filter(
        (ing) => !libraryIds.has(ing.id)
      );
      await Promise.all(
        newIngredients.map((ing) =>
          saveIngredientToLibrary(user.uid, {
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

      if (imageFile) {
        const { compressImage } = await import("@/lib/utils/image-compress");
        const compressed = await compressImage(imageFile);
        const { url, path } = await uploadRecipeImage(user.uid, recipeId, compressed);
        await updateRecipe(recipeId, { photoURL: url, photoStoragePath: path });
      }

      toast.success(isEditing ? "Recipe updated!" : "Recipe created!");
      router.push(`/recipes/${recipeId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save recipe");
    } finally {
      setSaving(false);
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
        </CardHeader>
        <CardContent className="space-y-3">
          {ingredients.map((ing, index) => (
            <div key={ing.id} className="flex items-start gap-2">
              <GripVertical className="mt-2.5 h-4 w-4 shrink-0 text-muted-foreground/50 hidden sm:block" />
              <div className="grid flex-1 grid-cols-6 sm:grid-cols-12 gap-2">
                <Input
                  className="col-span-2"
                  placeholder="Qty"
                  type="number"
                  step="any"
                  min="0"
                  value={ing.quantity ?? ""}
                  onChange={(e) =>
                    updateIngredient(
                      index,
                      "quantity",
                      e.target.value ? parseFloat(e.target.value) : null
                    )
                  }
                />
                <UnitCombobox
                  className="col-span-2"
                  value={ing.unit}
                  onValueChange={(v) => updateIngredient(index, "unit", v)}
                />
                <IngredientCombobox
                  className="col-span-2 sm:col-span-5"
                  value={ing.name}
                  libraryItems={libraryItems}
                  onSelectLibraryItem={(item) => selectLibraryIngredient(index, item)}
                  onNameChange={(name) => updateIngredient(index, "name", name)}
                />
                <Input
                  className="col-span-5 sm:col-span-3"
                  placeholder="Note (optional)"
                  value={ing.note}
                  onChange={(e) => updateIngredient(index, "note", e.target.value)}
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="mt-1 h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => removeIngredientAndCleanSteps(index)}
                disabled={ingredients.length === 1}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={addIngredient}>
            <Plus className="mr-2 h-4 w-4" />
            Add Ingredient
          </Button>
        </CardContent>
      </Card>

      {/* Steps */}
      <Card>
        <CardHeader>
          <CardTitle>Instructions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {steps.map((step, index) => (
            <div
              key={step.id}
              className="relative rounded-lg border border-border bg-muted/30 p-4"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                  {index + 1}
                </div>
                <div className="flex-1 space-y-3">
                  <Textarea
                    placeholder={`Describe step ${index + 1}... (e.g., "Preheat oven to 375°F")`}
                    value={step.instruction}
                    onChange={(e) => updateStep(index, "instruction", e.target.value)}
                    rows={2}
                    className="bg-background"
                  />

                  {/* Timer controls */}
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant={step.timerMinutes ? "default" : "outline"}
                      size="sm"
                      onClick={() => toggleStepTimer(index)}
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
                            updateStep(index, "timerMinutes", parseInt(e.target.value) || 1)
                          }
                          className="h-7 w-16 border-0 bg-transparent p-0 text-center text-sm"
                        />
                        <span className="text-xs text-muted-foreground">min</span>
                        <Separator orientation="vertical" className="h-4" />
                        <Input
                          type="text"
                          placeholder="Label"
                          value={step.timerLabel || ""}
                          onChange={(e) => updateStep(index, "timerLabel", e.target.value)}
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
                          const ing = ingredients.find(
                            (i) => i.id === si.ingredientId
                          );
                          if (!ing) return null;
                          const usedElsewhere = getUsedQuantity(
                            si.ingredientId,
                            index
                          );
                          const maxAvailable =
                            ing.quantity !== null
                              ? Math.max(
                                  0,
                                  ing.quantity - usedElsewhere
                                )
                              : null;
                          return (
                            <div
                              key={si.ingredientId}
                              className="flex items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5"
                            >
                              <span className="text-sm truncate flex-1 min-w-0">
                                {ing.name}
                                {ing.unit && (
                                  <span className="text-muted-foreground">
                                    {" "}
                                    ({ing.unit})
                                  </span>
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
                                      updateStepIngredient(
                                        index,
                                        si.ingredientId,
                                        e.target.value
                                          ? parseFloat(e.target.value)
                                          : null
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
                                onClick={() =>
                                  removeStepIngredient(
                                    index,
                                    si.ingredientId
                                  )
                                }
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
                        !step.ingredients.some(
                          (si) => si.ingredientId === ing.id
                        )
                    ) && (
                      <Select
                        value=""
                        onValueChange={(id) => id && addStepIngredient(index, id)}
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
                                !step.ingredients.some(
                                  (si) => si.ingredientId === ing.id
                                )
                            )
                            .map((ing) => {
                              const remaining =
                                ing.quantity !== null
                                  ? ing.quantity -
                                    getUsedQuantity(ing.id)
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
                  onClick={() => removeStep(index)}
                  disabled={steps.length === 1}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={addStep}>
            <Plus className="mr-2 h-4 w-4" />
            Add Step
          </Button>
        </CardContent>
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
        <Button type="submit" disabled={saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isEditing ? "Update Recipe" : "Save Recipe"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
