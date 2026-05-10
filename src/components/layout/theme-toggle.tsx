"use client";

import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sun, Moon, Monitor, ChefHat } from "lucide-react";
import { setAutoThemeOverrideUntilNextFlip } from "@/lib/hooks/use-auto-theme";

export function ThemeToggle() {
  const { setTheme } = useTheme();

  const pick = (t: string) => {
    setAutoThemeOverrideUntilNextFlip();
    setTheme(t);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon" />}>
        <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
        <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
        <span className="sr-only">Toggle theme</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => pick("light")}>
          <Sun className="mr-2 h-4 w-4" />
          Light
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => pick("dark")}>
          <Moon className="mr-2 h-4 w-4" />
          Dark
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => pick("system")}>
          <Monitor className="mr-2 h-4 w-4" />
          System
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => pick("kitchen-tool")}>
          <ChefHat className="mr-2 h-4 w-4" />
          Kitchen Tool
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => pick("kitchen-tool-dark")}>
          <ChefHat className="mr-2 h-4 w-4" />
          Kitchen Tool · Dark
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
