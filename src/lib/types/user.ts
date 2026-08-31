import type { Timestamp } from "firebase/firestore";

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  preferences: UserPreferences;
  /**
   * Recipe ids this user has hidden from their own recipe library. Lives here
   * rather than on the recipe so it also works for recipes shared by a
   * household partner, which this user has no write access to.
   */
  hiddenRecipeIds?: string[];
}

export interface UserPreferences {
  theme: "light" | "dark" | "system";
  defaultServings: number;
  measurementSystem: "metric" | "imperial";
}
