import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from "firebase/storage";
import { getStorage } from "./config";

export async function uploadRecipeImage(
  userId: string,
  recipeId: string,
  file: File
): Promise<{ url: string; path: string }> {
  // Use food tracking app's path convention so photos work in both apps
  const path = `meal_photos/${userId}/${recipeId}_${Date.now()}.jpg`;
  const storageRef = ref(getStorage(), path);

  await uploadBytes(storageRef, file, {
    contentType: file.type,
  });

  const url = await getDownloadURL(storageRef);
  return { url, path };
}

export async function deleteRecipeImage(storagePath: string) {
  const storageRef = ref(getStorage(), storagePath);
  await deleteObject(storageRef);
}
