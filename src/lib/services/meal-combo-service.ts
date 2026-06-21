// Client-side orchestration for the AI "combined plate":
//   1. POST /api/generate-meal-combo (auth-gated) → { name, image(base64) }
//   2. Upload the image to the shared meal_photos bucket
//   3. Persist a recipe_meal_combos doc keyed by the sorted mealId set
// The API key stays server-side; we attach the active account's ID token.
import { getAuth } from "@/lib/firebase/config";
import { uploadRecipeImage } from "@/lib/firebase/storage";
import {
  saveMealCombo,
  comboKeyFor,
  type MealCombo,
} from "@/lib/firebase/meal-combos";

function base64ToImageFile(b64: string, name: string, mimeType: string): File {
  const clean = b64.replace(/\s/g, "");
  const bytes = atob(clean);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new File([arr], name, { type: mimeType });
}

export async function generateMealCombo(
  uid: string,
  mealIds: string[],
  titles: string[],
  category?: string
): Promise<MealCombo> {
  const currentUser = getAuth().currentUser;
  if (!currentUser) {
    throw new Error("You must be signed in to generate a combined photo.");
  }
  const idToken = await currentUser.getIdToken();

  const res = await fetch("/api/generate-meal-combo", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ titles, category }),
  });

  if (!res.ok) {
    let message = "Failed to generate combined photo";
    try {
      const err = await res.json();
      message =
        (typeof err?.error === "string" ? err.error : err?.error?.message) ||
        message;
    } catch {
      // ignore parse failure
    }
    throw new Error(message);
  }

  const data = (await res.json()) as {
    name: string;
    image: string;
    mimeType?: string;
  };
  const mime = data.mimeType ?? "image/png";
  const ext = mime === "image/jpeg" ? "jpg" : "png";
  const file = base64ToImageFile(data.image, `combo.${ext}`, mime);
  // Re-use the recipe image uploader; a "combo_" prefix keeps the path distinct.
  const { url, path } = await uploadRecipeImage(
    uid,
    `combo_${comboKeyFor(mealIds)}`,
    file
  );
  return saveMealCombo(uid, mealIds, {
    name: data.name,
    imageURL: url,
    imageStoragePath: path,
  });
}
