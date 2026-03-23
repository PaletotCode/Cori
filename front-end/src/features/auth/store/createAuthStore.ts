import { createStore } from "../../../shared/store/createStore";
import type { AuthApiClient } from "../api/authApiClient";
import { AuthApiError } from "../api/authApiClient";
import type {
  AuthProfile,
  AuthTokens,
  CompleteOnboardingRequest,
  GoogleOAuthExchangeRequest,
  LoginRequest,
} from "../api/types";
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
  loginWithGoogle: (payload: GoogleOAuthExchangeRequest) => Promise<void>;
  completePsychologistOnboarding: (payload: CompleteOnboardingRequest) => Promise<void>;
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

function buildPatientProfile(tenantId: string): AuthProfile {
  return {
    userId: "patient-session",
    tenantId,
    psychologistId: null,
    email: "",
    fullName: "Paciente",
    onboardingCompleted: false,
  };
}

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  if (typeof globalThis.atob === "function") {
    return globalThis.atob(padded);
  }
  return "";
}

function tryReadTenantIdFromJwt(accessToken: string): string | null {
  const chunks = accessToken.split(".");
  if (chunks.length !== 3) {
    return null;
  }
  try {
    const claims = JSON.parse(decodeBase64Url(chunks[1])) as Record<string, unknown>;
    const tenantClaim = claims.tenant_id;
    if (typeof tenantClaim === "string" && tenantClaim.length > 0) {
      return tenantClaim;
    }
    return null;
  } catch {
    return null;
  }
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

        if (persisted.role === "patient") {
          setAuthenticatedState(persisted.role, persisted.tokens, persisted.profile);
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

    async loginWithGoogle(payload: GoogleOAuthExchangeRequest): Promise<void> {
      baseStore.setState((previous) => ({
        ...previous,
        loading: true,
        error: null,
      }));

      try {
        const tokens = await dependencies.apiClient.exchangeGoogleCode(payload);
        const role: AuthRole = payload.role;
        const profile =
          role === "patient"
            ? buildPatientProfile(tryReadTenantIdFromJwt(tokens.accessToken) ?? payload.tenantId)
            : await dependencies.apiClient.me(tokens.accessToken);

        await dependencies.storage.save(buildPersistedSession(role, tokens, profile));
        setAuthenticatedState(role, tokens, profile);
      } catch (error) {
        const userMessage = toUserMessage(error);
        setAnonymousState(userMessage);
        throw error;
      }
    },

    async completePsychologistOnboarding(payload: CompleteOnboardingRequest): Promise<void> {
      const currentState = baseStore.getState();
      if (
        currentState.status !== "authenticated" ||
        currentState.role !== "psychologist" ||
        currentState.tokens === null
      ) {
        throw new Error("Sessao de psicologo indisponivel para concluir onboarding.");
      }

      baseStore.setState((previous) => ({
        ...previous,
        loading: true,
        error: null,
      }));

      try {
        const profile = await dependencies.apiClient.completeOnboarding(
          currentState.tokens.accessToken,
          payload,
        );
        await dependencies.storage.save(
          buildPersistedSession(currentState.role, currentState.tokens, profile),
        );
        setAuthenticatedState(currentState.role, currentState.tokens, profile);
      } catch (error) {
        const userMessage = toUserMessage(error);
        baseStore.setState((previous) => ({
          ...previous,
          loading: false,
          error: userMessage,
        }));
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
        const role = currentState.role ?? "psychologist";
        const persistedTenantId =
          currentState.profile !== null && typeof currentState.profile.tenantId === "string"
            ? currentState.profile.tenantId
            : "tenant-patient";
        const profile =
          role === "patient"
            ? currentState.profile ?? buildPatientProfile(persistedTenantId)
            : currentState.profile ?? (await dependencies.apiClient.me(tokens.accessToken));

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
