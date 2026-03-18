import { AuthApiError, createAuthApiClient } from "../src/features/auth/api/authApiClient";

type FetchMock = jest.MockedFunction<typeof fetch>;

function createFetchMock(): FetchMock {
  return jest.fn() as unknown as FetchMock;
}

describe("auth api client", () => {
  it("sends login payload and maps token response", async () => {
    const fetchMock = createFetchMock();
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          access_token: "access",
          refresh_token: "refresh",
          token_type: "bearer",
          access_expires_in: 100,
          refresh_expires_in: 200,
        }),
    } as Response);

    const client = createAuthApiClient({
      baseUrl: "http://localhost:8000",
      fetchImpl: fetchMock,
    });

    const tokens = await client.login({
      email: "dr@cori.dev",
      password: "dev123456",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/auth/login",
      expect.objectContaining({
        method: "POST",
      }),
    );
    expect(tokens).toEqual({
      accessToken: "access",
      refreshToken: "refresh",
      accessExpiresIn: 100,
      refreshExpiresIn: 200,
    });
  });

  it("sends bearer token on me endpoint", async () => {
    const fetchMock = createFetchMock();
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          user_id: "user-1",
          tenant_id: "tenant-1",
          psychologist_id: "psy-1",
          email: "dr@cori.dev",
          full_name: "Dra. Cori",
          onboarding_completed: false,
        }),
    } as Response);

    const client = createAuthApiClient({
      baseUrl: "http://localhost:8000",
      fetchImpl: fetchMock,
    });

    const profile = await client.me("token-123");

    const [, requestInit] = fetchMock.mock.calls[0];
    expect((requestInit?.headers as Record<string, string>).Authorization).toBe(
      "Bearer token-123",
    );
    expect(profile.tenantId).toBe("tenant-1");
    expect(profile.onboardingCompleted).toBe(false);
  });

  it("throws typed error when api returns non-2xx", async () => {
    const fetchMock = createFetchMock();
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ detail: "Credenciais invalidas." }),
    } as Response);

    const client = createAuthApiClient({
      baseUrl: "http://localhost:8000",
      fetchImpl: fetchMock,
    });

    await expect(
      client.login({
        email: "invalid@cori.dev",
        password: "invalid123",
      }),
    ).rejects.toEqual(new AuthApiError("Credenciais invalidas.", 401));
  });
});
