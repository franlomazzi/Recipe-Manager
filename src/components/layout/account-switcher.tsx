"use client";

import { useActiveAccount } from "@/lib/contexts/active-account-context";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Check } from "lucide-react";

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
 * in on this device. Hidden entirely on phones / single-account installs.
 */
export function AccountSwitcher() {
  const { activeKey, knownAccounts, setActiveAccount } = useActiveAccount();

  // Hide unless there are at least two accounts known on this device
  if (knownAccounts.length < 2) return null;

  const active = knownAccounts.find((a) => a.key === activeKey);

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className="rounded-full h-8 pl-1 pr-2 gap-1.5"
          />
        }
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
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-1">
        <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
          Switch account
        </div>
        {knownAccounts.map((acct) => {
          const isActive = acct.key === activeKey;
          return (
            <button
              key={acct.key}
              type="button"
              onClick={() => {
                if (!isActive) setActiveAccount(acct.key);
              }}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors ${
                isActive ? "bg-muted" : "hover:bg-muted/60"
              }`}
            >
              <Avatar className="h-7 w-7">
                <AvatarImage src={acct.photoURL ?? undefined} />
                <AvatarFallback className="text-[10px]">
                  {initialsOf(acct.displayName, acct.email)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="truncate font-medium">
                  {acct.displayName ?? acct.email ?? "Account"}
                </div>
                {acct.email && acct.displayName && (
                  <div className="truncate text-xs text-muted-foreground">
                    {acct.email}
                  </div>
                )}
              </div>
              {isActive && <Check className="h-4 w-4 text-primary shrink-0" />}
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}
