"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "./auth-context";
import {
  subscribeToUserHouseholdId,
  subscribeToHousehold,
} from "@/lib/firebase/households";
import { runHouseholdMigration } from "@/lib/firebase/migrations/v2-households";
import type { Household } from "@/lib/types/household";

interface HouseholdContextValue {
  household: Household | null;
  householdId: string | null;
  partnerUid: string | null;
  partnerName: string | null;
  isOwner: boolean;
  loading: boolean;
  /** True once the migration has run for the current user. */
  migrated: boolean;
}

const HouseholdContext = createContext<HouseholdContextValue>({
  household: null,
  householdId: null,
  partnerUid: null,
  partnerName: null,
  isOwner: false,
  loading: true,
  migrated: false,
});

export function HouseholdProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [household, setHousehold] = useState<Household | null>(null);
  const [householdIdLoaded, setHouseholdIdLoaded] = useState(false);
  const [householdLoaded, setHouseholdLoaded] = useState(false);
  const [migrated, setMigrated] = useState(false);

  // Run migration once per signed-in user before subscribing.
  useEffect(() => {
    if (!user) {
      setMigrated(false);
      setHouseholdId(null);
      setHousehold(null);
      setHouseholdIdLoaded(false);
      setHouseholdLoaded(false);
      return;
    }
    let cancelled = false;
    setMigrated(false);
    runHouseholdMigration(user)
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error("[households] migration failed", err);
      })
      .finally(() => {
        if (!cancelled) setMigrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Subscribe to user doc to read householdId after migration completes.
  useEffect(() => {
    if (!user || !migrated) return;
    setHouseholdIdLoaded(false);
    const unsub = subscribeToUserHouseholdId(user.uid, (hid) => {
      setHouseholdId(hid);
      setHouseholdIdLoaded(true);
    });
    return unsub;
  }, [user, migrated]);

  // Subscribe to the household doc itself.
  useEffect(() => {
    if (!householdId) {
      setHousehold(null);
      setHouseholdLoaded(true);
      return;
    }
    setHouseholdLoaded(false);
    const unsub = subscribeToHousehold(householdId, (h) => {
      setHousehold(h);
      setHouseholdLoaded(true);
    });
    return unsub;
  }, [householdId]);

  const value = useMemo<HouseholdContextValue>(() => {
    const partnerUid =
      household && user
        ? household.members.find((m) => m !== user.uid) ?? null
        : null;
    const partnerName =
      partnerUid && household?.memberNames?.[partnerUid]
        ? household.memberNames[partnerUid]
        : null;
    return {
      household,
      householdId,
      partnerUid,
      partnerName,
      isOwner: !!user && household?.ownerId === user.uid,
      loading:
        authLoading ||
        (!!user && (!migrated || !householdIdLoaded || !householdLoaded)),
      migrated,
    };
  }, [
    household,
    householdId,
    user,
    authLoading,
    migrated,
    householdIdLoaded,
    householdLoaded,
  ]);

  return (
    <HouseholdContext.Provider value={value}>
      {children}
    </HouseholdContext.Provider>
  );
}

export function useHousehold() {
  return useContext(HouseholdContext);
}
