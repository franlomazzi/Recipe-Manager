"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/contexts/auth-context";
import {
  createHousehold,
  joinHouseholdByCode,
} from "@/lib/firebase/households";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Home, UserPlus } from "lucide-react";
import { toast } from "sonner";

export function HouseholdOnboarding() {
  const { user } = useAuth();
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [name, setName] = useState("My Household");
  const [code, setCode] = useState("");

  async function handleCreate() {
    if (!user) return;
    setCreating(true);
    try {
      await createHousehold(user, name.trim() || "My Household");
      toast.success("Household created");
      router.replace("/dashboard");
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(err);
      toast.error("Failed to create household");
    } finally {
      setCreating(false);
    }
  }

  async function handleJoin() {
    if (!user) return;
    setJoining(true);
    try {
      await joinHouseholdByCode(user, code);
      toast.success("Joined household");
      router.replace("/dashboard");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to join household";
      toast.error(message);
    } finally {
      setJoining(false);
    }
  }

  return (
    <div className="w-full max-w-3xl space-y-6">
      <div className="text-center space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">Welcome</h1>
        <p className="text-muted-foreground">
          Set up your household to start sharing recipes and pantry with your partner.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Home className="h-5 w-5 text-primary" />
              Create a household
            </CardTitle>
            <CardDescription>
              Start fresh and invite your partner with a code.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="household-name">Household name</Label>
              <Input
                id="household-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="The Smith Kitchen"
              />
            </div>
            <Button
              className="w-full"
              onClick={handleCreate}
              disabled={creating}
            >
              {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create household
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-primary" />
              Join with a code
            </CardTitle>
            <CardDescription>
              Got an invite code from your partner? Enter it here.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="invite-code">Invite code</Label>
              <Input
                id="invite-code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="ABC123"
                maxLength={6}
                className="uppercase tracking-widest text-center font-mono"
              />
            </div>
            <Button
              className="w-full"
              variant="secondary"
              onClick={handleJoin}
              disabled={joining || code.trim().length < 4}
            >
              {joining && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Join household
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
