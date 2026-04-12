import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  updateProfile,
  type User,
  type Auth,
} from "firebase/auth";
import { doc, setDoc, getDoc, serverTimestamp, type Firestore } from "firebase/firestore";
import {
  getAuth,
  getDb,
  ensureSecondaryApp,
  type AccountKey,
} from "./config";
import type { UserProfile } from "@/lib/types/user";

const googleProvider = new GoogleAuthProvider();

export async function signInWithGoogle(key?: AccountKey) {
  const result = await signInWithPopup(getAuth(key), googleProvider);
  await ensureUserProfile(result.user);
  return result.user;
}

/**
 * Sign in with Google on the secondary Firebase app instance, used by the
 * tablet "add another account" flow. The secondary app keeps its own
 * IndexedDB-backed auth persistence so both users stay signed in.
 */
export async function signInWithGoogleSecondary() {
  const bundle = ensureSecondaryApp();
  // Force the account picker so the user can choose a *different* Google
  // account. Without this, mobile browsers silently reuse the active account.
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  const result = await signInWithPopup(bundle.auth, provider);
  // Use the secondary app's Firestore instance so the write is
  // authenticated as the secondary user, not the primary.
  await ensureUserProfile(result.user, bundle.db);
  return result.user;
}

export async function signInWithEmail(email: string, password: string) {
  const result = await signInWithEmailAndPassword(getAuth(), email, password);
  return result.user;
}

export async function signUpWithEmail(
  email: string,
  password: string,
  displayName: string
) {
  const result = await createUserWithEmailAndPassword(
    getAuth(),
    email,
    password
  );
  await updateProfile(result.user, { displayName });
  await ensureUserProfile(result.user);
  return result.user;
}

export async function signOut() {
  await firebaseSignOut(getAuth());
}

export async function signOutKey(key: AccountKey) {
  await firebaseSignOut(getAuth(key));
}

async function ensureUserProfile(user: User, db?: Firestore) {
  const userRef = doc(db ?? getDb(), "users", user.uid);
  const userSnap = await getDoc(userRef);

  if (!userSnap.exists()) {
    const profile: Omit<UserProfile, "createdAt" | "updatedAt"> & {
      createdAt: ReturnType<typeof serverTimestamp>;
      updatedAt: ReturnType<typeof serverTimestamp>;
    } = {
      uid: user.uid,
      email: user.email || "",
      displayName: user.displayName || "",
      photoURL: user.photoURL,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      preferences: {
        theme: "system",
        defaultServings: 4,
        measurementSystem: "metric",
      },
    };
    await setDoc(userRef, profile);
  }
}
