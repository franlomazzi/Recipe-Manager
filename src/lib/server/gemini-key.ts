import { SecretManagerServiceClient } from "@google-cloud/secret-manager";

let cached: string | null = null;

/**
 * Returns the Gemini API key.
 *
 * In deployed environments (Firebase App Hosting) the key is injected as
 * GEMINI_API_KEY via apphosting.*.yaml secret bindings, so we return it
 * immediately without a network call.
 *
 * Locally, we fall back to Secret Manager using Application Default
 * Credentials (`gcloud auth application-default login`). The project is
 * taken from NEXT_PUBLIC_FIREBASE_PROJECT_ID, which is always present in
 * .env.local.
 */
export async function getGeminiApiKey(): Promise<string> {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  if (cached) return cached;

  const project = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!project) {
    throw new Error(
      "Cannot resolve Gemini key: NEXT_PUBLIC_FIREBASE_PROJECT_ID is not set"
    );
  }

  const client = new SecretManagerServiceClient();
  const [version] = await client.accessSecretVersion({
    name: `projects/${project}/secrets/GEMINI_API_KEY_RECIPE_MANAGER/versions/latest`,
  });

  const key = version.payload?.data?.toString();
  if (!key) {
    throw new Error("GEMINI_API_KEY secret is empty in Secret Manager");
  }

  cached = key;
  return cached;
}
