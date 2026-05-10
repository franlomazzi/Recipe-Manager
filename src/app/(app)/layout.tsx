"use client";

import { AuthGuard } from "@/components/auth/auth-guard";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { Header } from "@/components/layout/header";
import { useActiveAccount } from "@/lib/contexts/active-account-context";
import { usePixelShiftStyle } from "@/components/kiosk/pixel-shift";
import { Screensaver } from "@/components/kiosk/screensaver";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { activeKey } = useActiveAccount();
  const shiftStyle = usePixelShiftStyle();
  return (
    <AuthGuard>
      <div key={activeKey} className="flex h-screen" style={shiftStyle}>
        <AppSidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Header />
          <main className="flex-1 overflow-y-auto pb-16 lg:pb-0">
            {children}
          </main>
          <MobileNav />
        </div>
      </div>
      <Screensaver />
    </AuthGuard>
  );
}
