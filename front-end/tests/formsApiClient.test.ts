import {
  createFormsApiClient,
  FormsApiError,
} from "../src/features/forms/api/formsApiClient";

type FetchMock = jest.MockedFunction<typeof fetch>;

function createFetchMock(): FetchMock {
  return jest.fn() as unknown as FetchMock;
}

describe("forms api client", () => {
  it("lists forms and maps response", async () => {
    const fetchMock = createFetchMock();
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify([
          {
            id: "form-1",
            patient_id: "patient-1",
            patient_name: "Paciente Form",
            psychologist_id: "psy-1",
            status: "assigned",
            title: "Check-in",
            subtitle: null,
            published_at: "2026-03-18T10:00:00Z",
            scheduled_send_at: null,
            assigned_at: "2026-03-18T10:01:00Z",
            submitted_at: null,
            reviewed_at: null,
          },
        ]),
    } as Response);

    const client = createFormsApiClient({
      baseUrl: "http://localhost:8000",
      fetchImpl: fetchMock,
    });

    const forms = await client.listForms("access-token", {
      statusFilter: "assigned",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/forms?status_filter=assigned",
      expect.objectContaining({ method: "GET" }),
    );
    expect(forms[0].patientName).toBe("Paciente Form");
    expect(forms[0].status).toBe("assigned");
  });

  it("applies public partial save action", async () => {
    const fetchMock = createFetchMock();
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          form: {
            id: "form-1",
            patient_id: "patient-1",
            patient_name: "Paciente Form",
            psychologist_id: "psy-1",
            status: "partial_saved",
            title: "Check-in",
            subtitle: null,
            published_at: "2026-03-18T10:00:00Z",
            scheduled_send_at: null,
            assigned_at: "2026-03-18T10:01:00Z",
            submitted_at: null,
            reviewed_at: null,
            tenant_id: "tenant-1",
            header: null,
            sections: [],
            response_data: { q1: "ok" },
            opened_at: null,
            partial_saved_at: "2026-03-18T10:10:00Z",
            reviewed_by_user_id: null,
            review_note: null,
            created_at: "2026-03-18T10:00:00Z",
            updated_at: "2026-03-18T10:10:00Z",
          },
        }),
    } as Response);

    const client = createFormsApiClient({
      baseUrl: "http://localhost:8000",
      fetchImpl: fetchMock,
    });

    const result = await client.applyPublicAction("token-abc", "form-1", {
      action: "partial_save",
      answers: { q1: "ok" },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/form-links/token-abc/forms/form-1/actions",
      expect.objectContaining({ method: "POST" }),
    );
    expect(result.form.status).toBe("partial_saved");
  });

  it("throws typed error on invalid submit payload", async () => {
    const fetchMock = createFetchMock();
    fetchMock.mockResolvedValue({
      ok: false,
      status: 422,
      text: async () => JSON.stringify({ detail: "Acao exige answers no payload." }),
    } as Response);

    const client = createFormsApiClient({
      baseUrl: "http://localhost:8000",
      fetchImpl: fetchMock,
    });

    await expect(
      client.applyPublicAction("token-abc", "form-1", { action: "submit" }),
    ).rejects.toEqual(new FormsApiError("Acao exige answers no payload.", 422));
  });
});
