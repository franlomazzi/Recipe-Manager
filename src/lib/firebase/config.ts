import {
  initializeApp,
  getApps,
  type FirebaseApp,
} from "firebase/app";
import {
  initializeFirestore,
  getFirestore,
  persistentLocalCache,
  persistentSingleTabManager,
  type Firestore,
} from "firebase/firestore";
import { getAuth as firebaseGetAuth, type Auth } from "firebase/auth";
import { getStorage as firebaseGetStorage, type FirebaseStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export type AccountKey = "primary" | "secondary";

const PRIMARY_NAME = "[DEFAULT]";
const SECONDARY_NAME = "secondary";

const ACTIVE_KEY_STORAGE = "mrm.activeAccountKey";
const KNOWN_ACCOUNTS_STORAGE = "mrm.knownAccounts";
export const ACTIVE_ACCOUNT_EVENT = "mrm:active-account-changed";

export interface KnownAccount {
  key: AccountKey;
  uid: string;
  displayName: string;
  email: string;
  photoURL: string | null;
}

interface AppBundle {
  app: FirebaseApp;
  db: Firestore;
  auth: Auth;
  storage: FirebaseStorage;
}

const bundles: Partial<Record<AccountKey, AppBundle>> = {};

function buildBundle(name: string): AppBundle {
  const existing = getApps().find((a) => a.name === name);
  const app =
    existing ??
    (name === PRIMARY_NAME
      ? initializeApp(firebaseConfig)
      : initializeApp(firebaseConfig, name));
  let db: Firestore;
  try {
    db = initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentSingleTabManager(undefined),
      }),
    });
  } catch {
    // Already initialized for this app (e.g. HMR re-evaluation of this module
    // after Firestore singleton was preserved). Fall back to the existing instance.
    db = getFirestore(app);
  }
  return {
    app,
    db,
    auth: firebaseGetAuth(app),
    storage: firebaseGetStorage(app),
  };
}

function getBundle(key: AccountKey): AppBundle {
  const cached = bundles[key];
  if (cached) return cached;
  const name = key === "primary" ? PRIMARY_NAME : SECONDARY_NAME;
  const bundle = buildBundle(name);
  bundles[key] = bundle;
  return bundle;
}

// Always eagerly initialize the primary app — phones and tablets need it.
const primaryBundle = getBundle("primary");

export function getActiveAccountKey(): AccountKey {
  if (typeof window === "undefined") return "primary";
  const v = window.localStorage.getItem(ACTIVE_KEY_STORAGE);
  return v === "secondary" ? "secondary" : "primary";
}

export function setActiveAccount(key: AccountKey): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ACTIVE_KEY_STORAGE, key);
  window.dispatchEvent(new CustomEvent(ACTIVE_ACCOUNT_EVENT, { detail: { key } }));
}

export function getKnownAccounts(): KnownAccount[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KNOWN_ACCOUNTS_STORAGE);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as KnownAccount[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function rememberAccount(account: KnownAccount): void {
  if (typeof window === "undefined") return;
  const existing = getKnownAccounts().filter((a) => a.key !== account.key);
  existing.push(account);
  window.localStorage.setItem(KNOWN_ACCOUNTS_STORAGE, JSON.stringify(existing));
}

export function forgetAccount(key: AccountKey): void {
  if (typeof window === "undefined") return;
  const existing = getKnownAccounts().filter((a) => a.key !== key);
  window.localStorage.setItem(KNOWN_ACCOUNTS_STORAGE, JSON.stringify(existing));
}

export function getDb(key: AccountKey = getActiveAccountKey()): Firestore {
  return getBundle(key).db;
}

export function getAuth(key: AccountKey = getActiveAccountKey()): Auth {
  return getBundle(key).auth;
}

export function getStorage(key: AccountKey = getActiveAccountKey()): FirebaseStorage {
  return getBundle(key).storage;
}

export function getApp(key: AccountKey = getActiveAccountKey()): FirebaseApp {
  return getBundle(key).app;
}

export function ensureSecondaryApp(): AppBundle {
  return getBundle("secondary");
}

// Backwards-compat exports — kept so older imports still type-check.
// Modules that need account-aware behavior must call getDb()/getAuth() from
// inside their functions instead of capturing these at module load.
export const app = primaryBundle.app;
export const db = primaryBundle.db;
export const auth = primaryBundle.auth;
export const storage = primaryBundle.storage;
