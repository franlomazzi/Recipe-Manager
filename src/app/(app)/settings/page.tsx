"use client";

import { useAuth } from "@/lib/contexts/auth-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Settings } from "lucide-react";
import { ShoppingOrganizationManager } from "@/components/settings/shopping-organization-manager";
import { HouseholdManager } from "@/components/settings/household-manager";
import { MultiAccountManager } from "@/components/settings/multi-account-manager";
import { UnitStandardsManager } from "@/components/settings/unit-standards-manager";
import { MealPlanPreferences } from "@/components/settings/meal-plan-preferences";

export default function SettingsPage() {
  const { user } = useAuth();

  const initials = user?.displayName
    ? user.displayName
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
    : "?";

  return (
    <div className="p-4 md:p-6 space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-primary" />
            Profile
          </CardTitle>
          <CardDescription>Your account information</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-4">
          <Avatar className="h-16 w-16">
            <AvatarImage src={user?.photoURL || undefined} />
            <AvatarFallback className="text-lg">{initials}</AvatarFallback>
          </Avatar>
          <div>
            <p className="font-medium">{user?.displayName || "No name set"}</p>
            <p className="text-sm text-muted-foreground">{user?.email}</p>
          </div>
        </CardContent>
      </Card>

      <HouseholdManager />

      <MultiAccountManager />

      <ShoppingOrganizationManager />

      <UnitStandardsManager />

      <MealPlanPreferences />
    </div>
  );
}
