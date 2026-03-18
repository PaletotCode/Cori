import {
  createSessionsApiClient,
  SessionsApiError,
} from "../src/features/sessions/api/sessionsApiClient";

type FetchMock = jest.MockedFunction<typeof fetch>;

function createFetchMock(): FetchMock {
  return jest.fn() as unknown as FetchMock;
}

describe("sessions api client", () => {
  it("lists agenda with mapped payload", async () => {
    const fetchMock = createFetchMock();
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify([
          {
            id: "session-1",
            patient_id: "patient-1",
            patient_name: "Paciente Aurora",
            psychologist_id: "psy-1",
            status: "scheduled",
            location_mode: "online",
            scheduled_start_at: "2026-03-20T14:00:00Z",
            scheduled_end_at: "2026-03-20T14:50:00Z",
            confirmation_token_expires_at: "2026-04-20T14:50:00Z",
          },
        ]),
    } as Response);

    const client = createSessionsApiClient({
      baseUrl: "http://localhost:8000",
      fetchImpl: fetchMock,
    });

    const agenda = await client.listAgenda("access-token", {
      view: "week",
      referenceDate: "2026-03-20",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/agenda?view=week&reference_date=2026-03-20",
      expect.objectContaining({ method: "GET" }),
    );
    expect(agenda[0].patientName).toBe("Paciente Aurora");
    expect(agenda[0].status).toBe("scheduled");
  });

  it("confirms public session by token", async () => {
    const fetchMock = createFetchMock();
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          session_id: "session-2",
          status: "confirmed",
          confirmed_at: "2026-03-20T13:15:00Z",
        }),
    } as Response);

    const client = createSessionsApiClient({
      baseUrl: "http://localhost:8000",
      fetchImpl: fetchMock,
    });

    const result = await client.confirmPublicSession("token-abc", "session-2");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/session-links/token-abc/sessions/session-2/confirm",
      expect.objectContaining({ method: "POST" }),
    );
    expect(result.status).toBe("confirmed");
  });

  it("throws typed error for invalid action transition", async () => {
    const fetchMock = createFetchMock();
    fetchMock.mockResolvedValue({
      ok: false,
      status: 409,
      text: async () => JSON.stringify({ detail: "Sessao nao pode ser confirmada neste estado." }),
    } as Response);

    const client = createSessionsApiClient({
      baseUrl: "http://localhost:8000",
      fetchImpl: fetchMock,
    });

    await expect(
      client.applySessionAction("access-token", "session-1", { action: "confirm" }),
    ).rejects.toEqual(
      new SessionsApiError("Sessao nao pode ser confirmada neste estado.", 409),
    );
  });
});
