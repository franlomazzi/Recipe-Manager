"use client";

import { ThemeProvider } from "next-themes";
import { ActiveAccountProvider } from "@/lib/contexts/active-account-context";
import { AuthProvider } from "@/lib/contexts/auth-context";
import { HouseholdProvider } from "@/lib/contexts/household-context";
import { CookingSessionProvider } from "@/lib/contexts/cooking-session-context";
import { Toaster } from "@/components/ui/sonner";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      themes={["light", "dark", "system", "kitchen-tool", "kitchen-tool-dark"]}
    >
      <ActiveAccountProvider>
        <AuthProvider>
          <HouseholdProvider>
            <CookingSessionProvider>
              {children}
              <Toaster />
            </CookingSessionProvider>
          </HouseholdProvider>
        </AuthProvider>
      </ActiveAccountProvider>
    </ThemeProvider>
  );
}
