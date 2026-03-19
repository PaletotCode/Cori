import {
  createFormTemplatesApiClient,
  FormTemplatesApiError,
} from "../src/features/forms/api/formTemplatesApiClient";

type FetchMock = jest.MockedFunction<typeof fetch>;

function createFetchMock(): FetchMock {
  return jest.fn() as unknown as FetchMock;
}

describe("form templates api client", () => {
  it("lists templates and maps sections", async () => {
    const fetchMock = createFetchMock();
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify([
          {
            id: "form-tpl-1",
            tenant_id: "tenant-1",
            psychologist_id: "psy-1",
            title: "Revisao semanal",
            subtitle: "Humor e energia",
            header: "Preencha com calma",
            sections: [
              {
                section_id: "s-1",
                title: "Estado atual",
                description: null,
                questions: [
                  {
                    question_id: "q-1",
                    label: "Como voce esta hoje?",
                    field_type: "short_text",
                    required: true,
                    help_text: null,
                    options: null,
                    scale_min: null,
                    scale_max: null,
                  },
                ],
              },
            ],
            created_at: "2026-03-18T10:00:00Z",
            updated_at: "2026-03-18T10:00:00Z",
            archived_at: null,
          },
        ]),
    } as Response);

    const client = createFormTemplatesApiClient({
      baseUrl: "http://localhost:8000",
      fetchImpl: fetchMock,
    });

    const result = await client.listTemplates("access-token", { limit: 25 });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/form-templates?limit=25",
      expect.objectContaining({ method: "GET" }),
    );
    expect(result[0].title).toBe("Revisao semanal");
    expect(result[0].sections[0].questions[0].fieldType).toBe("short_text");
  });

  it("assigns form template with idempotency key", async () => {
    const fetchMock = createFetchMock();
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          idempotency_replayed: false,
          form: {
            id: "form-1",
            patient_id: "patient-1",
            patient_name: "Paciente Agenda",
            psychologist_id: "psy-1",
            source_template_id: "form-tpl-1",
            status: "assigned",
            title: "Revisao semanal",
            subtitle: "Humor e energia",
            published_at: "2026-03-18T10:00:00Z",
            scheduled_send_at: null,
            assigned_at: "2026-03-18T10:01:00Z",
            submitted_at: null,
            reviewed_at: null,
            tenant_id: "tenant-1",
            header: "Preencha com calma",
            sections: [],
            response_data: null,
            opened_at: null,
            partial_saved_at: null,
            reviewed_by_user_id: null,
            review_note: null,
            created_at: "2026-03-18T10:00:00Z",
            updated_at: "2026-03-18T10:01:00Z",
          },
        }),
    } as Response);

    const client = createFormTemplatesApiClient({
      baseUrl: "http://localhost:8000",
      fetchImpl: fetchMock,
    });

    const result = await client.assignTemplate(
      "access-token",
      "form-tpl-1",
      {
        patientId: "patient-1",
        sendMode: "immediate",
      },
      "idem-form-123",
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/form-templates/form-tpl-1/assign",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer access-token",
          "Idempotency-Key": "idem-form-123",
        }),
      }),
    );
    expect(result.idempotencyReplayed).toBe(false);
    expect(result.form.sourceTemplateId).toBe("form-tpl-1");
  });

  it("throws typed error when assign fails", async () => {
    const fetchMock = createFetchMock();
    fetchMock.mockResolvedValue({
      ok: false,
      status: 422,
      text: async () => JSON.stringify({ detail: "Envio agendado exige scheduled_send_at." }),
    } as Response);

    const client = createFormTemplatesApiClient({
      baseUrl: "http://localhost:8000",
      fetchImpl: fetchMock,
    });

    await expect(
      client.assignTemplate(
        "access-token",
        "form-tpl-1",
        {
          patientId: "patient-1",
          sendMode: "scheduled",
        },
        "idem-form-123",
      ),
    ).rejects.toEqual(new FormTemplatesApiError("Envio agendado exige scheduled_send_at.", 422));
  });
});
