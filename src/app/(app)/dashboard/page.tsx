"use client";

import { useState } from "react";
import { useAuth } from "@/lib/contexts/auth-context";
import { useKitchenTool } from "@/lib/hooks/use-kitchen-tool";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ImportRecipeModal } from "@/components/recipe/import-recipe-modal";
import { BookOpen, CalendarDays, ChefHat, Download, Plus, ShoppingCart } from "lucide-react";
import Link from "next/link";

export default function DashboardPage() {
  const { user } = useAuth();
  const isKT = useKitchenTool();
  const firstName = user?.displayName?.split(" ")[0] || "Chef";
  const [choiceOpen, setChoiceOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  if (isKT) return <KitchenToolDashboard firstName={firstName} />;

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Welcome back, {firstName}!
        </h1>
        <p className="text-muted-foreground mt-1">
          What would you like to cook today?
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card
          className="card-elevated cursor-pointer transition-all hover:scale-[1.02] border-transparent"
          onClick={() => setChoiceOpen(true)}
        >
          <CardHeader className="flex flex-row items-center gap-4 space-y-0 pb-2">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
              <Plus className="h-6 w-6 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base">New Recipe</CardTitle>
              <CardDescription className="text-xs mt-0.5">Add a new recipe to your collection</CardDescription>
            </div>
          </CardHeader>
        </Card>

        <Dialog open={choiceOpen} onOpenChange={setChoiceOpen}>
          <DialogContent className="sm:max-w-xs">
            <DialogHeader>
              <DialogTitle>Add a Recipe</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-3 pt-2">
              <Button
                className="w-full justify-start gap-3 h-auto py-3 rounded-xl"
                variant="outline"
                render={<Link href="/recipes/new" onClick={() => setChoiceOpen(false)} />}
              >
                <Plus className="h-5 w-5 text-primary shrink-0" />
                <div className="text-left">
                  <div className="font-medium">From scratch</div>
                  <div className="text-xs text-muted-foreground">Fill in the details manually</div>
                </div>
              </Button>
              <Button
                className="w-full justify-start gap-3 h-auto py-3 rounded-xl"
                variant="outline"
                onClick={() => {
                  setChoiceOpen(false);
                  setImportOpen(true);
                }}
              >
                <Download className="h-5 w-5 text-primary shrink-0" />
                <div className="text-left">
                  <div className="font-medium">Import</div>
                  <div className="text-xs text-muted-foreground">From URL, text, YouTube, or image</div>
                </div>
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <ImportRecipeModal open={importOpen} onOpenChange={setImportOpen} />

        <Link href="/recipes">
          <Card className="card-elevated cursor-pointer transition-all hover:scale-[1.02] border-transparent">
            <CardHeader className="flex flex-row items-center gap-4 space-y-0 pb-2">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
                <BookOpen className="h-6 w-6 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base">My Recipes</CardTitle>
                <CardDescription className="text-xs mt-0.5">Browse and search your recipes</CardDescription>
              </div>
            </CardHeader>
          </Card>
        </Link>

        <Link href="/meal-plan">
          <Card className="card-elevated cursor-pointer transition-all hover:scale-[1.02] border-transparent">
            <CardHeader className="flex flex-row items-center gap-4 space-y-0 pb-2">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
                <CalendarDays className="h-6 w-6 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base">Meal Plan</CardTitle>
                <CardDescription className="text-xs mt-0.5">Plan your meals for the week</CardDescription>
              </div>
            </CardHeader>
          </Card>
        </Link>

        <Link href="/shopping-list">
          <Card className="card-elevated cursor-pointer transition-all hover:scale-[1.02] border-transparent">
            <CardHeader className="flex flex-row items-center gap-4 space-y-0 pb-2">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
                <ShoppingCart className="h-6 w-6 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base">Shopping List</CardTitle>
                <CardDescription className="text-xs mt-0.5">View and manage shopping lists</CardDescription>
              </div>
            </CardHeader>
          </Card>
        </Link>
      </div>

      <Card className="card-elevated border-transparent">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <ChefHat className="h-5 w-5 text-primary" />
            </div>
            <CardTitle>Getting Started</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground leading-relaxed">
            Start by adding your favorite recipes. You can then plan meals for
            the week and automatically generate shopping lists from your
            selections.
          </p>
          <Button size="lg" className="rounded-xl" render={<Link href="/recipes/new" />}>
            <Plus className="mr-2 h-4 w-4" />
            Add Your First Recipe
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

/* =====================================================================
   Kitchen Tool — dashboard (recipe-forward, hairline, serif titles)
   Mirrors screens-dashboard.jsx variant B (pantry-shelf / cook tonight)
   ===================================================================== */
function KitchenToolDashboard({ firstName }: { firstName: string }) {
  const today = new Date();
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + i - today.getDay());
    return {
      dow: d.toLocaleDateString("en", { weekday: "short" }).slice(0, 2).toUpperCase(),
      dom: d.getDate(),
      isToday: d.toDateString() === today.toDateString(),
    };
  });

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-8 space-y-10">
      {/* Eyebrow header */}
      <div className="flex items-baseline justify-between border-b kt-hair pb-3">
        <div>
          <div className="kt-eyebrow">Kitchen · {today.toLocaleDateString("en", { weekday: "long" })}</div>
          <h1 className="kt-serif text-3xl md:text-5xl font-semibold tracking-tight mt-1">
            Good evening, {firstName}.
          </h1>
        </div>
        <div className="kt-mono text-xs text-muted-foreground hidden md:block">
          {today.toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" })}
        </div>
      </div>

      {/* Cook tonight hero */}
      <section className="grid gap-6 md:grid-cols-[2fr_1fr]">
        <Link
          href="/recipes"
          className="group relative block overflow-hidden border kt-hair bg-card transition-colors hover:border-primary/40"
          style={{ borderRadius: "var(--radius)" }}
        >
          <div
            className="aspect-[16/9] w-full"
            style={{
              background:
                "repeating-linear-gradient(135deg, var(--kt-paper-deep) 0 6px, var(--background) 6px 12px)",
            }}
          />
          <div className="p-6 border-t kt-hair">
            <div className="kt-eyebrow mb-2">Cook tonight</div>
            <h2 className="kt-serif text-3xl font-semibold tracking-tight">
              Pick up where you left off
            </h2>
            <p className="text-sm text-muted-foreground mt-2">
              Open your library to continue the current meal plan, or start a fresh cook.
            </p>
            <div className="flex gap-2 mt-4">
              <Button size="sm" render={<Link href="/recipes" />}>
                Browse recipes
              </Button>
              <Button size="sm" variant="outline" render={<Link href="/cook" />}>
                <ChefHat className="mr-1.5 h-3.5 w-3.5" /> Cook session
              </Button>
            </div>
          </div>
        </Link>

        <div className="space-y-4">
          <div className="border kt-hair p-5" style={{ borderRadius: "var(--radius)" }}>
            <div className="kt-eyebrow mb-2">This week</div>
            <div className="flex justify-between gap-1">
              {weekDays.map((d, i) => (
                <Link
                  key={i}
                  href="/meal-plan"
                  className={`flex-1 flex flex-col items-center py-2 border kt-hair kt-mono text-[11px] ${
                    d.isToday ? "bg-primary text-primary-foreground border-primary" : "bg-background"
                  }`}
                  style={{ borderRadius: "var(--radius-sm)" }}
                >
                  <span className="opacity-70">{d.dow}</span>
                  <span className="font-semibold text-sm">{d.dom}</span>
                </Link>
              ))}
            </div>
            <Link
              href="/meal-plan"
              className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              Open meal plan <CalendarDays className="h-3 w-3" />
            </Link>
          </div>

          <div className="border kt-hair p-5" style={{ borderRadius: "var(--radius)" }}>
            <div className="kt-eyebrow mb-2">Shopping</div>
            <div className="text-2xl kt-mono font-semibold">—</div>
            <p className="text-xs text-muted-foreground mt-1">
              Items pending across active lists
            </p>
            <Link
              href="/shopping-list"
              className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              Open list <ShoppingCart className="h-3 w-3" />
            </Link>
          </div>
        </div>
      </section>

      {/* Pantry shelf — quick actions */}
      <section>
        <div className="flex items-baseline justify-between border-b kt-hair pb-2 mb-4">
          <div className="kt-eyebrow">Pantry shelf</div>
          <Link href="/recipes/new" className="text-xs font-medium text-primary hover:underline">
            + New recipe
          </Link>
        </div>
        <div className="grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-4" style={{ borderRadius: "var(--radius)", overflow: "hidden", border: "1px solid var(--kt-rule)" }}>
          <ShelfTile href="/recipes/new" icon={<Plus className="h-4 w-4" />} label="New recipe" hint="Add one manually or import from URL" />
          <ShelfTile href="/recipes" icon={<BookOpen className="h-4 w-4" />} label="Library" hint="Browse and search" />
          <ShelfTile href="/meal-plan" icon={<CalendarDays className="h-4 w-4" />} label="Meal plan" hint="Plan the week" />
          <ShelfTile href="/shopping-list" icon={<ShoppingCart className="h-4 w-4" />} label="Shopping" hint="Generated from plan" />
        </div>
      </section>

      {/* Getting started */}
      <section className="border-t kt-hair pt-6">
        <div className="kt-eyebrow mb-1">Getting started</div>
        <h3 className="kt-serif text-2xl font-semibold">Build your cookbook.</h3>
        <p className="text-sm text-muted-foreground mt-2 max-w-prose leading-relaxed">
          Start by adding your favorite recipes. You can then plan meals for the week and
          automatically generate shopping lists from your selections.
        </p>
        <Button size="lg" className="mt-4" render={<Link href="/recipes/new" />}>
          <Plus className="mr-2 h-4 w-4" />
          Add your first recipe
        </Button>
      </section>
    </div>
  );
}

function ShelfTile({
  href,
  icon,
  label,
  hint,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  hint: string;
}) {
  return (
    <Link
      href={href}
      className="bg-card p-5 transition-colors hover:bg-secondary/60 flex flex-col gap-2 min-h-[108px]"
    >
      <div className="flex items-center gap-2 text-primary">
        {icon}
        <span className="text-sm font-semibold text-foreground">{label}</span>
      </div>
      <p className="text-xs text-muted-foreground leading-snug">{hint}</p>
    </Link>
  );
}
