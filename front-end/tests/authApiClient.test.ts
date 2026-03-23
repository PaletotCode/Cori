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

  it("maps google oauth code exchange payload", async () => {
    const fetchMock = createFetchMock();
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          access_token: "access-google",
          refresh_token: "refresh-google",
          token_type: "bearer",
          access_expires_in: 1800,
          refresh_expires_in: 2592000,
        }),
    } as Response);

    const client = createAuthApiClient({
      baseUrl: "http://localhost:8000",
      fetchImpl: fetchMock,
    });

    const tokens = await client.exchangeGoogleCode({
      code: "auth-code-1",
      tenantId: "tenant-1",
      redirectUri: "http://localhost:8081/psicologo/login",
      role: "psychologist",
      stateNonce: "nonce-1",
      codeVerifier:
        "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~abc",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/auth/google/exchange",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          code: "auth-code-1",
          tenant_id: "tenant-1",
          redirect_uri: "http://localhost:8081/psicologo/login",
          role: "psychologist",
          state_nonce: "nonce-1",
          code_verifier:
            "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~abc",
        }),
      }),
    );
    expect(tokens.accessToken).toBe("access-google");
  });

  it("sends patient access code in google oauth exchange payload", async () => {
    const fetchMock = createFetchMock();
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          access_token: "access-google-patient",
          refresh_token: "refresh-google-patient",
          token_type: "bearer",
          access_expires_in: 1800,
          refresh_expires_in: 2592000,
        }),
    } as Response);

    const client = createAuthApiClient({
      baseUrl: "http://localhost:8000",
      fetchImpl: fetchMock,
    });

    await client.exchangeGoogleCode({
      code: "auth-code-patient",
      tenantId: "tenant-placeholder",
      redirectUri: "http://localhost:8081/psicologo/login",
      role: "patient",
      stateNonce: "nonce-patient-1",
      codeVerifier:
        "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~abc",
      intakeAccessCode: "COR1234-0042-77",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/auth/google/exchange",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          code: "auth-code-patient",
          tenant_id: "tenant-placeholder",
          redirect_uri: "http://localhost:8081/psicologo/login",
          role: "patient",
          state_nonce: "nonce-patient-1",
          code_verifier:
            "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~abc",
          intake_access_code: "COR1234-0042-77",
        }),
      }),
    );
  });

  it("sends onboarding completion payload and maps profile response", async () => {
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
          onboarding_completed: true,
        }),
    } as Response);

    const client = createAuthApiClient({
      baseUrl: "http://localhost:8000",
      fetchImpl: fetchMock,
    });

    const profile = await client.completeOnboarding("token-123", {
      displayName: "Dra. Cori",
      clinicalApproach: "TCC",
      serviceModality: "online",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/auth/onboarding/complete",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer token-123",
        }),
        body: JSON.stringify({
          display_name: "Dra. Cori",
          clinical_approach: "TCC",
          service_modality: "online",
        }),
      }),
    );
    expect(profile.onboardingCompleted).toBe(true);
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

  it("normalizes structured validation errors into readable message", async () => {
    const fetchMock = createFetchMock();
    fetchMock.mockResolvedValue({
      ok: false,
      status: 422,
      text: async () =>
        JSON.stringify({
          detail: [
            {
              msg: "Field required",
              loc: ["body", "intake_access_code"],
            },
          ],
        }),
    } as Response);

    const client = createAuthApiClient({
      baseUrl: "http://localhost:8000",
      fetchImpl: fetchMock,
    });

    await expect(
      client.exchangeGoogleCode({
        code: "auth-code-patient",
        tenantId: "tenant-placeholder",
        redirectUri: "http://localhost:8081/psicologo/login",
        role: "patient",
        stateNonce: "nonce-patient-1",
        codeVerifier:
          "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~abc",
        intakeAccessCode: "COR1234-0042-77",
      }),
    ).rejects.toEqual(new AuthApiError("Field required (body.intake_access_code)", 422));
  });
});
