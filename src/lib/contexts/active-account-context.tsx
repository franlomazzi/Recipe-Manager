"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  ACTIVE_ACCOUNT_EVENT,
  getActiveAccountKey,
  getKnownAccounts,
  setActiveAccount as configSetActiveAccount,
  type AccountKey,
  type KnownAccount,
} from "@/lib/firebase/config";

interface ActiveAccountContextValue {
  activeKey: AccountKey;
  knownAccounts: KnownAccount[];
  setActiveAccount: (key: AccountKey) => void;
  refreshKnownAccounts: () => void;
}

const ActiveAccountContext = createContext<ActiveAccountContextValue>({
  activeKey: "primary",
  knownAccounts: [],
  setActiveAccount: () => {},
  refreshKnownAccounts: () => {},
});

export function ActiveAccountProvider({ children }: { children: ReactNode }) {
  const [activeKey, setActiveKey] = useState<AccountKey>("primary");
  const [knownAccounts, setKnownAccounts] = useState<KnownAccount[]>([]);

  // Hydrate from localStorage on mount
  useEffect(() => {
    setActiveKey(getActiveAccountKey());
    setKnownAccounts(getKnownAccounts());
  }, []);

  // Listen for the broadcast event so all components stay in sync.
  useEffect(() => {
    function handler(e: Event) {
      const detail = (e as CustomEvent<{ key: AccountKey }>).detail;
      if (detail?.key) setActiveKey(detail.key);
      setKnownAccounts(getKnownAccounts());
    }
    window.addEventListener(ACTIVE_ACCOUNT_EVENT, handler);
    return () => window.removeEventListener(ACTIVE_ACCOUNT_EVENT, handler);
  }, []);

  const setActiveAccount = useCallback((key: AccountKey) => {
    configSetActiveAccount(key);
    setActiveKey(key);
  }, []);

  const refreshKnownAccounts = useCallback(() => {
    setKnownAccounts(getKnownAccounts());
  }, []);

  const value = useMemo(
    () => ({ activeKey, knownAccounts, setActiveAccount, refreshKnownAccounts }),
    [activeKey, knownAccounts, setActiveAccount, refreshKnownAccounts]
  );

  return (
    <ActiveAccountContext.Provider value={value}>
      {children}
    </ActiveAccountContext.Provider>
  );
}

export function useActiveAccount() {
  return useContext(ActiveAccountContext);
}
