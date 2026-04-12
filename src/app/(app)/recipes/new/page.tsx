"use client";

import { RecipeForm } from "@/components/recipe/recipe-form";

export default function NewRecipePage() {
  return (
    <div className="mx-auto max-w-3xl 2xl:max-w-4xl p-4 md:p-6 lg:p-8">
      <h1 className="mb-6 text-2xl font-bold tracking-tight">New Recipe</h1>
      <RecipeForm />
    </div>
  );
}
