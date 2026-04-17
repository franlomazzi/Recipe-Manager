// Client-side helper that calls the Recipe Manager's server proxy at
// /api/generate-recipe-image. The Gemini API key never touches the client,
// and the route is auth-gated — we attach a Firebase ID token from whichever
// account is currently active so the server can verify the caller is on the
// whitelist.
import { getAuth } from "@/lib/firebase/config";

/**
 * Generate an AI photo for a recipe via Gemini Imagen 4.0.
 *
 * @param title         Recipe title — used in the default prompt and required
 *                      even when a custom prompt is supplied (the server route
 *                      validates it).
 * @param customPrompt  Optional override prompt. If omitted, a sensible food
 *                      photography prompt is built from the title server-side.
 * @returns             A JPEG Blob ready to preview/upload.
 */
export async function generateRecipeImage(
  title: string,
  customPrompt?: string
): Promise<Blob> {
  // Pull a fresh ID token from the currently active account. `getAuth()`
  // already respects the active-account-key in localStorage, so on a tablet
  // the request goes out as whichever account the user has selected.
  const currentUser = getAuth().currentUser;
  if (!currentUser) {
    throw new Error("You must be signed in to generate AI photos.");
  }
  const idToken = await currentUser.getIdToken();

  const response = await fetch("/api/generate-recipe-image", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ title, prompt: customPrompt }),
  });

  if (!response.ok) {
    let message = "Failed to generate recipe photo";
    try {
      const errorData = await response.json();
      message =
        errorData?.error?.message ||
        (typeof errorData?.error === "string" ? errorData.error : null) ||
        errorData?.details ||
        message;
    } catch {
      // ignore JSON parse failure — fall through to default message
    }
    throw new Error(message);
  }

  const data = await response.json();
  const base64Image: string | undefined = data?.predictions?.[0]?.bytesBase64Encoded;
  if (!base64Image) {
    throw new Error("Gemini returned no image data");
  }

  // Strip any whitespace the API may inject, then decode base64 → bytes → Blob.
  const cleanBase64 = base64Image.replace(/\s/g, "");
  const byteCharacters = atob(cleanBase64);
  const byteNumbers = new Array<number>(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: "image/jpeg" });
}
