import { createStore } from "../../../shared/store/createStore";
import type { AuthApiClient } from "../api/authApiClient";
import { AuthApiError } from "../api/authApiClient";
import type { AuthProfile, AuthTokens, LoginRequest } from "../api/types";
import type { AuthRole, AuthSessionStorage, PersistedAuthSession } from "../storage/authSessionStorage";

export type AuthStatus = "anonymous" | "authenticated";

export interface AuthState {
  hydrated: boolean;
  loading: boolean;
  status: AuthStatus;
  role: AuthRole | null;
  tokens: AuthTokens | null;
  profile: AuthProfile | null;
  error: string | null;
}

export interface AuthStoreDependencies {
  apiClient: AuthApiClient;
  storage: AuthSessionStorage;
}

export interface AuthStoreActions {
  hydrate: () => Promise<void>;
  loginPsychologist: (payload: LoginRequest) => Promise<void>;
  refreshSession: () => Promise<void>;
  logout: () => Promise<void>;
  setOnboardingCompleted: (onboardingCompleted: boolean) => Promise<void>;
  clearError: () => void;
}

export interface AuthStore {
  getState: () => AuthState;
  subscribe: (listener: () => void) => () => void;
  actions: AuthStoreActions;
}

const initialAuthState: AuthState = {
  hydrated: false,
  loading: false,
  status: "anonymous",
  role: null,
  tokens: null,
  profile: null,
  error: null,
};

function toUserMessage(error: unknown): string {
  if (error instanceof AuthApiError) {
    return error.message;
  }

  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  return "Nao foi possivel concluir a autenticacao.";
}

function buildPersistedSession(
  role: AuthRole,
  tokens: AuthTokens,
  profile: AuthProfile,
): PersistedAuthSession {
  return {
    role,
    tokens,
    profile,
  };
}

export function createAuthStore(dependencies: AuthStoreDependencies): AuthStore {
  const baseStore = createStore<AuthState>(initialAuthState);

  const setAnonymousState = (error: string | null): void => {
    baseStore.setState((previous) => ({
      ...previous,
      hydrated: true,
      loading: false,
      status: "anonymous",
      role: null,
      tokens: null,
      profile: null,
      error,
    }));
  };

  const setAuthenticatedState = (
    role: AuthRole,
    tokens: AuthTokens,
    profile: AuthProfile,
  ): void => {
    baseStore.setState((previous) => ({
      ...previous,
      hydrated: true,
      loading: false,
      status: "authenticated",
      role,
      tokens,
      profile,
      error: null,
    }));
  };

  const actions: AuthStoreActions = {
    async hydrate(): Promise<void> {
      const currentState = baseStore.getState();
      if (currentState.hydrated || currentState.loading) {
        return;
      }

      baseStore.setState((previous) => ({
        ...previous,
        loading: true,
        error: null,
      }));

      try {
        const persisted = await dependencies.storage.load();
        if (persisted === null) {
          setAnonymousState(null);
          return;
        }

        const profile = await dependencies.apiClient.me(persisted.tokens.accessToken);
        setAuthenticatedState(persisted.role, persisted.tokens, profile);
        await dependencies.storage.save(buildPersistedSession(persisted.role, persisted.tokens, profile));
      } catch {
        await dependencies.storage.clear();
        setAnonymousState(null);
      }
    },

    async loginPsychologist(payload: LoginRequest): Promise<void> {
      baseStore.setState((previous) => ({
        ...previous,
        loading: true,
        error: null,
      }));

      try {
        const tokens = await dependencies.apiClient.login(payload);
        const profile = await dependencies.apiClient.me(tokens.accessToken);
        const role: AuthRole = "psychologist";

        await dependencies.storage.save(buildPersistedSession(role, tokens, profile));
        setAuthenticatedState(role, tokens, profile);
      } catch (error) {
        const userMessage = toUserMessage(error);
        setAnonymousState(userMessage);
        throw error;
      }
    },

    async refreshSession(): Promise<void> {
      const currentState = baseStore.getState();
      if (currentState.status !== "authenticated" || currentState.tokens === null) {
        throw new Error("Sessao indisponivel para refresh.");
      }

      baseStore.setState((previous) => ({
        ...previous,
        loading: true,
        error: null,
      }));

      try {
        const tokens = await dependencies.apiClient.refresh({
          refresh_token: currentState.tokens.refreshToken,
        });
        const profile = currentState.profile ?? (await dependencies.apiClient.me(tokens.accessToken));
        const role = currentState.role ?? "psychologist";

        await dependencies.storage.save(buildPersistedSession(role, tokens, profile));
        setAuthenticatedState(role, tokens, profile);
      } catch (error) {
        const userMessage = toUserMessage(error);
        await dependencies.storage.clear();
        setAnonymousState(userMessage);
        throw error;
      }
    },

    async logout(): Promise<void> {
      const currentState = baseStore.getState();

      baseStore.setState((previous) => ({
        ...previous,
        loading: true,
      }));

      try {
        if (currentState.tokens?.refreshToken) {
          await dependencies.apiClient.logout({
            refresh_token: currentState.tokens.refreshToken,
          });
        }
      } catch {
        // best effort
      }

      await dependencies.storage.clear();
      setAnonymousState(null);
    },

    async setOnboardingCompleted(onboardingCompleted: boolean): Promise<void> {
      const currentState = baseStore.getState();
      if (
        currentState.status !== "authenticated" ||
        currentState.tokens === null ||
        currentState.profile === null ||
        currentState.role === null
      ) {
        return;
      }

      const profile = {
        ...currentState.profile,
        onboardingCompleted,
      };

      await dependencies.storage.save(
        buildPersistedSession(currentState.role, currentState.tokens, profile),
      );
      setAuthenticatedState(currentState.role, currentState.tokens, profile);
    },

    clearError(): void {
      baseStore.setState((previous) => ({
        ...previous,
        error: null,
      }));
    },
  };

  return {
    getState: baseStore.getState,
    subscribe: baseStore.subscribe,
    actions,
  };
}
