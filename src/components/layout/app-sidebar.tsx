"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/contexts/auth-context";
import { useCookingSession } from "@/lib/contexts/cooking-session-context";
import { signOut } from "@/lib/firebase/auth";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ChefHat,
  BookOpen,
  CalendarDays,
  ShoppingCart,
  Settings,
  LogOut,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/recipes", label: "Recipes", icon: BookOpen },
  { href: "/meal-plan", label: "Meal Plan", icon: CalendarDays },
  { href: "/shopping-list", label: "Shopping List", icon: ShoppingCart },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppSidebar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const { sessions } = useCookingSession();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("sidebar-collapsed");
    if (saved === "true") setCollapsed(true);
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      localStorage.setItem("sidebar-collapsed", String(!prev));
      return !prev;
    });
  }

  const initials = user?.displayName
    ? user.displayName
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
    : user?.email?.[0]?.toUpperCase() || "?";

  return (
    <aside
      className={cn(
        "hidden lg:flex lg:flex-col lg:border-r lg:border-sidebar-border lg:bg-sidebar transition-[width] duration-200",
        collapsed ? "lg:w-16" : "lg:w-64"
      )}
    >
      <div
        className={cn(
          "flex h-16 items-center border-b border-sidebar-border",
          collapsed ? "justify-center px-2" : "gap-2 px-6"
        )}
      >
        <ChefHat className="h-6 w-6 shrink-0 text-primary" />
        {!collapsed && <span className="text-lg font-semibold">My Recipes</span>}
      </div>

      <nav className="flex-1 space-y-1 p-2">
        {sessions.length > 0 && (
          <Link
            href="/cook"
            title={collapsed ? `Cooking (${sessions.length})` : undefined}
            className={cn(
              "flex items-center rounded-xl text-sm font-medium transition-all relative",
              collapsed ? "justify-center px-2 py-2.5" : "gap-3 px-3 py-2.5",
              pathname === "/cook"
                ? "bg-primary/10 text-primary font-semibold"
                : "bg-primary/5 text-primary hover:bg-primary/10"
            )}
          >
            <ChefHat className="h-4 w-4 shrink-0" />
            {!collapsed && (
              <>
                <span className="flex-1">Cooking</span>
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
                  {sessions.length}
                </span>
              </>
            )}
            {collapsed && (
              <span className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground">
                {sessions.length}
              </span>
            )}
          </Link>
        )}
        {navItems.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={cn(
                "flex items-center rounded-xl text-sm font-medium transition-all",
                collapsed
                  ? "justify-center px-2 py-2.5"
                  : "gap-3 px-3 py-2.5",
                isActive
                  ? "bg-primary/10 text-primary font-semibold"
                  : "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground"
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {!collapsed && item.label}
            </Link>
          );
        })}
      </nav>

      {/* Collapse toggle */}
      <div className="px-2 py-1">
        <Button
          variant="ghost"
          size="icon"
          className={cn("h-8 w-8 text-muted-foreground", !collapsed && "ml-auto")}
          onClick={toggleCollapsed}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <PanelLeftOpen className="h-4 w-4" />
          ) : (
            <PanelLeftClose className="h-4 w-4" />
          )}
        </Button>
      </div>

      <div className="border-t border-sidebar-border p-2">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                className={cn(
                  "w-full",
                  collapsed
                    ? "justify-center px-2"
                    : "justify-start gap-3 px-3"
                )}
              />
            }
          >
            <Avatar className="h-7 w-7 shrink-0">
              <AvatarImage src={user?.photoURL || undefined} />
              <AvatarFallback className="text-xs">{initials}</AvatarFallback>
            </Avatar>
            {!collapsed && (
              <span className="truncate text-sm">
                {user?.displayName || user?.email}
              </span>
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
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
    </aside>
  );
}
