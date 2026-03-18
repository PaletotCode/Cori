import {
  createPracticeProfileApiClient,
  PracticeProfileApiError,
} from "../src/features/practice-profile/api/practiceProfileApiClient";

type FetchMock = jest.MockedFunction<typeof fetch>;

function createFetchMock(): FetchMock {
  return jest.fn() as unknown as FetchMock;
}

function makeProfileResponse() {
  return {
    id: "profile-1",
    tenant_id: "tenant-1",
    practice_name: "Clinica Aurora",
    clinical_approach: "TCC",
    service_modality: "hybrid",
    in_person_address: "Rua A, 10",
    session_price_cents: 25000,
    currency: "BRL",
    late_cancellation_window_hours: 24,
    late_cancellation_fee_percent: 40,
    no_show_fee_percent: 80,
    notification_email_enabled: true,
    notification_whatsapp_enabled: true,
    notification_push_enabled: false,
    session_reminder_hours_before: [48, 24, 2],
    default_triage_mode: "custom",
    default_triage_message: "Mensagem de triagem completa.",
    onboarding_completed: true,
    created_at: "2026-03-17T12:00:00Z",
    updated_at: "2026-03-17T12:00:00Z",
  };
}

describe("practice profile api client", () => {
  it("loads profile and maps response fields", async () => {
    const fetchMock = createFetchMock();
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(makeProfileResponse()),
    } as Response);

    const client = createPracticeProfileApiClient({
      baseUrl: "http://localhost:8000",
      fetchImpl: fetchMock,
    });

    const profile = await client.get("token-123");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/practice-profile",
      expect.objectContaining({
        method: "GET",
      }),
    );
    expect(profile.practiceName).toBe("Clinica Aurora");
    expect(profile.onboardingCompleted).toBe(true);
  });

  it("sends upsert payload with bearer token", async () => {
    const fetchMock = createFetchMock();
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(makeProfileResponse()),
    } as Response);

    const client = createPracticeProfileApiClient({
      baseUrl: "http://localhost:8000",
      fetchImpl: fetchMock,
    });

    await client.upsert("token-abc", {
      practice_name: "Clinica Aurora",
      clinical_approach: "TCC",
      service_modality: "online",
      in_person_address: null,
      session_price_cents: 24000,
      currency: "BRL",
      late_cancellation_window_hours: 24,
      late_cancellation_fee_percent: 30,
      no_show_fee_percent: 70,
      notification_email_enabled: true,
      notification_whatsapp_enabled: true,
      notification_push_enabled: false,
      session_reminder_hours_before: [24, 2],
      default_triage_mode: "standard",
      default_triage_message: null,
    });

    const [, requestInit] = fetchMock.mock.calls[0];
    expect(requestInit?.method).toBe("PUT");
    expect((requestInit?.headers as Record<string, string>).Authorization).toBe(
      "Bearer token-abc",
    );
  });

  it("throws typed error on non-2xx", async () => {
    const fetchMock = createFetchMock();
    fetchMock.mockResolvedValue({
      ok: false,
      status: 422,
      text: async () => JSON.stringify({ detail: "Payload invalido." }),
    } as Response);

    const client = createPracticeProfileApiClient({
      baseUrl: "http://localhost:8000",
      fetchImpl: fetchMock,
    });

    await expect(client.get("token-1")).rejects.toEqual(
      new PracticeProfileApiError("Payload invalido.", 422),
    );
  });
});
