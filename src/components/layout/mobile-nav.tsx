"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useCookingSession } from "@/lib/contexts/cooking-session-context";
import {
  LayoutDashboard,
  BookOpen,
  CalendarDays,
  ShoppingCart,
  ChefHat,
  Settings,
} from "lucide-react";

const navItems = [
  { href: "/dashboard", label: "Home", icon: LayoutDashboard },
  { href: "/recipes", label: "Recipes", icon: BookOpen },
  { href: "/meal-plan", label: "Plan", icon: CalendarDays },
  { href: "/shopping-list", label: "Shop", icon: ShoppingCart },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function MobileNav() {
  const pathname = usePathname();
  const { sessions } = useCookingSession();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border/50 bg-background/95 backdrop-blur-md lg:hidden">
      <div className="flex items-center justify-around safe-bottom">
        {sessions.length > 0 && (
          <Link
            href="/cook"
            className={cn(
              "flex flex-col items-center gap-1 px-3 py-2.5 md:py-3 text-xs md:text-sm transition-colors rounded-xl relative",
              pathname === "/cook"
                ? "text-primary font-semibold"
                : "text-primary/80 hover:text-primary"
            )}
          >
            <div className="relative">
              <ChefHat className="h-5 w-5 md:h-6 md:w-6" />
              <span className="absolute -top-1.5 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground">
                {sessions.length}
              </span>
            </div>
            <span>Cook</span>
          </Link>
        )}
        {navItems.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center gap-1 px-3 py-2.5 md:py-3 text-xs md:text-sm transition-colors rounded-xl",
                isActive
                  ? "text-primary font-semibold"
                  : "text-muted-foreground/70 hover:text-foreground"
              )}
            >
              <item.icon className="h-5 w-5 md:h-6 md:w-6" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
