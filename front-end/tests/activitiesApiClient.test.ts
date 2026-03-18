import {
  ActivitiesApiError,
  createActivitiesApiClient,
} from "../src/features/activities/api/activitiesApiClient";

type FetchMock = jest.MockedFunction<typeof fetch>;

function createFetchMock(): FetchMock {
  return jest.fn() as unknown as FetchMock;
}

describe("activities api client", () => {
  it("creates activity with mapped payload", async () => {
    const fetchMock = createFetchMock();
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          id: "activity-1",
          tenant_id: "tenant-1",
          patient_id: "patient-1",
          patient_name: "Paciente Ativo",
          psychologist_id: "psy-1",
          activity_type: "simple_task",
          status: "assigned",
          title: "Diario de humor",
          description: "Escrever sobre o dia.",
          instructions: "Responder no final do dia.",
          document_url: null,
          configuration: {},
          due_at: "2026-03-20T14:00:00Z",
          assigned_at: "2026-03-18T10:00:00Z",
          overdue_at: null,
          recurrence_rule: "none",
          recurrence_interval: 1,
          recurrence_end_at: null,
          execution_elapsed_seconds: 0,
          opened_at: null,
          started_at: null,
          paused_at: null,
          completed_at: null,
          canceled_at: null,
          feedback_note: null,
          created_at: "2026-03-18T10:00:00Z",
          updated_at: "2026-03-18T10:00:00Z",
          patient_access_token: "token-publico-123",
          patient_access_link: "http://localhost:8081/paciente/atividades?token=token-publico-123",
        }),
    } as Response);

    const client = createActivitiesApiClient({
      baseUrl: "http://localhost:8000",
      fetchImpl: fetchMock,
    });

    const result = await client.createActivity("access-token", {
      patientId: "patient-1",
      activityType: "simple_task",
      title: "Diario de humor",
      dueAt: "2026-03-20T14:00:00Z",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/activities",
      expect.objectContaining({ method: "POST" }),
    );
    expect(result.patientName).toBe("Paciente Ativo");
    expect(result.patientAccessToken).toBe("token-publico-123");
  });

  it("applies public action and maps response", async () => {
    const fetchMock = createFetchMock();
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          activity: {
            id: "activity-1",
            tenant_id: "tenant-1",
            patient_id: "patient-1",
            patient_name: "Paciente Ativo",
            psychologist_id: "psy-1",
            activity_type: "habit",
            status: "completed",
            title: "Beber agua",
            description: null,
            instructions: null,
            document_url: null,
            configuration: {},
            due_at: "2026-03-20T14:00:00Z",
            assigned_at: "2026-03-18T10:00:00Z",
            overdue_at: null,
            recurrence_rule: "daily",
            recurrence_interval: 1,
            recurrence_end_at: null,
            execution_elapsed_seconds: 42,
            opened_at: "2026-03-18T11:00:00Z",
            started_at: "2026-03-18T11:05:00Z",
            paused_at: null,
            completed_at: "2026-03-18T11:10:00Z",
            canceled_at: null,
            feedback_note: "Concluido com facilidade.",
            created_at: "2026-03-18T10:00:00Z",
            updated_at: "2026-03-18T11:10:00Z",
          },
        }),
    } as Response);

    const client = createActivitiesApiClient({
      baseUrl: "http://localhost:8000",
      fetchImpl: fetchMock,
    });

    const result = await client.applyPublicAction("token-abc", "activity-1", {
      action: "complete",
      feedbackNote: "Concluido com facilidade.",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/activity-links/token-abc/activities/activity-1/actions",
      expect.objectContaining({ method: "POST" }),
    );
    expect(result.activity.status).toBe("completed");
    expect(result.activity.executionElapsedSeconds).toBe(42);
  });

  it("throws typed error when backend rejects transition", async () => {
    const fetchMock = createFetchMock();
    fetchMock.mockResolvedValue({
      ok: false,
      status: 409,
      text: async () =>
        JSON.stringify({ detail: "Atividade so pode ser pausada quando em execucao." }),
    } as Response);

    const client = createActivitiesApiClient({
      baseUrl: "http://localhost:8000",
      fetchImpl: fetchMock,
    });

    await expect(
      client.applyPublicAction("token-abc", "activity-1", { action: "pause" }),
    ).rejects.toEqual(new ActivitiesApiError("Atividade so pode ser pausada quando em execucao.", 409));
  });
});
