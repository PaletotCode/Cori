import AsyncStorage from "@react-native-async-storage/async-storage";

import type { AuthProfile, AuthTokens } from "../api/types";

const STORAGE_KEY = "@cori:v2:auth-session";

export type AuthRole = "psychologist" | "patient";

export interface PersistedAuthSession {
  role: AuthRole;
  tokens: AuthTokens;
  profile: AuthProfile;
}

export interface AuthSessionStorage {
  load: () => Promise<PersistedAuthSession | null>;
  save: (session: PersistedAuthSession) => Promise<void>;
  clear: () => Promise<void>;
}

function isPersistedAuthSession(value: unknown): value is PersistedAuthSession {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const session = value as Partial<PersistedAuthSession>;
  return (
    (session.role === "psychologist" || session.role === "patient") &&
    typeof session.tokens?.accessToken === "string" &&
    typeof session.tokens.refreshToken === "string" &&
    typeof session.profile?.tenantId === "string"
  );
}

export const authSessionStorage: AuthSessionStorage = {
  async load(): Promise<PersistedAuthSession | null> {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      return null;
    }

    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!isPersistedAuthSession(parsed)) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  },

  async save(session: PersistedAuthSession): Promise<void> {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  },

  async clear(): Promise<void> {
    await AsyncStorage.removeItem(STORAGE_KEY);
  },
};
