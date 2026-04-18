"use client";

import { useParams, useRouter } from "next/navigation";
import { useRecipe } from "@/lib/hooks/use-recipe";
import { useAuth } from "@/lib/contexts/auth-context";
import { useHousehold } from "@/lib/contexts/household-context";
import { ShareRecipeToggle } from "@/components/recipe/share-recipe-toggle";
import {
  deleteRecipe,
  updateRecipe,
  forkRecipe,
  subscribeToCookLogs,
  subscribeToVersions,
  restoreVersion,
  deleteVersion,
} from "@/lib/firebase/firestore";
import { deleteRecipeImage } from "@/lib/firebase/storage";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  ChefHat,
  Clock,
  Edit,
  Heart,
  Loader2,
  Play,
  Trash2,
  Users,
  ArrowLeft,
  GitFork,
  History,
  Star,
  Minus,
  Plus,
  RotateCcw,
  Check,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { useState, useEffect, useMemo } from "react";
import { ImprovementSuggestions } from "@/components/recipe/improvement-suggestions";
import { useCookingSession } from "@/lib/contexts/cooking-session-context";
import { useActivePlan } from "@/lib/hooks/use-active-plan";
import { getIndicesForDate } from "@/lib/firebase/meal-plans";
import { addRecipeToWeek, subscribeToShoppingListState } from "@/lib/firebase/shopping-list";
import type { ExtraRecipeEntry } from "@/lib/types/shopping-list";
import { addDays, format, parseISO } from "date-fns";
import { ShoppingCart, ChevronLeft, ChevronRight } from "lucide-react";
import type { CookLog, RecipeVersion } from "@/lib/types/recipe";
import type { ShoppingListState } from "@/lib/types/shopping-list";

export default function RecipeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const recipeId = params.recipeId as string;
  const { recipe, loading } = useRecipe(recipeId);
  const { user } = useAuth();
  const { partnerUid, partnerName } = useHousehold();
  const isMine = !!user && recipe?.userId === user.uid;
  const { sessions } = useCookingSession();
  const activeSession = recipe ? sessions.find((s) => s.recipeId === recipe.id) : undefined;
  const isCurrentlyCooking = !!activeSession;

  const [deleting, setDeleting] = useState(false);
  const [servingMultiplier, setServingMultiplier] = useState(1);
  const [showCookDialog, setShowCookDialog] = useState(false);
  const [cookServings, setCookServings] = useState<number>(1);
  const [forkTitle, setForkTitle] = useState("");
  const [forking, setForking] = useState(false);
  const [cookLogs, setCookLogs] = useState<CookLog[]>([]);
  const [versions, setVersions] = useState<RecipeVersion[]>([]);
  const [restoringVersion, setRestoringVersion] = useState<number | null>(null);
  const [showShoppingDialog, setShowShoppingDialog] = useState(false);
  const [shoppingListState, setShoppingListState] = useState<ShoppingListState | null>(null);
  const [shoppingWeekIndex, setShoppingWeekIndex] = useState(0);
  const [addingToShopping, setAddingToShopping] = useState(false);

  const { instance: activePlan } = useActivePlan();
  const [deletingVersion, setDeletingVersion] = useState<number | null>(null);

  useEffect(() => {
    if (!recipeId) return;
    const unsub1 = subscribeToCookLogs(recipeId, setCookLogs);
    const unsub2 = subscribeToVersions(recipeId, setVersions);
    return () => { unsub1(); unsub2(); };
  }, [recipeId]);

  // Subscribe to shopping list state (needed to check existing extras)
  useEffect(() => {
    if (!user) return;
    const unsub = subscribeToShoppingListState(user.uid, setShoppingListState);
    return unsub;
  }, [user]);

  // Default shopping week to the current plan week
  useEffect(() => {
    if (!activePlan) return;
    const idx = getIndicesForDate(activePlan, new Date());
    setShoppingWeekIndex(idx?.weekIndex ?? 0);
  }, [activePlan]);

  const shoppingWeekRange = useMemo(() => {
    if (!activePlan) return null;
    const start = addDays(parseISO(activePlan.startDate), shoppingWeekIndex * 7);
    const end = addDays(start, 6);
    return { start, end };
  }, [activePlan, shoppingWeekIndex]);

  const extraByWeek = useMemo(
    () => shoppingListState?.extraByWeek ?? {},
    [shoppingListState]
  );

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!recipe) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <h2 className="text-lg font-semibold">Recipe not found</h2>
        <Button className="mt-4" variant="outline" render={<Link href="/recipes" />}>
          Back to Recipes
        </Button>
      </div>
    );
  }

  const adjustedServings = recipe.servings * servingMultiplier;

  function scaleQuantity(qty: number | null): string {
    if (qty === null) return "";
    const scaled = qty * servingMultiplier;
    // Clean display: avoid floating point weirdness
    return scaled % 1 === 0 ? String(scaled) : scaled.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  }

  async function handleToggleFavorite() {
    if (!recipe) return;
    await updateRecipe(recipe.id, { isFavorite: !recipe.isFavorite });
  }

  async function handleFork() {
    if (!recipe || !user || !forkTitle.trim()) return;
    setForking(true);
    try {
      const newId = await forkRecipe(user.uid, recipe, forkTitle.trim());
      toast.success("Recipe forked!");
      router.push(`/recipes/${newId}`);
    } catch {
      toast.error("Failed to fork recipe");
    } finally {
      setForking(false);
    }
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

  async function handleRestoreVersion(version: RecipeVersion) {
    if (!recipe) return;
    setRestoringVersion(version.version);
    try {
      await restoreVersion(recipe.id, version);
      toast.success(`Switched to v${version.version}`);
    } catch {
      toast.error("Failed to restore version");
    } finally {
      setRestoringVersion(null);
    }
  }

  async function handleDeleteVersion(versionNum: number) {
    if (!recipe) return;
    setDeletingVersion(versionNum);
    try {
      await deleteVersion(recipe.id, versionNum);
      toast.success(`Version ${versionNum} deleted`);
    } catch {
      toast.error("Failed to delete version");
    } finally {
      setDeletingVersion(null);
    }
  }

  async function handleAddToShoppingList() {
    if (!user || !recipe) return;
    setAddingToShopping(true);
    try {
      await addRecipeToWeek(user.uid, shoppingWeekIndex, {
        recipeId: recipe.id,
        servingMultiplier: servingMultiplier,
      }, extraByWeek);
      toast.success("Added to shopping list");
      setShowShoppingDialog(false);
    } catch {
      toast.error("Failed to add to shopping list");
    } finally {
      setAddingToShopping(false);
    }
  }

  function renderStars(rating: number) {
    return Array.from({ length: 5 }, (_, i) => (
      <Star
        key={i}
        className={`h-4 w-4 ${
          i < Math.round(rating) ? "fill-primary text-primary" : "text-muted-foreground/30"
        }`}
      />
    ));
  }

  return (
    <div className="mx-auto max-w-4xl p-4 md:p-6 lg:p-4 2xl:p-8 2xl:max-w-6xl space-y-6 lg:space-y-4 2xl:space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="rounded-xl" render={<Link href="/recipes" />}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1" />
        <Button variant="ghost" size="icon" className="rounded-xl" onClick={handleToggleFavorite}>
          <Heart
            className={`h-5 w-5 ${
              recipe.isFavorite ? "fill-primary text-primary" : ""
            }`}
          />
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="rounded-xl"
          onClick={() => setShowShoppingDialog(true)}
          disabled={recipe.ingredients.length === 0}
          title={recipe.ingredients.length === 0 ? "No ingredients to add" : "Add to shopping list"}
        >
          <ShoppingCart className="mr-2 h-4 w-4" />
          Add to shopping list
        </Button>
        <ShareRecipeToggle
          recipeId={recipe.id}
          shared={!!recipe.householdShared}
          visible={isMine && !!partnerUid}
        />
        {isMine && (
          <Button variant="outline" size="sm" className="rounded-xl" render={<Link href={`/recipes/${recipe.id}/edit`} />}>
            <Edit className="mr-2 h-4 w-4" />
            Edit
          </Button>
        )}
        {isCurrentlyCooking ? (
          <Button className="rounded-xl" render={<Link href="/cook" />}>
            <ChefHat className="mr-2 h-4 w-4" />
            Back to cooking
          </Button>
        ) : (
          <Button
            className="rounded-xl"
            onClick={() => {
              setCookServings(recipe.servings);
              setShowCookDialog(true);
            }}
          >
            <Play className="mr-2 h-4 w-4" />
            Cook
          </Button>
        )}
      </div>

      {/* Hero + Title row — side-by-side on lg+, photo capped at 2xl */}
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-5">
        {/* Photo */}
        {recipe.photoURL ? (
          <div className="overflow-hidden rounded-2xl lg:h-40 lg:w-40 lg:shrink-0 2xl:h-56 2xl:w-56">
            <img
              src={recipe.photoURL}
              alt={recipe.title}
              className="aspect-video w-full object-cover lg:aspect-square lg:h-full lg:w-full"
            />
          </div>
        ) : (
          <div className="flex aspect-video w-full items-center justify-center rounded-2xl bg-muted/60 lg:aspect-square lg:h-40 lg:w-40 lg:shrink-0 2xl:h-56 2xl:w-56">
            <ChefHat className="h-16 w-16 text-muted-foreground/20 lg:h-10 lg:w-10 2xl:h-14 2xl:w-14" />
          </div>
        )}

        {/* Title & Meta */}
        <div className="flex-1 min-w-0">
        <div className="flex items-start gap-3">
          <h1 className="text-3xl font-bold flex-1">{recipe.title}</h1>
          {recipe.rating !== null && recipe.rating !== undefined && (
            <div className="flex items-center gap-1 pt-1">
              {renderStars(recipe.rating)}
              <span className="ml-1 text-sm text-muted-foreground">
                ({recipe.cookCount})
              </span>
            </div>
          )}
        </div>
        {!isMine && (
          <div className="mt-2">
            <Badge variant="secondary" className="text-xs">
              <Users className="mr-1 h-3 w-3" />
              Shared by {partnerName ?? "your partner"}
            </Badge>
          </div>
        )}
        {recipe.description && (
          <p className="mt-2 text-muted-foreground">{recipe.description}</p>
        )}
        {/* Lineage info */}
        {recipe.parentRecipeId && (
          <p className="mt-1 text-xs text-muted-foreground">
            <GitFork className="mr-1 inline h-3 w-3" />
            Forked from{" "}
            <Link
              href={`/recipes/${recipe.parentRecipeId}`}
              className="text-primary hover:underline"
            >
              {recipe.parentRecipeTitle || "original recipe"}
            </Link>
            {recipe.forkedFromVersion && ` (v${recipe.forkedFromVersion})`}
          </p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
          {recipe.totalTime > 0 && (
            <span className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              {recipe.prepTime > 0 && `${recipe.prepTime}m prep`}
              {recipe.prepTime > 0 && recipe.cookTime > 0 && " + "}
              {recipe.cookTime > 0 && `${recipe.cookTime}m cook`}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Users className="h-4 w-4" />
            {recipe.servings} servings
          </span>
          <Badge variant="secondary">{recipe.difficulty}</Badge>
          {(recipe.version ?? 1) > 1 && (
            <Badge variant="outline">
              <History className="mr-1 h-3 w-3" />
              v{recipe.version}
            </Badge>
          )}
        </div>
        {recipe.categories.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {recipe.categories.map((cat) => (
              <Badge key={cat} variant="outline">
                {cat}
              </Badge>
            ))}
          </div>
        )}
        </div>
      </div>

      {/* Serving Multiplier / Cooking Status */}
      {isCurrentlyCooking ? (
        <Card className="card-elevated border-primary/20 bg-primary/5">
          <CardContent className="py-3 lg:py-2 2xl:py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ChefHat className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium text-primary">Currently cooking</span>
              </div>
              <span className="text-sm text-muted-foreground">
                {recipe.servings * activeSession!.servingMultiplier} servings · locked
              </span>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="card-elevated border-transparent">
          <CardContent className="py-3 lg:py-2 2xl:py-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Adjust servings</span>
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setServingMultiplier((m) => Math.max(0.5, m - 0.5))}
                  disabled={servingMultiplier <= 0.5}
                >
                  <Minus className="h-3 w-3" />
                </Button>
                <div className="text-center min-w-[80px]">
                  <span className="text-lg font-bold">{adjustedServings}</span>
                  <span className="text-sm text-muted-foreground ml-1">servings</span>
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setServingMultiplier((m) => m + 0.5)}
                >
                  <Plus className="h-3 w-3" />
                </Button>
                {servingMultiplier !== 1 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setServingMultiplier(1)}
                  >
                    Reset
                  </Button>
                )}
              </div>
            </div>
            {servingMultiplier !== 1 && (
              <p className="mt-1 text-xs text-muted-foreground text-right">
                {servingMultiplier}x original quantities
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Add to shopping list dialog */}
      {showShoppingDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl border-transparent bg-card shadow-2xl">
            <div className="px-6 pt-6 pb-2">
              <h3 className="text-lg font-semibold">Add to shopping list</h3>
              <p className="text-sm text-muted-foreground mt-0.5">
                {recipe.ingredients.length} ingredient{recipe.ingredients.length === 1 ? "" : "s"} · {servingMultiplier === 1 ? "default servings" : `${servingMultiplier}× servings`}
              </p>
            </div>

            {activePlan ? (
              <div className="px-6 py-4">
                <p className="text-xs font-medium text-muted-foreground mb-2">Add to week</p>
                <div className="flex items-center gap-3 rounded-xl border bg-muted/40 px-3 py-2">
                  <Button
                    variant="ghost" size="icon" className="h-8 w-8 shrink-0"
                    disabled={shoppingWeekIndex === 0}
                    onClick={() => setShoppingWeekIndex((i) => i - 1)}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <div className="flex-1 text-center">
                    <p className="text-sm font-semibold">Week {shoppingWeekIndex + 1}</p>
                    {shoppingWeekRange && (
                      <p className="text-xs text-muted-foreground">
                        {format(shoppingWeekRange.start, "MMM d")} – {format(shoppingWeekRange.end, "MMM d")}
                      </p>
                    )}
                  </div>
                  <Button
                    variant="ghost" size="icon" className="h-8 w-8 shrink-0"
                    disabled={shoppingWeekIndex >= activePlan.snapshot.length - 1}
                    onClick={() => setShoppingWeekIndex((i) => i + 1)}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ) : (
              <div className="px-6 py-4">
                <p className="text-sm text-muted-foreground">Ingredients will be added to your shopping list.</p>
              </div>
            )}

            <div className="flex gap-2 px-6 pb-6 pt-1">
              <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setShowShoppingDialog(false)}>
                Cancel
              </Button>
              <Button
                className="flex-1 rounded-xl"
                onClick={handleAddToShoppingList}
                disabled={addingToShopping}
              >
                {addingToShopping ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <ShoppingCart className="mr-2 h-4 w-4" />
                )}
                Add ingredients
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Cook serving-picker dialog */}
      {showCookDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl border-transparent bg-card shadow-2xl">
            <div className="px-6 pt-6 pb-2">
              <h3 className="text-lg font-semibold">How many servings?</h3>
              <p className="text-sm text-muted-foreground mt-0.5">
                Quantities will be scaled to your chosen amount.
              </p>
            </div>
            <div className="px-6 py-4 flex items-center justify-center gap-4">
              <Button
                variant="outline"
                size="icon"
                className="h-10 w-10 rounded-xl"
                onClick={() => setCookServings((s) => Math.max(0.5, s - 0.5))}
                disabled={cookServings <= 0.5}
              >
                <Minus className="h-4 w-4" />
              </Button>
              <div className="text-center min-w-[100px]">
                <span className="text-3xl font-bold">{cookServings}</span>
                <p className="text-sm text-muted-foreground">
                  servings
                  {cookServings === recipe.servings && (
                    <span className="ml-1 text-primary font-medium">(default)</span>
                  )}
                </p>
              </div>
              <Button
                variant="outline"
                size="icon"
                className="h-10 w-10 rounded-xl"
                onClick={() => setCookServings((s) => s + 0.5)}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex gap-2 px-6 pb-6 pt-2">
              <Button
                variant="outline"
                className="flex-1 rounded-xl"
                onClick={() => setShowCookDialog(false)}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 rounded-xl"
                onClick={() => {
                  setShowCookDialog(false);
                  router.push(`/recipes/${recipe.id}/cook?servings=${cookServings}`);
                }}
              >
                <Play className="mr-2 h-4 w-4" />
                Start cooking
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Improvement Suggestions */}
      <ImprovementSuggestions cookLogs={cookLogs} recipeId={recipe.id} />

      {/* Ingredients & Steps */}
      <div className="grid gap-6 md:grid-cols-[1fr_1.5fr]">
        {/* Ingredients panel */}
        <Card className="h-fit md:sticky md:top-4 card-elevated border-transparent">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Ingredients</CardTitle>
            <p className="text-xs text-muted-foreground">
              {recipe.ingredients.length} items
              {servingMultiplier !== 1 && (
                <span className="ml-1 text-primary">
                  (scaled {servingMultiplier}x)
                </span>
              )}
            </p>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2.5">
              {recipe.ingredients.map((ing) => (
                <li
                  key={ing.id}
                  className="flex items-baseline gap-2.5 rounded-md px-2 py-1.5 transition-colors hover:bg-muted/50"
                >
                  <Checkbox className="mt-0.5 shrink-0" />
                  <span className="text-sm leading-snug">
                    {ing.quantity !== null && (
                      <span className="font-semibold">{scaleQuantity(ing.quantity)}</span>
                    )}{" "}
                    {ing.unit && (
                      <span className="text-muted-foreground">{ing.unit}</span>
                    )}{" "}
                    {ing.name}
                    {ing.note && (
                      <span className="text-muted-foreground italic">
                        {" "}
                        &mdash; {ing.note}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {/* Steps */}
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Instructions</h2>
          <div className="space-y-3">
            {recipe.steps.map((step, index) => (
              <div
                key={step.id}
                className="group rounded-2xl bg-card p-4 card-elevated border-transparent transition-all hover:scale-[1.01]"
              >
                <div className="flex gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-sm font-bold text-primary-foreground">
                    {index + 1}
                  </div>
                  <div className="flex-1 space-y-2 pt-0.5">
                    <p className="text-[15px] leading-relaxed">
                      {step.instruction}
                    </p>
                    {step.timerMinutes && (
                      <div className="inline-flex items-center gap-2 rounded-lg bg-primary/10 px-3 py-1.5">
                        <Clock className="h-4 w-4 text-primary" />
                        <span className="text-sm font-medium text-primary">
                          {step.timerMinutes} min
                        </span>
                        {step.timerLabel && (
                          <span className="text-sm text-primary/70">
                            &middot; {step.timerLabel}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Notes */}
      {recipe.notes && (
        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground whitespace-pre-wrap">{recipe.notes}</p>
          </CardContent>
        </Card>
      )}

      <RecipeSourceLine url={recipe.sourceUrl ?? null} />

      {/* Cook Logs & Version History */}
      {(cookLogs.length > 0 || versions.length > 0) && (
        <Tabs defaultValue="logs">
          <TabsList>
            <TabsTrigger value="logs">
              Cook Log ({cookLogs.length})
            </TabsTrigger>
            <TabsTrigger value="versions">
              <History className="mr-1.5 h-3.5 w-3.5" />
              Versions ({versions.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="logs" className="space-y-3 mt-3">
            {cookLogs.map((log) => (
              <Card key={log.id}>
                <CardContent className="py-4">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        {renderStars(log.rating)}
                        <span className="text-xs text-muted-foreground">
                          {log.servingsCooked} servings
                          {" \u00B7 v" + log.version}
                        </span>
                      </div>
                      {log.notes && (
                        <p className="text-sm">{log.notes}</p>
                      )}
                      {log.improvements && (
                        <div className="mt-2 rounded-md bg-muted/50 p-2">
                          <p className="text-xs font-medium text-muted-foreground mb-1">
                            Improvements
                          </p>
                          <p className="text-sm">{log.improvements}</p>
                        </div>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0 ml-4">
                      {log.cookedAt?.toDate?.()
                        ? log.cookedAt.toDate().toLocaleDateString()
                        : ""}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="versions" className="space-y-3 mt-3">
            {/* Current version indicator */}
            <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
              <Check className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">
                Current: v{recipe.version || 1}
              </span>
              <span className="text-xs text-muted-foreground">
                &mdash; {recipe.title}
              </span>
            </div>

            {versions.map((v) => (
              <Card key={v.id}>
                <CardContent className="py-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">v{v.version}</Badge>
                        <span className="text-sm font-medium">{v.title}</span>
                      </div>
                      {v.changeNote && (
                        <p className="mt-1 text-sm text-muted-foreground">
                          {v.changeNote}
                        </p>
                      )}
                      <p className="mt-1 text-xs text-muted-foreground">
                        {v.ingredients.length} ingredients &middot; {v.steps.length} steps
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 ml-4">
                      <span className="text-xs text-muted-foreground mr-1">
                        {v.createdAt?.toDate?.()
                          ? v.createdAt.toDate().toLocaleDateString()
                          : ""}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => handleRestoreVersion(v)}
                        disabled={restoringVersion === v.version}
                      >
                        {restoringVersion === v.version ? (
                          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                        ) : (
                          <RotateCcw className="mr-1 h-3 w-3" />
                        )}
                        Set as Current
                      </Button>
                      <Dialog>
                        <DialogTrigger render={
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          />
                        }>
                          <Trash2 className="h-3 w-3" />
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Delete Version {v.version}</DialogTitle>
                            <DialogDescription>
                              Are you sure you want to delete v{v.version} of &ldquo;{v.title}&rdquo;?
                              This cannot be undone.
                            </DialogDescription>
                          </DialogHeader>
                          <DialogFooter>
                            <Button
                              variant="destructive"
                              onClick={() => handleDeleteVersion(v.version)}
                              disabled={deletingVersion === v.version}
                            >
                              {deletingVersion === v.version && (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              )}
                              Delete
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>
        </Tabs>
      )}

      {/* Actions: Fork & Delete */}
      <div className="flex flex-wrap gap-3 pt-4">
        <Dialog>
          <DialogTrigger render={<Button variant="outline" />}>
            <GitFork className="mr-2 h-4 w-4" />
            Fork as Variation
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Fork Recipe</DialogTitle>
              <DialogDescription>
                Create a new recipe based on &ldquo;{recipe.title}&rdquo;.
                All ingredients and steps will be copied so you can modify them independently.
              </DialogDescription>
            </DialogHeader>
            <Input
              placeholder="New recipe name (e.g., Spicy Chicken Variation)"
              value={forkTitle}
              onChange={(e) => setForkTitle(e.target.value)}
            />
            <DialogFooter>
              <Button onClick={handleFork} disabled={forking || !forkTitle.trim()}>
                {forking && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <GitFork className="mr-2 h-4 w-4" />
                Fork Recipe
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {isMine && (
        <Dialog>
          <DialogTrigger render={<Button variant="outline" className="text-destructive hover:text-destructive" />}>
            <Trash2 className="mr-2 h-4 w-4" />
            Delete Recipe
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Recipe</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete &ldquo;{recipe.title}&rdquo;? This action
                cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
                {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        )}
      </div>
    </div>
  );
}

// Discreet source attribution for imported recipes. Renders nothing when
// there's no sourceUrl (hand-authored recipes stay clean). Shows the
// hostname so the footer stays readable even for ugly tracking-laden URLs,
// but links the full canonical URL.
function RecipeSourceLine({ url }: { url: string | null }) {
  if (!url) return null;
  let hostname = url;
  try {
    hostname = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    // Malformed URL — fall through and show the raw string.
  }
  return (
    <p className="pt-2 text-center text-xs text-muted-foreground">
      Imported from{" "}
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="underline decoration-dotted hover:text-foreground"
      >
        {hostname}
      </a>
    </p>
  );
}
