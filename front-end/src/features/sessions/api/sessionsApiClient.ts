import { getApiBaseUrl } from "../../../shared/config/env";
import type {
  AgendaView,
  PublicSessionConfirmResult,
  PublicSessionList,
  SessionActionPayload,
  SessionAgendaItem,
  SessionCreatePayload,
  SessionCreateResult,
  SessionDetail,
  SessionReminderRunResult,
  SessionTimelineEvent,
  SessionsApiErrorPayload,
} from "./types";

export class SessionsApiError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "SessionsApiError";
    this.statusCode = statusCode;
  }
}

interface SessionAgendaItemResponseBody {
  id: string;
  patient_id: string;
  patient_name: string;
  psychologist_id: string;
  status: "scheduled" | "confirmed" | "rescheduled" | "canceled" | "completed";
  location_mode: "online" | "presential" | "hybrid";
  scheduled_start_at: string;
  scheduled_end_at: string;
  confirmation_token_expires_at: string;
}

interface SessionDetailResponseBody extends SessionAgendaItemResponseBody {
  tenant_id: string;
  meeting_link: string | null;
  notes: string | null;
  cancellation_reason: string | null;
  canceled_at: string | null;
  confirmed_at: string | null;
  confirmed_by: string | null;
  rescheduled_at: string | null;
  created_at: string;
  updated_at: string;
}

interface SessionCreateRequestBody {
  patient_id: string;
  scheduled_start_at: string;
  scheduled_end_at: string;
  location_mode?: "online" | "presential" | "hybrid";
  meeting_link?: string;
  notes?: string;
}

interface SessionCreateResponseBody extends SessionDetailResponseBody {
  confirmation_token: string;
  confirmation_link: string;
}

interface SessionActionRequestBody {
  action: "confirm" | "reschedule" | "cancel" | "complete";
  scheduled_start_at?: string;
  scheduled_end_at?: string;
  reason?: string;
}

interface SessionTimelineEventResponseBody {
  id: string;
  intake_id: string | null;
  patient_id: string | null;
  event_type: string;
  actor_type: string;
  actor_id: string | null;
  payload: Record<string, unknown>;
  created_at: string;
}

interface PublicSessionListResponseBody {
  patient_id: string;
  patient_name: string;
  sessions: SessionAgendaItemResponseBody[];
}

interface PublicSessionConfirmResponseBody {
  session_id: string;
  status: "scheduled" | "confirmed" | "rescheduled" | "canceled" | "completed";
  confirmed_at: string | null;
}

interface SessionReminderRunResponseBody {
  processed: number;
  sent: number;
  failed: number;
}

export interface SessionsApiClient {
  createSession: (accessToken: string, payload: SessionCreatePayload) => Promise<SessionCreateResult>;
  listAgenda: (
    accessToken: string,
    options?: { view?: AgendaView; referenceDate?: string },
  ) => Promise<SessionAgendaItem[]>;
  getSession: (accessToken: string, sessionId: string) => Promise<SessionDetail>;
  applySessionAction: (
    accessToken: string,
    sessionId: string,
    payload: SessionActionPayload,
  ) => Promise<SessionDetail>;
  listSessionTimelineEvents: (
    accessToken: string,
    sessionId: string,
    limit?: number,
  ) => Promise<SessionTimelineEvent[]>;
  listPublicSessions: (confirmationToken: string) => Promise<PublicSessionList>;
  confirmPublicSession: (
    confirmationToken: string,
    sessionId: string,
  ) => Promise<PublicSessionConfirmResult>;
  runSessionReminderJob: (accessToken: string) => Promise<SessionReminderRunResult>;
}

interface CreateSessionsApiClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

async function requestJson<TResponse>(
  fetchImpl: typeof fetch,
  baseUrl: string,
  path: string,
  init: RequestInit,
): Promise<TResponse> {
  const response = await fetchImpl(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  const rawBody = await response.text();
  const parsedBody = rawBody.length > 0 ? (JSON.parse(rawBody) as unknown) : null;

  if (!response.ok) {
    const payload = (parsedBody ?? {}) as SessionsApiErrorPayload;
    throw new SessionsApiError(payload.detail ?? "Falha na requisicao de sessoes.", response.status);
  }

  return parsedBody as TResponse;
}

function mapAgendaItem(payload: SessionAgendaItemResponseBody): SessionAgendaItem {
  return {
    id: payload.id,
    patientId: payload.patient_id,
    patientName: payload.patient_name,
    psychologistId: payload.psychologist_id,
    status: payload.status,
    locationMode: payload.location_mode,
    scheduledStartAt: payload.scheduled_start_at,
    scheduledEndAt: payload.scheduled_end_at,
    confirmationTokenExpiresAt: payload.confirmation_token_expires_at,
  };
}

function mapSessionDetail(payload: SessionDetailResponseBody): SessionDetail {
  return {
    ...mapAgendaItem(payload),
    tenantId: payload.tenant_id,
    meetingLink: payload.meeting_link,
    notes: payload.notes,
    cancellationReason: payload.cancellation_reason,
    canceledAt: payload.canceled_at,
    confirmedAt: payload.confirmed_at,
    confirmedBy: payload.confirmed_by,
    rescheduledAt: payload.rescheduled_at,
    createdAt: payload.created_at,
    updatedAt: payload.updated_at,
  };
}

function mapCreatePayload(payload: SessionCreatePayload): SessionCreateRequestBody {
  const body: SessionCreateRequestBody = {
    patient_id: payload.patientId,
    scheduled_start_at: payload.scheduledStartAt,
    scheduled_end_at: payload.scheduledEndAt,
  };
  if (payload.locationMode !== undefined) body.location_mode = payload.locationMode;
  if (payload.meetingLink !== undefined) body.meeting_link = payload.meetingLink;
  if (payload.notes !== undefined) body.notes = payload.notes;
  return body;
}

function mapActionPayload(payload: SessionActionPayload): SessionActionRequestBody {
  const body: SessionActionRequestBody = {
    action: payload.action,
  };
  if (payload.scheduledStartAt !== undefined) body.scheduled_start_at = payload.scheduledStartAt;
  if (payload.scheduledEndAt !== undefined) body.scheduled_end_at = payload.scheduledEndAt;
  if (payload.reason !== undefined) body.reason = payload.reason;
  return body;
}

function mapTimelineEvent(payload: SessionTimelineEventResponseBody): SessionTimelineEvent {
  return {
    id: payload.id,
    eventType: payload.event_type,
    actorType: payload.actor_type,
    actorId: payload.actor_id,
    payload: payload.payload,
    createdAt: payload.created_at,
  };
}

function buildAgendaPath(options?: { view?: AgendaView; referenceDate?: string }): string {
  const params = new URLSearchParams();
  if (options?.view !== undefined) {
    params.set("view", options.view);
  }
  if (options?.referenceDate !== undefined && options.referenceDate.length > 0) {
    params.set("reference_date", options.referenceDate);
  }
  const query = params.toString();
  return query.length > 0 ? `/agenda?${query}` : "/agenda";
}

export function createSessionsApiClient(options: CreateSessionsApiClientOptions = {}): SessionsApiClient {
  const baseUrl = (options.baseUrl ?? getApiBaseUrl()).replace(/\/$/, "");
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    async createSession(accessToken: string, payload: SessionCreatePayload): Promise<SessionCreateResult> {
      const response = await requestJson<SessionCreateResponseBody>(fetchImpl, baseUrl, "/sessions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(mapCreatePayload(payload)),
      });

      return {
        ...mapSessionDetail(response),
        confirmationToken: response.confirmation_token,
        confirmationLink: response.confirmation_link,
      };
    },

    async listAgenda(
      accessToken: string,
      options?: { view?: AgendaView; referenceDate?: string },
    ): Promise<SessionAgendaItem[]> {
      const path = buildAgendaPath(options);
      const response = await requestJson<SessionAgendaItemResponseBody[]>(fetchImpl, baseUrl, path, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      return response.map(mapAgendaItem);
    },

    async getSession(accessToken: string, sessionId: string): Promise<SessionDetail> {
      const response = await requestJson<SessionDetailResponseBody>(
        fetchImpl,
        baseUrl,
        `/sessions/${sessionId}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );
      return mapSessionDetail(response);
    },

    async applySessionAction(
      accessToken: string,
      sessionId: string,
      payload: SessionActionPayload,
    ): Promise<SessionDetail> {
      const response = await requestJson<SessionDetailResponseBody>(
        fetchImpl,
        baseUrl,
        `/sessions/${sessionId}/actions`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(mapActionPayload(payload)),
        },
      );
      return mapSessionDetail(response);
    },

    async listSessionTimelineEvents(
      accessToken: string,
      sessionId: string,
      limit = 120,
    ): Promise<SessionTimelineEvent[]> {
      const response = await requestJson<SessionTimelineEventResponseBody[]>(
        fetchImpl,
        baseUrl,
        `/sessions/${sessionId}/timeline-events?limit=${limit}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );
      return response.map(mapTimelineEvent);
    },

    async listPublicSessions(confirmationToken: string): Promise<PublicSessionList> {
      const response = await requestJson<PublicSessionListResponseBody>(
        fetchImpl,
        baseUrl,
        `/session-links/${confirmationToken}/sessions`,
        {
          method: "GET",
        },
      );
      return {
        patientId: response.patient_id,
        patientName: response.patient_name,
        sessions: response.sessions.map(mapAgendaItem),
      };
    },

    async confirmPublicSession(
      confirmationToken: string,
      sessionId: string,
    ): Promise<PublicSessionConfirmResult> {
      const response = await requestJson<PublicSessionConfirmResponseBody>(
        fetchImpl,
        baseUrl,
        `/session-links/${confirmationToken}/sessions/${sessionId}/confirm`,
        {
          method: "POST",
        },
      );
      return {
        sessionId: response.session_id,
        status: response.status,
        confirmedAt: response.confirmed_at,
      };
    },

    async runSessionReminderJob(accessToken: string): Promise<SessionReminderRunResult> {
      const response = await requestJson<SessionReminderRunResponseBody>(
        fetchImpl,
        baseUrl,
        "/scheduler/session-reminders/run",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );
      return {
        processed: response.processed,
        sent: response.sent,
        failed: response.failed,
      };
    },
  };
}
