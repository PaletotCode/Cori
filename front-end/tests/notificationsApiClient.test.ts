import {
  createNotificationsApiClient,
  NotificationsApiError,
} from "../src/features/notifications/api/notificationsApiClient";

type FetchMock = jest.MockedFunction<typeof fetch>;

function createFetchMock(): FetchMock {
  return jest.fn() as unknown as FetchMock;
}

describe("notifications api client", () => {
  it("lists unified timeline with category filters", async () => {
    const fetchMock = createFetchMock();
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify([
          {
            id: "event-1",
            category: "activities",
            event_type: "assigned",
            actor_type: "psychologist",
            actor_id: "user-1",
            session_id: null,
            activity_id: "activity-1",
            form_id: null,
            notification_delivery_id: null,
            payload: {},
            created_at: "2026-03-18T12:00:00Z",
          },
        ]),
    } as Response);

    const client = createNotificationsApiClient({
      baseUrl: "http://localhost:8000",
      fetchImpl: fetchMock,
    });

    const timeline = await client.listUnifiedTimeline("access-token", "patient-1", {
      categories: ["activities", "notifications"],
      limit: 120,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/patients/patient-1/timeline-unified?categories=activities%2Cnotifications&limit=120",
      expect.objectContaining({ method: "GET" }),
    );
    expect(timeline[0].category).toBe("activities");
    expect(timeline[0].eventType).toBe("assigned");
  });

  it("loads public inbox and applies open action", async () => {
    const fetchMock = createFetchMock();
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            patient_id: "patient-1",
            patient_name: "Paciente Inbox",
            notifications: [
              {
                id: "delivery-1",
                tenant_id: "tenant-1",
                patient_id: "patient-1",
                event_type: "activity_assigned",
                category: "activities",
                title: "Nova atividade",
                body: "Atividade atribuida.",
                status: "delivered",
                status_reason: null,
                channel_inbox: true,
                channel_push: true,
                channel_realtime: true,
                metadata: {},
                queued_at: "2026-03-18T12:00:00Z",
                sent_at: "2026-03-18T12:00:01Z",
                delivered_at: "2026-03-18T12:00:02Z",
                opened_at: null,
                action_taken_at: null,
                failed_at: null,
                created_at: "2026-03-18T12:00:00Z",
                updated_at: "2026-03-18T12:00:02Z",
              },
            ],
          }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            id: "delivery-1",
            tenant_id: "tenant-1",
            patient_id: "patient-1",
            event_type: "activity_assigned",
            category: "activities",
            title: "Nova atividade",
            body: "Atividade atribuida.",
            status: "opened",
            status_reason: null,
            channel_inbox: true,
            channel_push: true,
            channel_realtime: true,
            metadata: {},
            queued_at: "2026-03-18T12:00:00Z",
            sent_at: "2026-03-18T12:00:01Z",
            delivered_at: "2026-03-18T12:00:02Z",
            opened_at: "2026-03-18T12:05:00Z",
            action_taken_at: null,
            failed_at: null,
            created_at: "2026-03-18T12:00:00Z",
            updated_at: "2026-03-18T12:05:00Z",
          }),
      } as Response);

    const client = createNotificationsApiClient({
      baseUrl: "http://localhost:8000",
      fetchImpl: fetchMock,
    });

    const inbox = await client.listPublicInbox("token-publico-1234567890", 100);
    expect(inbox.patientName).toBe("Paciente Inbox");
    expect(inbox.notifications[0].status).toBe("delivered");

    const opened = await client.applyPublicInboxAction(
      "token-publico-1234567890",
      "delivery-1",
      "open",
    );
    expect(opened.status).toBe("opened");
  });

  it("throws typed error on invalid preference payload", async () => {
    const fetchMock = createFetchMock();
    fetchMock.mockResolvedValue({
      ok: false,
      status: 422,
      text: async () => JSON.stringify({ detail: "Frequencia maxima por hora invalida." }),
    } as Response);

    const client = createNotificationsApiClient({
      baseUrl: "http://localhost:8000",
      fetchImpl: fetchMock,
    });

    await expect(
      client.updatePublicPreferences("token-abc", {
        eventCategory: "all",
        enabled: true,
        inboxEnabled: true,
        pushEnabled: true,
        realtimeEnabled: true,
        quietHoursStart: null,
        quietHoursEnd: null,
        maxNotificationsPerHour: 0,
      }),
    ).rejects.toEqual(new NotificationsApiError("Frequencia maxima por hora invalida.", 422));
  });
});

