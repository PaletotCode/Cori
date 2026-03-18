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
});
