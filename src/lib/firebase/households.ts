import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  onSnapshot,
  query,
  where,
  limit,
  serverTimestamp,
  arrayUnion,
  deleteField,
  type Unsubscribe,
} from "firebase/firestore";
import { getDb } from "./config";
import type { Household } from "@/lib/types/household";
import type { User } from "firebase/auth";

const HOUSEHOLDS = "households";
const USERS = "users";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/1/I/O

export function generateInviteCode(length = 6): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return out;
}

function householdsCol() {
  return collection(getDb(), HOUSEHOLDS);
}

export async function getHouseholdIdForUser(uid: string): Promise<string | null> {
  const snap = await getDoc(doc(getDb(), USERS, uid));
  if (!snap.exists()) return null;
  const data = snap.data() as { householdId?: string };
  return data.householdId ?? null;
}

export function subscribeToUserHouseholdId(
  uid: string,
  callback: (householdId: string | null) => void
): Unsubscribe {
  return onSnapshot(doc(getDb(), USERS, uid), (snap) => {
    if (!snap.exists()) {
      callback(null);
      return;
    }
    const data = snap.data() as { householdId?: string };
    callback(data.householdId ?? null);
  });
}

export function subscribeToHousehold(
  householdId: string,
  callback: (household: Household | null) => void
): Unsubscribe {
  return onSnapshot(doc(getDb(), HOUSEHOLDS, householdId), (snap) => {
    if (!snap.exists()) {
      callback(null);
      return;
    }
    callback({ ...(snap.data() as Household), id: snap.id });
  });
}

export async function getHousehold(householdId: string): Promise<Household | null> {
  const snap = await getDoc(doc(getDb(), HOUSEHOLDS, householdId));
  if (!snap.exists()) return null;
  return { ...(snap.data() as Household), id: snap.id };
}

/**
 * Create a brand-new household with the given user as sole owner-member.
 * Also writes `householdId` back to the user doc.
 */
export async function createHousehold(
  user: User,
  name: string = "My Household"
): Promise<string> {
  const db = getDb();
  const ref = doc(householdsCol());
  const inviteCode = generateInviteCode();
  const displayName = user.displayName || user.email || "Member";
  await setDoc(ref, {
    id: ref.id,
    ownerId: user.uid,
    members: [user.uid],
    memberNames: { [user.uid]: displayName },
    memberPhotos: { [user.uid]: user.photoURL ?? "" },
    name,
    inviteCode,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await setDoc(
    doc(db, USERS, user.uid),
    { householdId: ref.id, updatedAt: serverTimestamp() },
    { merge: true }
  );
  return ref.id;
}

/**
 * Find a household by invite code and add the current user to it.
 * Throws if the code is unknown or the household is already full.
 */
export async function joinHouseholdByCode(
  user: User,
  rawCode: string
): Promise<string> {
  const db = getDb();
  const code = rawCode.trim().toUpperCase();
  if (code.length < 4) throw new Error("Invalid invite code");

  const q = query(householdsCol(), where("inviteCode", "==", code), limit(1));
  const snap = await getDocs(q);
  if (snap.empty) throw new Error("No household found for that code");

  const householdDoc = snap.docs[0];
  const data = householdDoc.data() as Household;
  if (data.members.includes(user.uid)) {
    // Already a member — just make sure user doc is in sync
    await setDoc(
      doc(db, USERS, user.uid),
      { householdId: householdDoc.id, updatedAt: serverTimestamp() },
      { merge: true }
    );
    return householdDoc.id;
  }
  if (data.members.length >= 2) {
    throw new Error("That household is already full");
  }

  const displayName = user.displayName || user.email || "Member";
  await updateDoc(householdDoc.ref, {
    members: arrayUnion(user.uid),
    [`memberNames.${user.uid}`]: displayName,
    [`memberPhotos.${user.uid}`]: user.photoURL ?? "",
    updatedAt: serverTimestamp(),
  });
  await setDoc(
    doc(db, USERS, user.uid),
    { householdId: householdDoc.id, updatedAt: serverTimestamp() },
    { merge: true }
  );
  return householdDoc.id;
}

export async function regenerateInviteCode(
  householdId: string
): Promise<string> {
  const code = generateInviteCode();
  await updateDoc(doc(getDb(), HOUSEHOLDS, householdId), {
    inviteCode: code,
    updatedAt: serverTimestamp(),
  });
  return code;
}

export async function updateHouseholdName(
  householdId: string,
  name: string
): Promise<void> {
  await updateDoc(doc(getDb(), HOUSEHOLDS, householdId), {
    name,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Remove the user from the household and clear `householdId` from their user doc.
 * The household doc itself is left in place (the other member keeps it).
 */
export async function leaveHousehold(
  user: User,
  householdId: string
): Promise<void> {
  const db = getDb();
  const ref = doc(db, HOUSEHOLDS, householdId);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    const data = snap.data() as Household;
    const remaining = data.members.filter((m) => m !== user.uid);
    const memberNames = { ...(data.memberNames ?? {}) };
    delete memberNames[user.uid];
    const memberPhotos = { ...(data.memberPhotos ?? {}) };
    delete memberPhotos[user.uid];
    await updateDoc(ref, {
      members: remaining,
      memberNames,
      memberPhotos,
      // Hand ownership over if owner is leaving and someone else remains
      ownerId:
        data.ownerId === user.uid && remaining.length > 0
          ? remaining[0]
          : data.ownerId,
      updatedAt: serverTimestamp(),
    });
  }
  await setDoc(
    doc(db, USERS, user.uid),
    { householdId: deleteField(), updatedAt: serverTimestamp() },
    { merge: true }
  );
}
