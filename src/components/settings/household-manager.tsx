"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Home, Loader2, LogOut, Pencil, RefreshCcw, Users } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/contexts/auth-context";
import { useHousehold } from "@/lib/contexts/household-context";
import {
  leaveHousehold,
  regenerateInviteCode,
  updateHouseholdName,
} from "@/lib/firebase/households";

function initialsOf(name?: string | null): string {
  if (!name) return "?";
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function HouseholdManager() {
  const { user } = useAuth();
  const { household, isOwner, loading } = useHousehold();
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);

  if (loading || !household || !user) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Home className="h-5 w-5 text-primary" />
            Household
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading household…
          </div>
        </CardContent>
      </Card>
    );
  }

  async function handleSaveName() {
    if (!name.trim() || !household) return;
    setSavingName(true);
    try {
      await updateHouseholdName(household.id, name.trim());
      toast.success("Household renamed");
      setEditingName(false);
    } catch {
      toast.error("Failed to rename household");
    } finally {
      setSavingName(false);
    }
  }

  async function handleRegenerateCode() {
    if (!household) return;
    setRegenerating(true);
    try {
      await regenerateInviteCode(household.id);
      toast.success("Invite code regenerated");
    } catch {
      toast.error("Failed to regenerate code");
    } finally {
      setRegenerating(false);
    }
  }

  async function handleCopyCode() {
    if (!household) return;
    try {
      await navigator.clipboard.writeText(household.inviteCode);
      toast.success("Invite code copied");
    } catch {
      toast.error("Could not copy");
    }
  }

  async function handleLeave() {
    if (!user || !household) return;
    setLeaving(true);
    try {
      await leaveHousehold(user, household.id);
      toast.success("Left household");
      // AuthGuard will route the user back to onboarding automatically
    } catch {
      toast.error("Failed to leave household");
      setLeaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Home className="h-5 w-5 text-primary" />
          Household
        </CardTitle>
        <CardDescription>
          Share recipes, ingredients and the pantry with your household.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Name */}
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Name</Label>
          {editingName ? (
            <div className="flex gap-2">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Household name"
              />
              <Button
                size="sm"
                onClick={handleSaveName}
                disabled={savingName || !name.trim()}
              >
                {savingName && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setEditingName(false)}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <p className="font-medium">{household.name}</p>
              {isOwner && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => {
                    setName(household.name);
                    setEditingName(true);
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Members */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" />
            Members ({household.members.length}/2)
          </Label>
          <div className="space-y-1.5">
            {household.members.map((uid) => {
              const memberName = household.memberNames?.[uid] ?? "Member";
              const photo = household.memberPhotos?.[uid];
              return (
                <div
                  key={uid}
                  className="flex items-center gap-3 rounded-lg border bg-muted/30 p-2.5"
                >
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={photo || undefined} />
                    <AvatarFallback className="text-xs">
                      {initialsOf(memberName)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="truncate text-sm font-medium">
                      {memberName}
                      {uid === user.uid && (
                        <span className="ml-2 text-xs text-muted-foreground">(you)</span>
                      )}
                    </div>
                    {household.ownerId === uid && (
                      <div className="text-xs text-muted-foreground">Owner</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Invite code */}
        {household.members.length < 2 && (
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Invite code</Label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopyCode}
                className="flex-1 rounded-lg border bg-muted/30 px-3 py-2 text-center font-mono text-lg tracking-[0.3em] hover:bg-muted/50"
                title="Click to copy"
              >
                {household.inviteCode}
              </button>
              {isOwner && (
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleRegenerateCode}
                  disabled={regenerating}
                  title="Regenerate code"
                >
                  {regenerating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCcw className="h-4 w-4" />
                  )}
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Share this code with your partner so they can join.
            </p>
          </div>
        )}

        {/* Leave */}
        <div className="pt-1">
          <Button
            variant="outline"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => setConfirmLeave(true)}
            disabled={leaving}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Leave household
          </Button>
        </div>
      </CardContent>

      <Dialog open={confirmLeave} onOpenChange={setConfirmLeave}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Leave household?</DialogTitle>
            <DialogDescription>
              You&apos;ll lose access to recipes shared by your partner and to
              the shared pantry. Your own recipes and meal plans stay with you.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmLeave(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleLeave}
              disabled={leaving}
            >
              {leaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Leave
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
