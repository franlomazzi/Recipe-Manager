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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Loader2, Smartphone, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/contexts/auth-context";
import { useActiveAccount } from "@/lib/contexts/active-account-context";
import { signInWithGoogleSecondary, signOutKey } from "@/lib/firebase/auth";
import { rememberAccount, forgetAccount } from "@/lib/firebase/config";

/**
 * Settings card for the tablet "two accounts on one device" mode. Adding a
 * secondary account lazily initializes a second Firebase app instance with its
 * own auth persistence, so swapping accounts in the header is one tap.
 */
export function MultiAccountManager() {
  const { user } = useAuth();
  const { activeKey, knownAccounts, refreshKnownAccounts, setActiveAccount } =
    useActiveAccount();
  const [busy, setBusy] = useState(false);

  const hasSecondary = knownAccounts.some((a) => a.key === "secondary");

  // Self-heal: if a secondary exists but primary wasn't registered, fix it now
  const hasPrimary = knownAccounts.some((a) => a.key === "primary");
  if (hasSecondary && !hasPrimary && user) {
    rememberAccount({
      key: "primary",
      uid: user.uid,
      displayName: user.displayName ?? "",
      email: user.email ?? "",
      photoURL: user.photoURL,
    });
    refreshKnownAccounts();
  }

  async function handleAdd() {
    setBusy(true);
    try {
      // Ensure the primary account is also remembered so the switcher shows both
      if (user) {
        rememberAccount({
          key: "primary",
          uid: user.uid,
          displayName: user.displayName ?? "",
          email: user.email ?? "",
          photoURL: user.photoURL,
        });
      }
      const secondaryUser = await signInWithGoogleSecondary();
      rememberAccount({
        key: "secondary",
        uid: secondaryUser.uid,
        displayName: secondaryUser.displayName ?? "",
        email: secondaryUser.email ?? "",
        photoURL: secondaryUser.photoURL,
      });
      refreshKnownAccounts();
      toast.success(`Added ${secondaryUser.displayName ?? secondaryUser.email ?? "account"}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to add account";
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  async function handleRemoveSecondary() {
    setBusy(true);
    try {
      // If currently active, fall back to primary first so the tree remounts cleanly
      if (activeKey === "secondary") {
        setActiveAccount("primary");
      }
      await signOutKey("secondary").catch(() => {
        /* ignore — may not be initialized */
      });
      forgetAccount("secondary");
      refreshKnownAccounts();
      toast.success("Removed account from this device");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to remove";
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Smartphone className="h-5 w-5 text-primary" />
          This device
        </CardTitle>
        <CardDescription>
          Keep both household members signed in on a shared tablet. One tap
          swaps active account.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {knownAccounts.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Only your current account is signed in.
          </p>
        )}

        {knownAccounts.map((acct) => {
          const initials =
            acct.displayName
              ?.split(" ")
              .map((n) => n[0])
              .join("")
              .slice(0, 2)
              .toUpperCase() ||
            acct.email?.[0]?.toUpperCase() ||
            "?";
          return (
            <div
              key={acct.key}
              className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3"
            >
              <Avatar className="h-9 w-9">
                <AvatarImage src={acct.photoURL ?? undefined} />
                <AvatarFallback className="text-xs">{initials}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="truncate text-sm font-medium">
                  {acct.displayName || acct.email || "Account"}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {acct.email}
                  {acct.key === activeKey && (
                    <span className="ml-2 text-primary font-medium">active</span>
                  )}
                </div>
              </div>
              {acct.key === "secondary" && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={handleRemoveSecondary}
                  disabled={busy}
                  title="Remove from this device"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          );
        })}

        {!hasSecondary && (
          <Button
            variant="outline"
            className="w-full rounded-xl"
            onClick={handleAdd}
            disabled={busy}
          >
            {busy ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <UserPlus className="mr-2 h-4 w-4" />
            )}
            Add another account to this device
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
