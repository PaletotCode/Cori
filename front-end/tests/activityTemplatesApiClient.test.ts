import {
  ActivityTemplatesApiError,
  createActivityTemplatesApiClient,
} from "../src/features/activities/api/activityTemplatesApiClient";

type FetchMock = jest.MockedFunction<typeof fetch>;

function createFetchMock(): FetchMock {
  return jest.fn() as unknown as FetchMock;
}

describe("activity templates api client", () => {
  it("lists templates and maps payload", async () => {
    const fetchMock = createFetchMock();
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify([
          {
            id: "tpl-1",
            tenant_id: "tenant-1",
            psychologist_id: "psy-1",
            title: "Rotina respiratoria",
            description: "Checklist matinal",
            instructions: "Respirar por 5 minutos",
            document_url: null,
            configuration: { intensity: "low" },
            activity_type: "simple_task",
            created_at: "2026-03-18T10:00:00Z",
            updated_at: "2026-03-18T10:00:00Z",
            archived_at: null,
          },
        ]),
    } as Response);

    const client = createActivityTemplatesApiClient({
      baseUrl: "http://localhost:8000",
      fetchImpl: fetchMock,
    });

    const result = await client.listTemplates("access-token", { limit: 40 });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/activity-templates?limit=40",
      expect.objectContaining({ method: "GET" }),
    );
    expect(result[0].title).toBe("Rotina respiratoria");
    expect(result[0].activityType).toBe("simple_task");
  });

  it("assigns template with idempotency key", async () => {
    const fetchMock = createFetchMock();
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          idempotency_replayed: false,
          activity: {
            id: "activity-1",
            tenant_id: "tenant-1",
            patient_id: "patient-1",
            patient_name: "Paciente Agenda",
            psychologist_id: "psy-1",
            source_template_id: "tpl-1",
            activity_type: "simple_task",
            status: "assigned",
            title: "Rotina respiratoria",
            description: "Checklist matinal",
            instructions: "Respirar por 5 minutos",
            document_url: null,
            configuration: {},
            due_at: "2026-03-21T10:00:00Z",
            scheduled_send_at: null,
            assigned_at: "2026-03-18T10:01:00Z",
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
            updated_at: "2026-03-18T10:01:00Z",
          },
        }),
    } as Response);

    const client = createActivityTemplatesApiClient({
      baseUrl: "http://localhost:8000",
      fetchImpl: fetchMock,
    });

    const result = await client.assignTemplate(
      "access-token",
      "tpl-1",
      {
        patientId: "patient-1",
        sendMode: "immediate",
        dueAt: "2026-03-21T10:00:00Z",
      },
      "idem-key-123456",
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/activity-templates/tpl-1/assign",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer access-token",
          "Idempotency-Key": "idem-key-123456",
        }),
      }),
    );
    expect(result.idempotencyReplayed).toBe(false);
    expect(result.activity.sourceTemplateId).toBe("tpl-1");
  });

  it("throws typed error when assign fails", async () => {
    const fetchMock = createFetchMock();
    fetchMock.mockResolvedValue({
      ok: false,
      status: 422,
      text: async () => JSON.stringify({ detail: "Envio agendado exige scheduled_send_at." }),
    } as Response);

    const client = createActivityTemplatesApiClient({
      baseUrl: "http://localhost:8000",
      fetchImpl: fetchMock,
    });

    await expect(
      client.assignTemplate(
        "access-token",
        "tpl-1",
        {
          patientId: "patient-1",
          sendMode: "scheduled",
          dueAt: "2026-03-21T10:00:00Z",
        },
        "idem-key-123456",
      ),
    ).rejects.toEqual(new ActivityTemplatesApiError("Envio agendado exige scheduled_send_at.", 422));
  });
});
