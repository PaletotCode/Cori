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
          access_code: "COR1234-0001-99",
          access_code_expires_at: "2026-03-20T18:00:00Z",
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
    expect(result.accessCode).toBe("COR1234-0001-99");
  });

  it("loads triage queue with auth header and mapped payload", async () => {
    const fetchMock = createFetchMock();
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify([
          {
            intake_id: "intake-2",
            mode: "custom_triage",
            status: "submitted",
            invite_expires_at: "2026-03-21T18:00:00Z",
            access_code_expires_at: "2026-03-21T18:00:00Z",
            opened_at: "2026-03-20T12:00:00Z",
            submitted_at: "2026-03-20T12:30:00Z",
            patient_full_name: "Paciente Teste",
            patient_email: "paciente@cori.dev",
            patient_phone: null,
            complement_request_note: null,
            activated_patient_id: null,
            has_triage_answers: true,
          },
        ]),
    } as Response);

    const client = createTriageApiClient({
      baseUrl: "http://localhost:8000",
      fetchImpl: fetchMock,
    });

    const queue = await client.getQueue("access-token", ["submitted"]);

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/intakes/queue?statuses=submitted",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Authorization: "Bearer access-token",
        }),
      }),
    );
    expect(queue[0].intakeId).toBe("intake-2");
    expect(queue[0].hasTriageAnswers).toBe(true);
    expect(queue[0].accessCodeExpiresAt).toBe("2026-03-21T18:00:00Z");
  });

  it("rotates access code for an intake and maps response", async () => {
    const fetchMock = createFetchMock();
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          intake_id: "intake-2",
          access_code: "COR9988-1031-88",
          access_code_expires_at: "2026-03-22T18:00:00Z",
        }),
    } as Response);

    const client = createTriageApiClient({
      baseUrl: "http://localhost:8000",
      fetchImpl: fetchMock,
    });

    const rotated = await client.rotateAccessCode("access-token", "intake-2", {
      alias: "CORI",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/intakes/intake-2/access-code/rotate",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ alias: "CORI" }),
      }),
    );
    expect(rotated.accessCode).toBe("COR9988-1031-88");
  });

  it("throws typed error for rejected triage request", async () => {
    const fetchMock = createFetchMock();
    fetchMock.mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => JSON.stringify({ detail: "Acesso de triagem negado." }),
    } as Response);

    const client = createTriageApiClient({
      baseUrl: "http://localhost:8000",
      fetchImpl: fetchMock,
    });

    await expect(client.getQueue("access-token")).rejects.toEqual(
      new TriageApiError("Acesso de triagem negado.", 403),
    );
  });

  it("normalizes structured triage errors into readable message", async () => {
    const fetchMock = createFetchMock();
    fetchMock.mockResolvedValue({
      ok: false,
      status: 422,
      text: async () =>
        JSON.stringify({
          detail: [
            {
              msg: "String should have at least 3 characters",
              loc: ["body", "patient_full_name"],
            },
          ],
        }),
    } as Response);

    const client = createTriageApiClient({
      baseUrl: "http://localhost:8000",
      fetchImpl: fetchMock,
    });

    await expect(
      client.submitPatientIntake("patient-access-token", {
        patientFullName: "A",
        consentTermsAccepted: true,
        consentPrivacyAccepted: true,
      }),
    ).rejects.toEqual(
      new TriageApiError("String should have at least 3 characters (body.patient_full_name)", 422),
    );
  });

  it("loads authenticated patient intake and maps full detail payload", async () => {
    const fetchMock = createFetchMock();
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          intake_id: "intake-patient-1",
          mode: "simple_invite",
          status: "pending_submission",
          invite_expires_at: "2026-03-25T10:00:00Z",
          access_code_expires_at: "2026-03-25T10:00:00Z",
          opened_at: "2026-03-22T12:00:00Z",
          submitted_at: null,
          reviewed_at: null,
          activated_at: null,
          patient_full_name: "Paciente Cori",
          patient_preferred_name: "Cori",
          patient_email: "paciente@cori.dev",
          patient_phone: "+5565999991111",
          patient_birth_date: "1994-04-12",
          patient_pronouns: "ela/dela",
          patient_emergency_contact_name: "Contato Cori",
          patient_emergency_contact_phone: "+5565999992222",
          patient_communication_notes: "Prefere mensagem de texto.",
          patient_profile_photo_url: "https://cdn.cori.dev/patient-photo.jpg",
          patient_profile_banner_url: "https://cdn.cori.dev/patient-banner.jpg",
          custom_questions: [],
          triage_answers: null,
          review_note: null,
          complement_request_note: null,
          activated_patient_id: null,
        }),
    } as Response);

    const client = createTriageApiClient({
      baseUrl: "http://localhost:8000",
      fetchImpl: fetchMock,
    });

    const detail = await client.getPatientIntake("patient-access-token");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/intakes/patient/me",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Authorization: "Bearer patient-access-token",
        }),
      }),
    );
    expect(detail.patientPreferredName).toBe("Cori");
    expect(detail.patientProfileBannerUrl).toBe("https://cdn.cori.dev/patient-banner.jpg");
  });

  it("submits authenticated patient intake with mapped payload", async () => {
    const fetchMock = createFetchMock();
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          intake_id: "intake-patient-2",
          status: "submitted",
          submitted_at: "2026-03-22T15:00:00Z",
        }),
    } as Response);

    const client = createTriageApiClient({
      baseUrl: "http://localhost:8000",
      fetchImpl: fetchMock,
    });

    const result = await client.submitPatientIntake("patient-access-token", {
      patientFullName: "Paciente Cori",
      patientPreferredName: "Cori",
      patientEmail: "paciente@cori.dev",
      patientPhone: "+5565999991111",
      patientBirthDate: "1994-04-12",
      patientPronouns: "ela/dela",
      patientEmergencyContactName: "Contato Cori",
      patientEmergencyContactPhone: "+5565999992222",
      patientCommunicationNotes: "Prefere mensagem de texto.",
      patientProfilePhotoUrl: "https://cdn.cori.dev/patient-photo.jpg",
      patientProfileBannerUrl: "https://cdn.cori.dev/patient-banner.jpg",
      consentTermsAccepted: true,
      consentPrivacyAccepted: true,
    });

    const [url, requestInit] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:8000/intakes/patient/me/submit");
    expect(requestInit?.method).toBe("POST");
    expect(JSON.parse(String(requestInit?.body))).toEqual({
      patient_full_name: "Paciente Cori",
      patient_preferred_name: "Cori",
      patient_email: "paciente@cori.dev",
      patient_phone: "+5565999991111",
      patient_birth_date: "1994-04-12",
      patient_pronouns: "ela/dela",
      patient_emergency_contact_name: "Contato Cori",
      patient_emergency_contact_phone: "+5565999992222",
      patient_communication_notes: "Prefere mensagem de texto.",
      patient_profile_photo_url: "https://cdn.cori.dev/patient-photo.jpg",
      patient_profile_banner_url: "https://cdn.cori.dev/patient-banner.jpg",
      consent_terms_accepted: true,
      consent_privacy_accepted: true,
    });
    expect(result.status).toBe("submitted");
  });
});
