import { initializeApp, getApps, type App } from "firebase-admin/app";
import { getAuth as getAdminAuth, type Auth as AdminAuth } from "firebase-admin/auth";

// Server-side only. Used by API routes to verify Firebase ID tokens before
// they call into expensive third-party services (Gemini, etc.).
//
// We intentionally do NOT pass credentials. `verifyIdToken` only needs the
// project id — it fetches Google's public certs to validate the token
// signature and checks the `aud` claim against this project. That means this
// works on Firebase App Hosting AND on `npm run dev` locally without a
// service-account key file.

let cachedApp: App | null = null;

export function getAdminApp(): App {
  if (cachedApp) return cachedApp;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!projectId) {
    throw new Error(
      "NEXT_PUBLIC_FIREBASE_PROJECT_ID is not set — cannot initialize firebase-admin"
    );
  }
  const existing = getApps().find((a) => a?.name === "[DEFAULT]");
  cachedApp = existing ?? initializeApp({ projectId });
  return cachedApp;
}

export function getAdminAuthInstance(): AdminAuth {
  return getAdminAuth(getAdminApp());
}

// -------------------------------------------------------------------------
// Whitelist — only these UIDs may call privileged server endpoints.
// Mirrors the whitelist in firestore.rules and storage.rules.
//
// Token verification will reject any token issued by the wrong Firebase
// project (dev tokens fail on prod and vice versa), so listing all 4 UIDs
// here is safe — only the 2 that match the active environment can ever pass.
//
// DEV ENVIRONMENT (workout-app-dev-7e809):
//   - 0CJxUFHYFwgNdG1hHtZbHMGWvvS2 : Fran main dev (flomazzi90@gmail.com)
//   - UHEJanwxp6XBWHBei1faGgScOz23 : Fran testing dev (franco.lomazzi@fisherpaykel.com)
//
// PRODUCTION ENVIRONMENT (workout-app-7da24):
//   - mbkgRXpOZ6ZjY4bbUdzAwVTeB8D2 : Fran main prod (flomazzi90@gmail.com)
//   - 8DKT1q6rafdwp5JdtzHraU5ntSD2 : Partner prod (lobruschini@gmail.com)
// -------------------------------------------------------------------------
export const WHITELISTED_UIDS = new Set<string>([
  "0CJxUFHYFwgNdG1hHtZbHMGWvvS2",
  "UHEJanwxp6XBWHBei1faGgScOz23",
  "mbkgRXpOZ6ZjY4bbUdzAwVTeB8D2",
  "8DKT1q6rafdwp5JdtzHraU5ntSD2",
]);

export interface VerifiedCaller {
  uid: string;
  email: string | null;
}

/**
 * Extracts and verifies the `Authorization: Bearer <idToken>` header.
 * Throws an Error with a `.status` property on failure so route handlers
 * can map it to a JSON response.
 */
export async function verifyAuthorizedCaller(req: Request): Promise<VerifiedCaller> {
  const header = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!header || !header.toLowerCase().startsWith("bearer ")) {
    const err = new Error("Missing Authorization bearer token") as Error & { status?: number };
    err.status = 401;
    throw err;
  }
  const token = header.slice(7).trim();
  if (!token) {
    const err = new Error("Empty Authorization bearer token") as Error & { status?: number };
    err.status = 401;
    throw err;
  }

  let decoded;
  try {
    decoded = await getAdminAuthInstance().verifyIdToken(token);
  } catch {
    const err = new Error("Invalid or expired ID token") as Error & { status?: number };
    err.status = 401;
    throw err;
  }

  if (!WHITELISTED_UIDS.has(decoded.uid)) {
    const err = new Error("Caller is not authorized to use this endpoint") as Error & {
      status?: number;
    };
    err.status = 403;
    throw err;
  }

  return { uid: decoded.uid, email: decoded.email ?? null };
}
