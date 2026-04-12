"use client";

import { useAuth } from "@/lib/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BookOpen, CalendarDays, ChefHat, Plus, ShoppingCart } from "lucide-react";
import Link from "next/link";

export default function DashboardPage() {
  const { user } = useAuth();
  const firstName = user?.displayName?.split(" ")[0] || "Chef";

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
        <Link href="/recipes/new">
          <Card className="card-elevated cursor-pointer transition-all hover:scale-[1.02] border-transparent">
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
        </Link>

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
