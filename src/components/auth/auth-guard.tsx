"use client";

import { useAuth } from "@/lib/contexts/auth-context";
import { useHousehold } from "@/lib/contexts/household-context";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const { householdId, loading: householdLoading } = useHousehold();
  const router = useRouter();

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/login");
      return;
    }
    if (!authLoading && user && !householdLoading && !householdId) {
      router.replace("/household");
    }
  }, [user, authLoading, householdLoading, householdId, router]);

  const loading = authLoading || (!!user && householdLoading);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user || !householdId) return null;

  return <>{children}</>;
}
