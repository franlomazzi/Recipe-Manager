"use client";

import { useActiveAccount } from "@/lib/contexts/active-account-context";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

function initialsOf(name?: string | null, email?: string | null): string {
  if (name) {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }
  return email?.[0]?.toUpperCase() ?? "?";
}

/**
 * Header chip showing the active account when more than one account is signed
 * in on this device. Tapping cycles to the next account.
 * Hidden entirely on phones / single-account installs.
 */
export function AccountSwitcher() {
  const { activeKey, knownAccounts, setActiveAccount } = useActiveAccount();

  if (knownAccounts.length < 2) return null;

  const activeIndex = knownAccounts.findIndex((a) => a.key === activeKey);
  const active = knownAccounts[activeIndex];

  function cycleAccount() {
    const next = knownAccounts[(activeIndex + 1) % knownAccounts.length];
    setActiveAccount(next.key);
  }

  return (
    <Button
      variant="outline"
      size="sm"
      className="rounded-full h-8 pl-1 pr-2 gap-1.5"
      onClick={cycleAccount}
      title={`Switch account (${knownAccounts.length} signed in)`}
    >
      <Avatar className="h-6 w-6">
        <AvatarImage src={active?.photoURL ?? undefined} />
        <AvatarFallback className="text-[10px]">
          {initialsOf(active?.displayName, active?.email)}
        </AvatarFallback>
      </Avatar>
      <span className="text-xs max-w-[80px] truncate">
        {active?.displayName ?? active?.email ?? "Account"}
      </span>
    </Button>
  );
}
