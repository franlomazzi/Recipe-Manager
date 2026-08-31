import {
  arrayRemove,
  arrayUnion,
  doc,
  onSnapshot,
  setDoc,
  type Unsubscribe,
} from "firebase/firestore";
import { getDb } from "./config";

const USERS = "users";

/**
 * Per-user "hide from my recipe library" list.
 *
 * The recipe's own `hiddenFromList` flag can only be written by its creator, so
 * it can't express "hide this from *my* list" for a recipe a household partner
 * shared with me. That preference lives on the reader's own profile doc
 * instead, where the rules already grant owner-only read/write.
 */
export function subscribeHiddenRecipeIds(
  uid: string,
  callback: (ids: Set<string>) => void
): Unsubscribe {
  return onSnapshot(doc(getDb(), USERS, uid), (snap) => {
    const ids = snap.exists()
      ? (snap.data().hiddenRecipeIds as string[] | undefined)
      : undefined;
    callback(new Set(ids ?? []));
  });
}

export async function setRecipeHiddenForUser(
  uid: string,
  recipeId: string,
  hidden: boolean
): Promise<void> {
  await setDoc(
    doc(getDb(), USERS, uid),
    { hiddenRecipeIds: hidden ? arrayUnion(recipeId) : arrayRemove(recipeId) },
    { merge: true }
  );
}
