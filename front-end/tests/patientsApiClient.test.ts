import {
  createPatientsApiClient,
  PatientsApiError,
} from "../src/features/patients/api/patientsApiClient";

type FetchMock = jest.MockedFunction<typeof fetch>;

function createFetchMock(): FetchMock {
  return jest.fn() as unknown as FetchMock;
}

describe("patients api client", () => {
  it("lists patients with filters and maps response", async () => {
    const fetchMock = createFetchMock();
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify([
          {
            id: "patient-1",
            full_name: "Paciente Aurora",
            preferred_name: "Aurora",
            email: "aurora@cori.dev",
            phone: "+5565999990001",
            preferred_contact_channel: "whatsapp",
            profile_source: "manual",
            whatsapp_number_valid: true,
            updated_at: "2026-03-17T20:00:00Z",
          },
        ]),
    } as Response);

    const client = createPatientsApiClient({
      baseUrl: "http://localhost:8000",
      fetchImpl: fetchMock,
    });

    const result = await client.list("access-token", {
      search: "Aurora",
      preferredContactChannel: "whatsapp",
      hasWhatsapp: true,
      sortBy: "full_name",
      sortOrder: "asc",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/patients?search=Aurora&preferred_contact_channel=whatsapp&has_whatsapp=true&sort_by=full_name&sort_order=asc",
      expect.objectContaining({
        method: "GET",
      }),
    );
    expect(result[0].fullName).toBe("Paciente Aurora");
    expect(result[0].whatsappNumberValid).toBe(true);
  });

  it("updates patient with overwrite payload mapping", async () => {
    const fetchMock = createFetchMock();
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          id: "patient-2",
          tenant_id: "tenant-1",
          full_name: "Paciente Atualizada",
          preferred_name: null,
          email: "atualizada@cori.dev",
          phone: "+5565988887777",
          birth_date: "1990-01-01",
          pronouns: null,
          emergency_contact_name: null,
          emergency_contact_phone: null,
          preferred_contact_channel: "email",
          preferred_contact_period: "morning",
          communication_notes: null,
          profile_source: "manual",
          whatsapp_number_valid: true,
          created_at: "2026-03-17T18:00:00Z",
          updated_at: "2026-03-17T21:00:00Z",
        }),
    } as Response);

    const client = createPatientsApiClient({
      baseUrl: "http://localhost:8000",
      fetchImpl: fetchMock,
    });

    const result = await client.update("access-token", "patient-2", {
      fullName: "Paciente Atualizada",
      email: "atualizada@cori.dev",
      phone: "+55 65 98888-7777",
      preferredContactChannel: "email",
      preferredContactPeriod: "morning",
      overwriteInitialRegistration: true,
      overwriteReason: "Dados anteriores desatualizados.",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/patients/patient-2",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({
          full_name: "Paciente Atualizada",
          email: "atualizada@cori.dev",
          phone: "+55 65 98888-7777",
          preferred_contact_channel: "email",
          preferred_contact_period: "morning",
          overwrite_initial_registration: true,
          overwrite_reason: "Dados anteriores desatualizados.",
        }),
      }),
    );
    expect(result.profileSource).toBe("manual");
  });

  it("throws typed error for API failures", async () => {
    const fetchMock = createFetchMock();
    fetchMock.mockResolvedValue({
      ok: false,
      status: 422,
      text: async () => JSON.stringify({ detail: "Sobrescrita exige justificativa." }),
    } as Response);

    const client = createPatientsApiClient({
      baseUrl: "http://localhost:8000",
      fetchImpl: fetchMock,
    });

    await expect(
      client.update("access-token", "patient-3", {
        fullName: "Paciente",
        overwriteInitialRegistration: true,
      }),
    ).rejects.toEqual(new PatientsApiError("Sobrescrita exige justificativa.", 422));
  });
});
