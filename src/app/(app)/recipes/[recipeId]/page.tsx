"use client";

import { useParams, useRouter } from "next/navigation";
import { useRecipe } from "@/lib/hooks/use-recipe";
import { useKitchenTool } from "@/lib/hooks/use-kitchen-tool";
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
  ChevronDown,
  Eye,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { useState, useEffect, useMemo } from "react";
import { ImprovementSuggestions } from "@/components/recipe/improvement-suggestions";
import { useCookingSession } from "@/lib/contexts/cooking-session-context";
import { useActivePlan } from "@/lib/hooks/use-active-plan";
import { getIndicesForDate } from "@/lib/firebase/meal-plans";
import { addRecipeToWeek, subscribeToShoppingListState } from "@/lib/firebase/shopping-list";
import { isoWeekKeyForOffset } from "@/lib/utils/week-keys";
import type { ExtraRecipeEntry } from "@/lib/types/shopping-list";
import {
  addDays,
  format,
  formatDistanceToNow,
  parseISO,
  startOfWeek,
  differenceInCalendarDays,
} from "date-fns";
import { ShoppingCart, ChevronLeft, ChevronRight } from "lucide-react";
import type { CookLog, RecipeVersion } from "@/lib/types/recipe";
import type { ShoppingListState } from "@/lib/types/shopping-list";

export default function RecipeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const recipeId = params.recipeId as string;
  const { recipe, loading } = useRecipe(recipeId);
  const isKT = useKitchenTool();
  const { user } = useAuth();
  const { partnerUid, partnerName } = useHousehold();
  const isMine = !!user && recipe?.userId === user.uid;
  const { sessions } = useCookingSession();
  const activeSession = recipe ? sessions.find((s) => s.recipeId === recipe.id) : undefined;
  const isCurrentlyCooking = !!activeSession;

  const [deleting, setDeleting] = useState(false);
  const [historyExpanded, setHistoryExpanded] = useState(false);
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
  const [versionsExpanded, setVersionsExpanded] = useState(false);
  const [previewVersion, setPreviewVersion] = useState<RecipeVersion | null>(null);

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

  // Calendar-week helpers — same logic as weekly-view and shopping-list page
  const calendarWeekMeta = useMemo(() => {
    if (!activePlan) return { firstMonday: new Date(), totalWeeks: 1 };
    const planStart = parseISO(activePlan.startDate);
    const planEnd = addDays(planStart, activePlan.snapshot.length * 7 - 1);
    const firstMonday = startOfWeek(planStart, { weekStartsOn: 1 });
    const lastMonday = startOfWeek(planEnd, { weekStartsOn: 1 });
    const totalWeeks = differenceInCalendarDays(lastMonday, firstMonday) / 7 + 1;
    return { firstMonday, totalWeeks };
  }, [activePlan]);

  // Default shopping week to the current calendar week
  useEffect(() => {
    if (!activePlan) return;
    const planStart = parseISO(activePlan.startDate);
    const firstMonday = startOfWeek(planStart, { weekStartsOn: 1 });
    const planEnd = addDays(planStart, activePlan.snapshot.length * 7 - 1);
    const lastMonday = startOfWeek(planEnd, { weekStartsOn: 1 });
    const totalWeeks = differenceInCalendarDays(lastMonday, firstMonday) / 7 + 1;
    const todayMonday = startOfWeek(new Date(), { weekStartsOn: 1 });
    const offset = differenceInCalendarDays(todayMonday, firstMonday) / 7;
    setShoppingWeekIndex(Math.max(0, Math.min(totalWeeks - 1, offset)));
  }, [activePlan]);

  const shoppingWeekRange = useMemo(() => {
    if (!activePlan) return null;
    const start = addDays(calendarWeekMeta.firstMonday, shoppingWeekIndex * 7);
    const end = addDays(start, 6);
    return { start, end };
  }, [activePlan, shoppingWeekIndex, calendarWeekMeta]);

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

  // Branch early for the experimental Kitchen Tool layout.
  if (isKT && recipe) {
    return (
      <KitchenToolRecipeDetail
        recipe={recipe}
        isMine={isMine}
        servingMultiplier={servingMultiplier}
        setServingMultiplier={setServingMultiplier}
        isCurrentlyCooking={isCurrentlyCooking}
        onStartCook={() => {
          setCookServings(recipe.servings * servingMultiplier);
          setShowCookDialog(true);
        }}
        onAddToShopping={() => setShowShoppingDialog(true)}
        onToggleFavorite={handleToggleFavorite}
        cookLogs={cookLogs}
        showCookDialog={showCookDialog}
        setShowCookDialog={setShowCookDialog}
        cookServings={cookServings}
        setCookServings={setCookServings}
        showShoppingDialog={showShoppingDialog}
        setShowShoppingDialog={setShowShoppingDialog}
        activePlan={activePlan}
        shoppingWeekIndex={shoppingWeekIndex}
        setShoppingWeekIndex={setShoppingWeekIndex}
        shoppingWeekRange={shoppingWeekRange}
        totalShoppingWeeks={calendarWeekMeta.totalWeeks}
        addingToShopping={addingToShopping}
        handleAddToShoppingList={handleAddToShoppingList}
        router={router}
      />
    );
  }

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
    const weekKey = activePlan
      ? isoWeekKeyForOffset(activePlan.startDate, shoppingWeekIndex)
      : String(shoppingWeekIndex);
    try {
      await addRecipeToWeek(user.uid, weekKey, {
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
    <div className={`mx-auto max-w-4xl p-4 md:p-6 lg:p-4 2xl:p-8 2xl:max-w-6xl space-y-6 lg:space-y-4 2xl:space-y-6${isKT ? " kt-recipe-detail" : ""}`}>
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
          <ShoppingCart className="h-4 w-4 sm:mr-2" />
          <span className="hidden sm:inline">Add to shopping list</span>
        </Button>
        <ShareRecipeToggle
          recipeId={recipe.id}
          shared={!!recipe.householdShared}
          visible={isMine && !!partnerUid}
        />
        {isMine && (
          <Button variant="outline" size="sm" className="rounded-xl" render={<Link href={`/recipes/${recipe.id}/edit`} />}>
            <Edit className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Edit</span>
          </Button>
        )}
        {isCurrentlyCooking ? (
          <Button className="rounded-xl" render={<Link href="/cook" />}>
            <ChefHat className="mr-2 h-4 w-4" />
            <span className="hidden sm:inline">Back to </span>cooking
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
          {cookLogs.length > 0 && cookLogs[0].cookedAt?.toDate?.() && (
            <span className="flex items-center gap-1">
              <History className="h-4 w-4" />
              Last cooked {formatDistanceToNow(cookLogs[0].cookedAt.toDate(), { addSuffix: true })}
            </span>
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
                    disabled={shoppingWeekIndex >= calendarWeekMeta.totalWeeks - 1}
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
                    {step.ingredients.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-0.5">
                        {step.ingredients.map((si) => {
                          const ing = recipe.ingredients.find((i) => i.id === si.ingredientId);
                          if (!ing) return null;
                          return (
                            <Badge key={si.ingredientId} variant="secondary" className="text-xs font-normal">
                              {si.quantity !== null
                                ? `${scaleQuantity(si.quantity)} `
                                : ing.quantity !== null
                                ? `${scaleQuantity(ing.quantity)} `
                                : ""}
                              {ing.unit && `${ing.unit} `}
                              {ing.name}
                            </Badge>
                          );
                        })}
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

      {/* Cook History */}
      {cookLogs.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold">Cook History</h2>
              <Badge variant="secondary" className="text-xs">
                {cookLogs.length} {cookLogs.length === 1 ? "session" : "sessions"}
              </Badge>
            </div>
            {cookLogs.length > 1 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setHistoryExpanded((e) => !e)}
                className="text-muted-foreground h-8 gap-1"
              >
                {historyExpanded ? "Show less" : `Show all ${cookLogs.length}`}
                <ChevronDown
                  className={`h-4 w-4 transition-transform duration-200 ${
                    historyExpanded ? "rotate-180" : ""
                  }`}
                />
              </Button>
            )}
          </div>

          <div className="space-y-3">
            {(historyExpanded ? cookLogs : cookLogs.slice(0, 1)).map((log) => (
              <Card key={log.id} className="card-elevated border-transparent">
                <CardContent className="py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="flex items-center gap-0.5">
                          {renderStars(log.rating)}
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {log.servingsCooked} {log.servingsCooked === 1 ? "serving" : "servings"}
                          {" · v"}{log.version}
                        </span>
                      </div>
                      {log.notes && (
                        <p className="text-sm">{log.notes}</p>
                      )}
                      {log.improvements && (
                        <div className="rounded-md bg-muted/50 px-3 py-2">
                          <p className="text-xs font-medium text-muted-foreground mb-0.5">Next time</p>
                          <p className="text-sm">{log.improvements}</p>
                        </div>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-medium text-muted-foreground">
                        {log.cookedAt?.toDate?.()
                          ? formatDistanceToNow(log.cookedAt.toDate(), { addSuffix: true })
                          : ""}
                      </p>
                      {log.cookedAt?.toDate?.() && (
                        <p className="text-[11px] text-muted-foreground/60 mt-0.5">
                          {format(log.cookedAt.toDate(), "MMM d, yyyy")}
                        </p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Version History */}
      {versions.length > 0 && (
        <div className="space-y-3">
          <button
            type="button"
            className="flex w-full items-center justify-between text-left"
            onClick={() => setVersionsExpanded((v) => !v)}
          >
            <h2 className="text-lg font-semibold">Version History</h2>
            <ChevronDown
              className={`h-5 w-5 text-muted-foreground transition-transform ${versionsExpanded ? "rotate-180" : ""}`}
            />
          </button>

          {versionsExpanded && (
            <>
          <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
            <Check className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">Current: v{recipe.version || 1}</span>
            <span className="text-xs text-muted-foreground">&mdash; {recipe.title}</span>
          </div>

          <div className="space-y-3">
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
                        <p className="mt-1 text-sm text-muted-foreground">{v.changeNote}</p>
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
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setPreviewVersion(v)}
                      >
                        <Eye className="mr-1 h-3 w-3" />
                        View
                      </Button>
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
          </div>
            </>
          )}
        </div>
      )}

      {/* Version preview sheet */}
      <Sheet open={!!previewVersion} onOpenChange={(open) => { if (!open) setPreviewVersion(null); }}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {previewVersion && (
            <>
              <SheetHeader className="pb-4">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">v{previewVersion.version}</Badge>
                  <SheetTitle className="text-base">{previewVersion.title}</SheetTitle>
                </div>
                {previewVersion.changeNote && (
                  <p className="text-sm text-muted-foreground">{previewVersion.changeNote}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  {previewVersion.createdAt?.toDate?.()
                    ? previewVersion.createdAt.toDate().toLocaleDateString(undefined, { dateStyle: "long" })
                    : ""}
                  {" · "}
                  {previewVersion.prepTime + previewVersion.cookTime} min · {previewVersion.servings} servings · {previewVersion.difficulty}
                </p>
              </SheetHeader>

              {previewVersion.description && (
                <p className="mb-4 text-sm text-muted-foreground">{previewVersion.description}</p>
              )}

              <div className="space-y-5">
                <div>
                  <h3 className="mb-2 text-sm font-semibold">Ingredients ({previewVersion.ingredients.length})</h3>
                  <ul className="space-y-1">
                    {previewVersion.ingredients.map((ing, i) => (
                      <li key={i} className="flex gap-2 text-sm">
                        <span className="text-muted-foreground shrink-0">
                          {ing.quantity != null ? ing.quantity : ""}{ing.unit ? ` ${ing.unit}` : ""}
                        </span>
                        <span>{ing.name}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  <h3 className="mb-2 text-sm font-semibold">Steps ({previewVersion.steps.length})</h3>
                  <ol className="space-y-3">
                    {previewVersion.steps.map((step, i) => (
                      <li key={i} className="flex gap-3 text-sm">
                        <span className="shrink-0 font-medium text-muted-foreground">{i + 1}.</span>
                        <span>{step.instruction}</span>
                      </li>
                    ))}
                  </ol>
                </div>

                {previewVersion.notes && (
                  <div>
                    <h3 className="mb-2 text-sm font-semibold">Notes</h3>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{previewVersion.notes}</p>
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

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

/* =====================================================================
   Kitchen Tool — Recipe detail "Cookbook page" layout.
   Mirrors screens-detail.jsx DetailA:
   - Full-bleed hero photo with floating back/heart buttons
   - Category eyebrow + serif title + italic serif subtitle
   - 4-col hairline stats strip (PREP/COOK/SERVES/RATING)
   - Full-width primary "Start cooking" action
   - Ingredients: 3-col grid (checkbox / mono qty right-aligned / name)
     with hairline dividers, inline ×N servings adjuster
   - Method: big serif brand-colored step numbers, text, timer chip
   ===================================================================== */
type KTDetailProps = {
  recipe: import("@/lib/types/recipe").Recipe;
  isMine: boolean;
  servingMultiplier: number;
  setServingMultiplier: (fn: (m: number) => number) => void;
  isCurrentlyCooking: boolean;
  onStartCook: () => void;
  onAddToShopping: () => void;
  onToggleFavorite: () => void;
  cookLogs: CookLog[];
  showCookDialog: boolean;
  setShowCookDialog: (b: boolean) => void;
  cookServings: number;
  setCookServings: (fn: number | ((s: number) => number)) => void;
  showShoppingDialog: boolean;
  setShowShoppingDialog: (b: boolean) => void;
  activePlan: ReturnType<typeof useActivePlan>["instance"];
  shoppingWeekIndex: number;
  setShoppingWeekIndex: (fn: number | ((i: number) => number)) => void;
  shoppingWeekRange: { start: Date; end: Date } | null;
  totalShoppingWeeks: number;
  addingToShopping: boolean;
  handleAddToShoppingList: () => void | Promise<void>;
  router: ReturnType<typeof useRouter>;
};

function KitchenToolRecipeDetail(props: KTDetailProps) {
  const {
    recipe, isMine, servingMultiplier, setServingMultiplier,
    isCurrentlyCooking, onStartCook, onAddToShopping, onToggleFavorite,
    cookLogs, showCookDialog, setShowCookDialog, cookServings, setCookServings,
    showShoppingDialog, setShowShoppingDialog, activePlan,
    shoppingWeekIndex, setShoppingWeekIndex, shoppingWeekRange, totalShoppingWeeks,
    addingToShopping, handleAddToShoppingList, router,
  } = props;

  const adjustedServings = recipe.servings * servingMultiplier;
  const totalTime = recipe.totalTime || (recipe.prepTime + recipe.cookTime);

  function scaleQty(qty: number | null): string {
    if (qty === null) return "";
    const scaled = qty * servingMultiplier;
    return scaled % 1 === 0 ? String(scaled) : scaled.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  }

  const categoryLine = recipe.categories.length > 0
    ? recipe.categories.slice(0, 2).join(" · ").toUpperCase()
    : "RECIPE";

  return (
    <div className="kt-recipe-detail max-w-3xl mx-auto pb-24">
      {/* Hero photo, full-bleed */}
      <div className="relative -mx-4 md:-mx-6">
        {recipe.photoURL ? (
          <div className="aspect-[16/10] md:aspect-[21/9] overflow-hidden">
            <img src={recipe.photoURL} alt={recipe.title} className="h-full w-full object-cover" />
          </div>
        ) : (
          <div
            className="aspect-[16/10] md:aspect-[21/9]"
            style={{
              background:
                "repeating-linear-gradient(135deg, var(--kt-paper-deep) 0 6px, var(--background) 6px 12px)",
            }}
          />
        )}
        <div className="absolute top-3 left-3 right-3 flex justify-between">
          <button
            onClick={() => router.push("/recipes")}
            className="h-9 w-9 rounded-md bg-white/90 hover:bg-white flex items-center justify-center text-foreground shadow-sm"
            aria-label="Back"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex gap-1.5">
            <button
              onClick={onToggleFavorite}
              className="h-9 w-9 rounded-md bg-white/90 hover:bg-white flex items-center justify-center shadow-sm"
              aria-label="Favorite"
            >
              <Heart className={`h-4 w-4 ${recipe.isFavorite ? "fill-primary text-primary" : "text-foreground"}`} />
            </button>
            {isMine && (
              <Link
                href={`/recipes/${recipe.id}/edit`}
                className="h-9 w-9 rounded-md bg-white/90 hover:bg-white flex items-center justify-center text-foreground shadow-sm"
                aria-label="Edit"
              >
                <Edit className="h-4 w-4" />
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Title block */}
      <div className="px-1 md:px-2 pt-6">
        <div className="kt-eyebrow">{categoryLine}</div>
        <h1 className="kt-serif text-4xl md:text-5xl font-medium tracking-tight leading-[1.08] mt-2">
          {recipe.title}
        </h1>
        {recipe.description && (
          <p className="kt-serif italic text-base md:text-lg leading-snug mt-3 text-muted-foreground">
            {recipe.description}
          </p>
        )}

        {/* Stats strip — 4-col, hairline-divided */}
        <div
          className="mt-5 grid grid-cols-4 border kt-hair"
          style={{ borderRadius: "var(--radius-sm)" }}
        >
          <StatCell label="PREP" value={String(recipe.prepTime || "—")} unit={recipe.prepTime ? "min" : ""} first />
          <StatCell label="COOK" value={String(recipe.cookTime || "—")} unit={recipe.cookTime ? "min" : ""} />
          <StatCell label="SERVES" value={String(adjustedServings)} unit="" />
          <StatCell
            label="RATING"
            value={recipe.rating != null ? recipe.rating.toFixed(1) : "—"}
            unit={recipe.rating != null ? "★" : ""}
          />
        </div>

        {/* Primary action */}
        <div className="mt-4 flex gap-1.5">
          {isCurrentlyCooking ? (
            <Button size="lg" className="flex-1" render={<Link href="/cook" />}>
              <ChefHat className="mr-2 h-4 w-4" />
              Back to cooking
            </Button>
          ) : (
            <Button size="lg" className="flex-1" onClick={onStartCook}>
              <Play className="mr-2 h-4 w-4" />
              Start cooking
            </Button>
          )}
          <Button
            size="lg"
            variant="outline"
            className="w-11 px-0"
            onClick={onAddToShopping}
            disabled={recipe.ingredients.length === 0}
            aria-label="Add to shopping list"
          >
            <ShoppingCart className="h-4 w-4" />
          </Button>
        </div>

        {totalTime > 0 && (
          <div className="mt-3 text-xs text-muted-foreground kt-mono">
            total {totalTime} min · {recipe.difficulty.toLowerCase()}
            {(recipe.version ?? 1) > 1 && ` · v${recipe.version}`}
          </div>
        )}
      </div>

      {/* Ingredients */}
      <section className="mt-8 px-1 md:px-2">
        <div className="flex items-baseline justify-between">
          <h2 className="kt-serif text-2xl font-medium tracking-tight">Ingredients</h2>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <span className="kt-mono">×{servingMultiplier}</span>
            <button
              className="kt-mini-btn"
              onClick={() => setServingMultiplier((m) => Math.max(0.5, m - 0.5))}
              aria-label="Decrease"
            >
              <Minus className="h-2.5 w-2.5" />
            </button>
            <span className="kt-mono w-4 text-center">{adjustedServings}</span>
            <button
              className="kt-mini-btn"
              onClick={() => setServingMultiplier((m) => m + 0.5)}
              aria-label="Increase"
            >
              <Plus className="h-2.5 w-2.5" />
            </button>
            <span className="ml-0.5">servings</span>
          </div>
        </div>
        <div className="mt-3 border-t kt-hair">
          {recipe.ingredients.map((ing) => (
            <div
              key={ing.id}
              className="grid grid-cols-[20px_56px_1fr] gap-2.5 py-2.5 border-b kt-hair items-baseline"
            >
              <div className="mt-1 h-3.5 w-3.5 border kt-hair" style={{ borderWidth: "1.4px", borderRadius: "3px", borderColor: "var(--kt-rule-strong)" }} />
              <div className="kt-mono text-[13px] font-semibold text-right">
                {ing.quantity !== null && scaleQty(ing.quantity)}
                {ing.unit && (
                  <span className="font-normal text-muted-foreground ml-1">{ing.unit}</span>
                )}
              </div>
              <div className="text-[13.5px] leading-snug">
                {ing.name}
                {ing.note && (
                  <span className="kt-serif italic text-muted-foreground text-[12.5px] ml-1">
                    — {ing.note}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Method */}
      <section className="mt-8 px-1 md:px-2">
        <h2 className="kt-serif text-2xl font-medium tracking-tight">Method</h2>
        <div className="mt-3">
          {recipe.steps.map((step, i) => (
            <div
              key={step.id}
              className={`grid grid-cols-[32px_1fr] gap-3.5 py-3 ${
                i < recipe.steps.length - 1 ? "border-b kt-hair" : ""
              }`}
            >
              <div className="kt-serif text-[26px] font-medium leading-none tracking-tight text-primary">
                {i + 1}
              </div>
              <div>
                <p className="text-sm leading-[1.5]">{step.instruction}</p>
                {step.timerMinutes && (
                  <div className="mt-2 inline-flex items-center gap-1.5 border kt-hair px-2 py-0.5" style={{ borderRadius: "4px", borderColor: "var(--kt-rule-strong)" }}>
                    <Clock className="h-3 w-3" />
                    <span className="kt-mono text-[11px] font-semibold">
                      {step.timerMinutes}:00
                    </span>
                    {step.timerLabel && (
                      <span className="text-[11px] text-muted-foreground">· {step.timerLabel}</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Notes */}
      {recipe.notes && (
        <section className="mt-8 px-1 md:px-2">
          <h2 className="kt-serif text-2xl font-medium tracking-tight">Notes</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap">
            {recipe.notes}
          </p>
        </section>
      )}

      {/* Cook history (condensed) */}
      {cookLogs.length > 0 && cookLogs[0].cookedAt?.toDate?.() && (
        <section className="mt-8 px-1 md:px-2">
          <div className="kt-eyebrow">LAST COOKED</div>
          <p className="kt-mono text-xs text-muted-foreground mt-1">
            {formatDistanceToNow(cookLogs[0].cookedAt.toDate(), { addSuffix: true })}
            {" · "}
            {cookLogs.length} {cookLogs.length === 1 ? "session" : "sessions"}
          </p>
        </section>
      )}

      <RecipeSourceLine url={recipe.sourceUrl ?? null} />

      {/* Dialogs — reuse existing markup via minimal inline versions */}
      {showCookDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm border kt-hair bg-card" style={{ borderRadius: "var(--radius)" }}>
            <div className="px-6 pt-6 pb-2">
              <h3 className="kt-serif text-xl font-semibold">How many servings?</h3>
              <p className="text-sm text-muted-foreground mt-0.5">
                Quantities will be scaled to your chosen amount.
              </p>
            </div>
            <div className="px-6 py-4 flex items-center justify-center gap-4">
              <Button variant="outline" size="icon" className="h-10 w-10" onClick={() => setCookServings((s) => Math.max(0.5, (typeof s === "number" ? s : 1) - 0.5))} disabled={cookServings <= 0.5}>
                <Minus className="h-4 w-4" />
              </Button>
              <div className="text-center min-w-[100px]">
                <span className="kt-mono text-3xl font-bold">{cookServings}</span>
                <p className="text-sm text-muted-foreground">servings</p>
              </div>
              <Button variant="outline" size="icon" className="h-10 w-10" onClick={() => setCookServings((s) => (typeof s === "number" ? s : 1) + 0.5)}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex gap-2 px-6 pb-6 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowCookDialog(false)}>Cancel</Button>
              <Button
                className="flex-1"
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

      {showShoppingDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm border kt-hair bg-card" style={{ borderRadius: "var(--radius)" }}>
            <div className="px-6 pt-6 pb-2">
              <h3 className="kt-serif text-xl font-semibold">Add to shopping list</h3>
              <p className="text-sm text-muted-foreground mt-0.5">
                {recipe.ingredients.length} ingredient{recipe.ingredients.length === 1 ? "" : "s"} · {servingMultiplier === 1 ? "default servings" : `${servingMultiplier}× servings`}
              </p>
            </div>
            {activePlan ? (
              <div className="px-6 py-4">
                <p className="kt-eyebrow mb-2">Add to week</p>
                <div className="flex items-center gap-3 border kt-hair bg-secondary/40 px-3 py-2" style={{ borderRadius: "var(--radius-sm)" }}>
                  <Button variant="ghost" size="icon" className="h-8 w-8" disabled={shoppingWeekIndex === 0} onClick={() => setShoppingWeekIndex((i) => (typeof i === "number" ? i : 0) - 1)}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <div className="flex-1 text-center">
                    <p className="text-sm font-semibold">Week {shoppingWeekIndex + 1}</p>
                    {shoppingWeekRange && (
                      <p className="text-xs text-muted-foreground kt-mono">
                        {format(shoppingWeekRange.start, "MMM d")} – {format(shoppingWeekRange.end, "MMM d")}
                      </p>
                    )}
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8" disabled={shoppingWeekIndex >= totalShoppingWeeks - 1} onClick={() => setShoppingWeekIndex((i) => (typeof i === "number" ? i : 0) + 1)}>
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
              <Button variant="outline" className="flex-1" onClick={() => setShowShoppingDialog(false)}>Cancel</Button>
              <Button className="flex-1" onClick={handleAddToShoppingList} disabled={addingToShopping}>
                {addingToShopping ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShoppingCart className="mr-2 h-4 w-4" />}
                Add ingredients
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCell({ label, value, unit, first }: { label: string; value: string; unit: string; first?: boolean }) {
  return (
    <div className={`px-2 py-2.5 text-center ${first ? "" : "border-l kt-hair"}`}>
      <div className="text-[9px] font-semibold tracking-wider text-muted-foreground">{label}</div>
      <div className="kt-mono text-base font-semibold mt-1 tracking-tight">
        {value}
        {unit && <span className="text-[10px] text-muted-foreground ml-0.5">{unit}</span>}
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
