import type { AuthApiClient } from "../src/features/auth/api/authApiClient";
import type { AuthProfile, AuthTokens } from "../src/features/auth/api/types";
import { createAuthStore } from "../src/features/auth/store/createAuthStore";
import type {
  AuthSessionStorage,
  PersistedAuthSession,
} from "../src/features/auth/storage/authSessionStorage";

function makeTokens(): AuthTokens {
  return {
    accessToken: "access-token",
    refreshToken: "refresh-token",
    accessExpiresIn: 1800,
    refreshExpiresIn: 86400,
  };
}

function makeProfile(): AuthProfile {
  return {
    userId: "user-1",
    tenantId: "tenant-1",
    psychologistId: "psy-1",
    email: "dr@cori.dev",
    fullName: "Dra. Cori",
    onboardingCompleted: false,
  };
}

function createDependencies() {
  const apiClient: jest.Mocked<AuthApiClient> = {
    login: jest.fn(),
    exchangeGoogleCode: jest.fn(),
    completeOnboarding: jest.fn(),
    refresh: jest.fn(),
    logout: jest.fn(),
    me: jest.fn(),
  };

  const storage: jest.Mocked<AuthSessionStorage> = {
    load: jest.fn(),
    save: jest.fn(),
    clear: jest.fn(),
  };

  return { apiClient, storage };
}

describe("auth store", () => {
  it("rehydrates session from storage", async () => {
    const { apiClient, storage } = createDependencies();
    const tokens = makeTokens();
    const profile = makeProfile();

    const persisted: PersistedAuthSession = {
      role: "psychologist",
      tokens,
      profile,
    };

    storage.load.mockResolvedValue(persisted);
    apiClient.me.mockResolvedValue(profile);

    const store = createAuthStore({
      apiClient,
      storage,
    });

    await store.actions.hydrate();

    expect(store.getState()).toMatchObject({
      hydrated: true,
      status: "authenticated",
      role: "psychologist",
      tokens,
      profile,
      error: null,
    });
    expect(storage.save).toHaveBeenCalledTimes(1);
  });

  it("logs in psychologist and persists tokens", async () => {
    const { apiClient, storage } = createDependencies();
    const tokens = makeTokens();
    const profile = makeProfile();

    apiClient.login.mockResolvedValue(tokens);
    apiClient.me.mockResolvedValue(profile);

    const store = createAuthStore({
      apiClient,
      storage,
    });

    await store.actions.loginPsychologist({
      email: "dr@cori.dev",
      password: "dev123456",
    });

    expect(apiClient.login).toHaveBeenCalledWith({
      email: "dr@cori.dev",
      password: "dev123456",
    });
    expect(store.getState().status).toBe("authenticated");
    expect(store.getState().tokens).toEqual(tokens);
    expect(storage.save).toHaveBeenCalledTimes(1);
  });

  it("logs in via google oauth code exchange", async () => {
    const { apiClient, storage } = createDependencies();
    const tokens = makeTokens();
    const profile = makeProfile();

    apiClient.exchangeGoogleCode.mockResolvedValue(tokens);
    apiClient.me.mockResolvedValue(profile);

    const store = createAuthStore({
      apiClient,
      storage,
    });

    await store.actions.loginWithGoogle({
      code: "google-auth-code",
      tenantId: "tenant-1",
      redirectUri: "http://localhost:8081/psicologo/login",
      role: "psychologist",
      stateNonce: "nonce-1",
      codeVerifier:
        "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~abc",
    });

    expect(apiClient.exchangeGoogleCode).toHaveBeenCalledWith({
      code: "google-auth-code",
      tenantId: "tenant-1",
      redirectUri: "http://localhost:8081/psicologo/login",
      role: "psychologist",
      stateNonce: "nonce-1",
      codeVerifier:
        "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~abc",
    });
    expect(store.getState().status).toBe("authenticated");
    expect(store.getState().role).toBe("psychologist");
    expect(storage.save).toHaveBeenCalledTimes(1);
  });

  it("logs in patient via google oauth without me lookup", async () => {
    const { apiClient, storage } = createDependencies();
    const tokens = makeTokens();

    apiClient.exchangeGoogleCode.mockResolvedValue(tokens);

    const store = createAuthStore({
      apiClient,
      storage,
    });

    await store.actions.loginWithGoogle({
      code: "google-auth-code-patient",
      tenantId: "tenant-patient",
      redirectUri: "http://localhost:8081/psicologo/login",
      role: "patient",
      stateNonce: "nonce-patient-1",
      codeVerifier:
        "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~abc",
      intakeAccessCode: "COR1234-0042-77",
    });

    expect(apiClient.exchangeGoogleCode).toHaveBeenCalledTimes(1);
    expect(apiClient.me).not.toHaveBeenCalled();
    expect(store.getState().status).toBe("authenticated");
    expect(store.getState().role).toBe("patient");
    expect(store.getState().profile?.tenantId).toBe("tenant-patient");
    expect(storage.save).toHaveBeenCalledTimes(1);
  });

  it("clears state and storage on logout", async () => {
    const { apiClient, storage } = createDependencies();
    const tokens = makeTokens();
    const profile = makeProfile();

    apiClient.login.mockResolvedValue(tokens);
    apiClient.me.mockResolvedValue(profile);
    apiClient.logout.mockResolvedValue({ success: true });

    const store = createAuthStore({
      apiClient,
      storage,
    });

    await store.actions.loginPsychologist({
      email: "dr@cori.dev",
      password: "dev123456",
    });
    await store.actions.logout();

    expect(apiClient.logout).toHaveBeenCalledWith({ refresh_token: "refresh-token" });
    expect(storage.clear).toHaveBeenCalled();
    expect(store.getState().status).toBe("anonymous");
    expect(store.getState().tokens).toBeNull();
  });

  it("keeps anonymous state when login fails", async () => {
    const { apiClient, storage } = createDependencies();
    apiClient.login.mockRejectedValue(new Error("Credenciais invalidas."));

    const store = createAuthStore({
      apiClient,
      storage,
    });

    await expect(
      store.actions.loginPsychologist({
        email: "wrong@cori.dev",
        password: "wrongpass",
      }),
    ).rejects.toThrow("Credenciais invalidas.");

    expect(store.getState().status).toBe("anonymous");
    expect(store.getState().tokens).toBeNull();
    expect(store.getState().error).toBe("Credenciais invalidas.");
  });

  it("updates onboarding completion after wizard save", async () => {
    const { apiClient, storage } = createDependencies();
    const tokens = makeTokens();
    const profile = makeProfile();

    apiClient.login.mockResolvedValue(tokens);
    apiClient.me.mockResolvedValue(profile);

    const store = createAuthStore({
      apiClient,
      storage,
    });

    await store.actions.loginPsychologist({
      email: "dr@cori.dev",
      password: "dev123456",
    });
    await store.actions.setOnboardingCompleted(true);

    expect(store.getState().profile?.onboardingCompleted).toBe(true);
    expect(storage.save).toHaveBeenCalledTimes(2);
  });

  it("persists onboarding completion in backend and updates profile", async () => {
    const { apiClient, storage } = createDependencies();
    const tokens = makeTokens();
    const profile = makeProfile();

    apiClient.login.mockResolvedValue(tokens);
    apiClient.me.mockResolvedValue(profile);
    apiClient.completeOnboarding.mockResolvedValue({
      ...profile,
      onboardingCompleted: true,
      fullName: "Dra. Cori Prime",
    });

    const store = createAuthStore({
      apiClient,
      storage,
    });

    await store.actions.loginPsychologist({
      email: "dr@cori.dev",
      password: "dev123456",
    });
    await store.actions.completePsychologistOnboarding({
      displayName: "Dra. Cori Prime",
      clinicalApproach: "TCC",
      serviceModality: "online",
    });

    expect(apiClient.completeOnboarding).toHaveBeenCalledWith("access-token", {
      displayName: "Dra. Cori Prime",
      clinicalApproach: "TCC",
      serviceModality: "online",
    });
    expect(store.getState().profile?.onboardingCompleted).toBe(true);
    expect(store.getState().profile?.fullName).toBe("Dra. Cori Prime");
  });
});
