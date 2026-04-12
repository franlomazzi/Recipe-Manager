"use client";

import { useAuth } from "@/lib/contexts/auth-context";
import { signOut } from "@/lib/firebase/auth";
import { ThemeToggle } from "./theme-toggle";
import { AccountSwitcher } from "./account-switcher";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChefHat, Settings, LogOut } from "lucide-react";
import Link from "next/link";

export function Header() {
  const { user } = useAuth();

  const initials = user?.displayName
    ? user.displayName
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
    : user?.email?.[0]?.toUpperCase() || "?";

  return (
    <header className="flex h-14 items-center justify-between border-b border-border px-4 lg:px-6">
      <div className="flex items-center gap-2 lg:hidden">
        <ChefHat className="h-5 w-5 text-primary" />
        <span className="font-semibold">My Recipes</span>
      </div>
      <div className="hidden lg:block" />

      <div className="flex items-center gap-2">
        <AccountSwitcher />
        <ThemeToggle />
        <div className="lg:hidden">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="ghost" size="icon" className="rounded-full" />}
            >
              <Avatar className="h-7 w-7">
                <AvatarImage src={user?.photoURL || undefined} />
                <AvatarFallback className="text-xs">{initials}</AvatarFallback>
              </Avatar>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem render={<Link href="/settings" />}>
                <Settings className="mr-2 h-4 w-4" />
                Settings
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => signOut()}>
                <LogOut className="mr-2 h-4 w-4" />
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
