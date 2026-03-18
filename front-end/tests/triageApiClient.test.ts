import { createTriageApiClient, TriageApiError } from "../src/features/triage/api/triageApiClient";

type FetchMock = jest.MockedFunction<typeof fetch>;

function createFetchMock(): FetchMock {
  return jest.fn() as unknown as FetchMock;
}

describe("triage api client", () => {
  it("creates invite with mapped payload and response", async () => {
    const fetchMock = createFetchMock();
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          intake_id: "intake-1",
          mode: "custom_triage",
          status: "pending_submission",
          invite_token: "token-abc",
          invite_link: "http://localhost:8081/paciente/convite?token=token-abc",
          invite_expires_at: "2026-03-20T18:00:00Z",
        }),
    } as Response);

    const client = createTriageApiClient({
      baseUrl: "http://localhost:8000",
      fetchImpl: fetchMock,
    });

    const result = await client.createInvite("access-token", {
      mode: "custom_triage",
      expiresInHours: 48,
      inviteMessage: "Mensagem inicial",
      customQuestions: [{ prompt: "Pergunta 1", required: true }],
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/intakes/invites",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          mode: "custom_triage",
          expires_in_hours: 48,
          invite_message: "Mensagem inicial",
          custom_questions: [{ prompt: "Pergunta 1", required: true }],
        }),
      }),
    );
    expect(result.intakeId).toBe("intake-1");
    expect(result.inviteToken).toBe("token-abc");
  });

  it("loads public intake with custom questions", async () => {
    const fetchMock = createFetchMock();
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          intake_id: "intake-2",
          mode: "custom_triage",
          status: "pending_submission",
          invite_expires_at: "2026-03-21T18:00:00Z",
          practice_name: "Clinica Aurora",
          invite_message: "Bem-vindo",
          requires_custom_triage: true,
          custom_questions: [{ question_id: "q1", prompt: "Pergunta", required: true }],
          complement_request_note: null,
        }),
    } as Response);

    const client = createTriageApiClient({
      baseUrl: "http://localhost:8000",
      fetchImpl: fetchMock,
    });

    const intake = await client.getPublicIntake("token-publico");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/intake-links/token-publico",
      expect.objectContaining({
        method: "GET",
      }),
    );
    expect(intake.requiresCustomTriage).toBe(true);
    expect(intake.customQuestions[0].questionId).toBe("q1");
  });

  it("throws typed error for rejected triage request", async () => {
    const fetchMock = createFetchMock();
    fetchMock.mockResolvedValue({
      ok: false,
      status: 410,
      text: async () => JSON.stringify({ detail: "Link de convite expirado." }),
    } as Response);

    const client = createTriageApiClient({
      baseUrl: "http://localhost:8000",
      fetchImpl: fetchMock,
    });

    await expect(client.getPublicIntake("token-expirado")).rejects.toEqual(
      new TriageApiError("Link de convite expirado.", 410),
    );
  });
});
