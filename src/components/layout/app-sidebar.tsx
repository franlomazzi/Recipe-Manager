"use client";

import { useState, useEffect, useRef, useCallback } from "react";
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
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

const AUTO_COLLAPSE_MS = 5000;

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
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const autoCollapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sidebarRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem("sidebar-collapsed");
    if (saved === "true") setCollapsed(true);
    setIsTouchDevice(window.matchMedia("(pointer: coarse)").matches);
  }, []);

  const scheduleAutoCollapse = useCallback(() => {
    if (autoCollapseTimer.current) clearTimeout(autoCollapseTimer.current);
    autoCollapseTimer.current = setTimeout(() => {
      setCollapsed(true);
    }, AUTO_COLLAPSE_MS);
  }, []);

  const cancelAutoCollapse = useCallback(() => {
    if (autoCollapseTimer.current) {
      clearTimeout(autoCollapseTimer.current);
      autoCollapseTimer.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      if (autoCollapseTimer.current) clearTimeout(autoCollapseTimer.current);
    };
  }, []);

  // Touch devices: start the auto-collapse timer whenever the sidebar is open,
  // and collapse immediately if the user taps outside.
  useEffect(() => {
    if (!isTouchDevice || collapsed) return;
    scheduleAutoCollapse();
    function handleOutsideTap(e: MouseEvent | TouchEvent) {
      if (sidebarRef.current && !sidebarRef.current.contains(e.target as Node)) {
        setCollapsed(true);
      }
    }
    document.addEventListener("mousedown", handleOutsideTap);
    document.addEventListener("touchstart", handleOutsideTap);
    return () => {
      cancelAutoCollapse();
      document.removeEventListener("mousedown", handleOutsideTap);
      document.removeEventListener("touchstart", handleOutsideTap);
    };
  }, [isTouchDevice, collapsed, scheduleAutoCollapse, cancelAutoCollapse]);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("sidebar-collapsed", String(next));
      return next;
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
      ref={sidebarRef}
      className={cn(
        "group hidden lg:flex lg:flex-col lg:border-r lg:border-sidebar-border lg:bg-sidebar transition-[width] duration-200 relative",
        collapsed ? "lg:w-16" : "lg:w-64"
      )}
      onMouseEnter={isTouchDevice ? undefined : cancelAutoCollapse}
      onMouseLeave={isTouchDevice ? undefined : scheduleAutoCollapse}
      onTouchStart={isTouchDevice ? scheduleAutoCollapse : undefined}
    >
      {/* Edge toggle — sits on the right border, visible on sidebar hover */}
      <button
        className="absolute right-0 top-20 z-10 flex h-5 w-5 translate-x-1/2 items-center justify-center rounded-full border border-sidebar-border/60 bg-sidebar text-muted-foreground/40 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 hover:border-sidebar-border hover:text-muted-foreground"
        onClick={toggleCollapsed}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {collapsed ? (
          <ChevronRight className="h-3 w-3" />
        ) : (
          <ChevronLeft className="h-3 w-3" />
        )}
      </button>

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
