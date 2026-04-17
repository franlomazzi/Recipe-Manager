"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { getAuth } from "@/lib/firebase/config";
import { loadUnitStandards } from "@/lib/unit-standards";
import { useActiveAccount } from "./active-account-context";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const { activeKey } = useActiveAccount();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const unsubscribe = onAuthStateChanged(getAuth(activeKey), async (u) => {
      setUser(u);
      // Prime the shared unit-standards cache once per sign-in so the recipe
      // form and shopping list have canonical unit data on first paint. Fire
      // and forget — loadUnitStandards falls back to bundled defaults on any
      // error, so we don't block the auth flow on it.
      if (u) {
        loadUnitStandards(u.uid).catch(() => {
          /* handled inside loadUnitStandards */
        });
      }
      setLoading(false);
    });
    return unsubscribe;
  }, [activeKey]);

  return (
    <AuthContext.Provider value={{ user, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
