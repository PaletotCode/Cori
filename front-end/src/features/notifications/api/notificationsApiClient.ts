import { getApiBaseUrl } from "../../../shared/config/env";
import type {
  NotificationApiErrorPayload,
  NotificationDelivery,
  NotificationPreferences,
  NotificationPreferencesPayload,
  PatientInboxResult,
  UnifiedTimelineEvent,
} from "./types";

export class NotificationsApiError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "NotificationsApiError";
    this.statusCode = statusCode;
  }
}

interface NotificationPreferencesResponseBody {
  id: string | null;
  tenant_id: string;
  patient_id: string | null;
  event_category: "all" | "sessions" | "activities" | "forms" | "documents" | "notifications" | "app_usage";
  enabled: boolean;
  inbox_enabled: boolean;
  push_enabled: boolean;
  realtime_enabled: boolean;
  quiet_hours_start: number | null;
  quiet_hours_end: number | null;
  max_notifications_per_hour: number;
  source: "explicit" | "practice_profile_default" | "system_default";
  updated_at: string | null;
}

interface NotificationPreferencesRequestBody {
  event_category?: "all" | "sessions" | "activities" | "forms" | "documents" | "notifications" | "app_usage";
  enabled: boolean;
  inbox_enabled: boolean;
  push_enabled: boolean;
  realtime_enabled: boolean;
  quiet_hours_start: number | null;
  quiet_hours_end: number | null;
  max_notifications_per_hour: number;
}

interface NotificationDeliveryResponseBody {
  id: string;
  tenant_id: string;
  patient_id: string;
  event_type: string;
  category: "sessions" | "activities" | "forms" | "documents" | "notifications" | "app_usage";
  category_label?: string;
  title: string;
  body: string;
  status: "queued" | "sent" | "delivered" | "opened" | "action_taken" | "failed";
  status_reason: string | null;
  natural_title?: string;
  natural_event_label?: string;
  natural_detail?: string;
  channel_inbox: boolean;
  channel_push: boolean;
  channel_realtime: boolean;
  metadata: Record<string, unknown>;
  queued_at: string;
  sent_at: string | null;
  delivered_at: string | null;
  opened_at: string | null;
  action_taken_at: string | null;
  failed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface UnifiedTimelineEventResponseBody {
  id: string;
  category: "sessions" | "activities" | "forms" | "documents" | "notifications" | "app_usage";
  category_label?: string;
  event_type: string;
  actor_type: string;
  actor_label?: string;
  actor_id: string | null;
  session_id: string | null;
  activity_id: string | null;
  form_id: string | null;
  notification_delivery_id: string | null;
  payload: Record<string, unknown>;
  natural_title?: string;
  natural_event_label?: string;
  natural_detail?: string;
  created_at: string;
}

interface PatientInboxResponseBody {
  patient_id: string;
  patient_name: string;
  notifications: NotificationDeliveryResponseBody[];
}

interface NotificationInboxActionRequestBody {
  action: "open" | "action_taken";
}

interface ShareDocumentRequestBody {
  action: "shared";
  document_title: string;
  note?: string;
}

interface PublicDocumentActionRequestBody {
  action: "opened" | "acknowledged";
  note?: string;
}

interface CreateNotificationsApiClientOptions {
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
    const payload = (parsedBody ?? {}) as NotificationApiErrorPayload;
    throw new NotificationsApiError(
      payload.detail ?? "Falha na requisicao de notificacoes.",
      response.status,
    );
  }

  return parsedBody as TResponse;
}

function mapPreferences(payload: NotificationPreferencesResponseBody): NotificationPreferences {
  return {
    id: payload.id,
    tenantId: payload.tenant_id,
    patientId: payload.patient_id,
    eventCategory: payload.event_category,
    enabled: payload.enabled,
    inboxEnabled: payload.inbox_enabled,
    pushEnabled: payload.push_enabled,
    realtimeEnabled: payload.realtime_enabled,
    quietHoursStart: payload.quiet_hours_start,
    quietHoursEnd: payload.quiet_hours_end,
    maxNotificationsPerHour: payload.max_notifications_per_hour,
    source: payload.source,
    updatedAt: payload.updated_at,
  };
}

function mapPreferencesPayload(
  payload: NotificationPreferencesPayload,
): NotificationPreferencesRequestBody {
  const body: NotificationPreferencesRequestBody = {
    enabled: payload.enabled,
    inbox_enabled: payload.inboxEnabled,
    push_enabled: payload.pushEnabled,
    realtime_enabled: payload.realtimeEnabled,
    quiet_hours_start: payload.quietHoursStart,
    quiet_hours_end: payload.quietHoursEnd,
    max_notifications_per_hour: payload.maxNotificationsPerHour,
  };
  if (payload.eventCategory !== undefined) {
    body.event_category = payload.eventCategory;
  }
  return body;
}

function mapDelivery(payload: NotificationDeliveryResponseBody): NotificationDelivery {
  return {
    id: payload.id,
    tenantId: payload.tenant_id,
    patientId: payload.patient_id,
    eventType: payload.event_type,
    category: payload.category,
    categoryLabel: payload.category_label,
    title: payload.title,
    body: payload.body,
    status: payload.status,
    statusReason: payload.status_reason,
    naturalTitle: payload.natural_title,
    naturalEventLabel: payload.natural_event_label,
    naturalDetail: payload.natural_detail,
    channelInbox: payload.channel_inbox,
    channelPush: payload.channel_push,
    channelRealtime: payload.channel_realtime,
    metadata: payload.metadata,
    queuedAt: payload.queued_at,
    sentAt: payload.sent_at,
    deliveredAt: payload.delivered_at,
    openedAt: payload.opened_at,
    actionTakenAt: payload.action_taken_at,
    failedAt: payload.failed_at,
    createdAt: payload.created_at,
    updatedAt: payload.updated_at,
  };
}

function mapTimelineEvent(payload: UnifiedTimelineEventResponseBody): UnifiedTimelineEvent {
  return {
    id: payload.id,
    category: payload.category,
    categoryLabel: payload.category_label,
    eventType: payload.event_type,
    actorType: payload.actor_type,
    actorLabel: payload.actor_label,
    actorId: payload.actor_id,
    sessionId: payload.session_id,
    activityId: payload.activity_id,
    formId: payload.form_id,
    notificationDeliveryId: payload.notification_delivery_id,
    payload: payload.payload,
    naturalTitle: payload.natural_title,
    naturalEventLabel: payload.natural_event_label,
    naturalDetail: payload.natural_detail,
    createdAt: payload.created_at,
  };
}

function buildTimelinePath(
  patientId: string,
  options?: { categories?: string[]; limit?: number },
): string {
  const params = new URLSearchParams();
  if (options?.categories && options.categories.length > 0) {
    params.set("categories", options.categories.join(","));
  }
  if (options?.limit !== undefined) {
    params.set("limit", String(options.limit));
  }
  const query = params.toString();
  return query.length > 0
    ? `/patients/${patientId}/timeline-unified?${query}`
    : `/patients/${patientId}/timeline-unified`;
}

export interface NotificationsApiClient {
  listUnifiedTimeline: (
    accessToken: string,
    patientId: string,
    options?: { categories?: string[]; limit?: number },
  ) => Promise<UnifiedTimelineEvent[]>;
  listPatientNotifications: (
    accessToken: string,
    patientId: string,
    limit?: number,
  ) => Promise<NotificationDelivery[]>;
  getPatientPreferences: (accessToken: string, patientId: string) => Promise<NotificationPreferences>;
  updatePatientPreferences: (
    accessToken: string,
    patientId: string,
    payload: NotificationPreferencesPayload,
  ) => Promise<NotificationPreferences>;
  getTenantDefaultPreferences: (accessToken: string) => Promise<NotificationPreferences>;
  updateTenantDefaultPreferences: (
    accessToken: string,
    payload: NotificationPreferencesPayload,
  ) => Promise<NotificationPreferences>;
  shareDocument: (
    accessToken: string,
    patientId: string,
    documentId: string,
    payload: { documentTitle: string; note?: string },
  ) => Promise<UnifiedTimelineEvent>;
  listPublicInbox: (patientAccessToken: string, limit?: number) => Promise<PatientInboxResult>;
  applyPublicInboxAction: (
    patientAccessToken: string,
    deliveryId: string,
    action: "open" | "action_taken",
  ) => Promise<NotificationDelivery>;
  getPublicPreferences: (patientAccessToken: string) => Promise<NotificationPreferences>;
  updatePublicPreferences: (
    patientAccessToken: string,
    payload: NotificationPreferencesPayload,
  ) => Promise<NotificationPreferences>;
  applyPublicDocumentAction: (
    patientAccessToken: string,
    documentId: string,
    payload: { action: "opened" | "acknowledged"; note?: string },
  ) => Promise<UnifiedTimelineEvent>;
}

export function createNotificationsApiClient(
  options: CreateNotificationsApiClientOptions = {},
): NotificationsApiClient {
  const baseUrl = (options.baseUrl ?? getApiBaseUrl()).replace(/\/$/, "");
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    async listUnifiedTimeline(
      accessToken: string,
      patientId: string,
      options?: { categories?: string[]; limit?: number },
    ): Promise<UnifiedTimelineEvent[]> {
      const response = await requestJson<UnifiedTimelineEventResponseBody[]>(
        fetchImpl,
        baseUrl,
        buildTimelinePath(patientId, options),
        {
          method: "GET",
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );
      return response.map(mapTimelineEvent);
    },

    async listPatientNotifications(
      accessToken: string,
      patientId: string,
      limit?: number,
    ): Promise<NotificationDelivery[]> {
      const path =
        limit !== undefined
          ? `/patients/${patientId}/notifications?limit=${limit}`
          : `/patients/${patientId}/notifications`;
      const response = await requestJson<NotificationDeliveryResponseBody[]>(
        fetchImpl,
        baseUrl,
        path,
        {
          method: "GET",
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );
      return response.map(mapDelivery);
    },

    async getPatientPreferences(accessToken: string, patientId: string): Promise<NotificationPreferences> {
      const response = await requestJson<NotificationPreferencesResponseBody>(
        fetchImpl,
        baseUrl,
        `/patients/${patientId}/notification-preferences`,
        {
          method: "GET",
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );
      return mapPreferences(response);
    },

    async updatePatientPreferences(
      accessToken: string,
      patientId: string,
      payload: NotificationPreferencesPayload,
    ): Promise<NotificationPreferences> {
      const response = await requestJson<NotificationPreferencesResponseBody>(
        fetchImpl,
        baseUrl,
        `/patients/${patientId}/notification-preferences`,
        {
          method: "PUT",
          headers: { Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify(mapPreferencesPayload(payload)),
        },
      );
      return mapPreferences(response);
    },

    async getTenantDefaultPreferences(accessToken: string): Promise<NotificationPreferences> {
      const response = await requestJson<NotificationPreferencesResponseBody>(
        fetchImpl,
        baseUrl,
        "/notifications/rules/tenant-default",
        {
          method: "GET",
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );
      return mapPreferences(response);
    },

    async updateTenantDefaultPreferences(
      accessToken: string,
      payload: NotificationPreferencesPayload,
    ): Promise<NotificationPreferences> {
      const response = await requestJson<NotificationPreferencesResponseBody>(
        fetchImpl,
        baseUrl,
        "/notifications/rules/tenant-default",
        {
          method: "PUT",
          headers: { Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify(mapPreferencesPayload(payload)),
        },
      );
      return mapPreferences(response);
    },

    async shareDocument(
      accessToken: string,
      patientId: string,
      documentId: string,
      payload: { documentTitle: string; note?: string },
    ): Promise<UnifiedTimelineEvent> {
      const body: ShareDocumentRequestBody = {
        action: "shared",
        document_title: payload.documentTitle,
      };
      if (payload.note !== undefined) {
        body.note = payload.note;
      }

      const response = await requestJson<UnifiedTimelineEventResponseBody>(
        fetchImpl,
        baseUrl,
        `/patients/${patientId}/documents/${documentId}/share`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify(body),
        },
      );
      return mapTimelineEvent(response);
    },

    async listPublicInbox(patientAccessToken: string, limit?: number): Promise<PatientInboxResult> {
      const path =
        limit !== undefined
          ? `/notification-links/${patientAccessToken}/inbox?limit=${limit}`
          : `/notification-links/${patientAccessToken}/inbox`;
      const response = await requestJson<PatientInboxResponseBody>(
        fetchImpl,
        baseUrl,
        path,
        {
          method: "GET",
        },
      );
      return {
        patientId: response.patient_id,
        patientName: response.patient_name,
        notifications: response.notifications.map(mapDelivery),
      };
    },

    async applyPublicInboxAction(
      patientAccessToken: string,
      deliveryId: string,
      action: "open" | "action_taken",
    ): Promise<NotificationDelivery> {
      const payload: NotificationInboxActionRequestBody = { action };
      const response = await requestJson<NotificationDeliveryResponseBody>(
        fetchImpl,
        baseUrl,
        `/notification-links/${patientAccessToken}/inbox/${deliveryId}/actions`,
        {
          method: "POST",
          body: JSON.stringify(payload),
        },
      );
      return mapDelivery(response);
    },

    async getPublicPreferences(patientAccessToken: string): Promise<NotificationPreferences> {
      const response = await requestJson<NotificationPreferencesResponseBody>(
        fetchImpl,
        baseUrl,
        `/notification-links/${patientAccessToken}/preferences`,
        {
          method: "GET",
        },
      );
      return mapPreferences(response);
    },

    async updatePublicPreferences(
      patientAccessToken: string,
      payload: NotificationPreferencesPayload,
    ): Promise<NotificationPreferences> {
      const response = await requestJson<NotificationPreferencesResponseBody>(
        fetchImpl,
        baseUrl,
        `/notification-links/${patientAccessToken}/preferences`,
        {
          method: "PUT",
          body: JSON.stringify(mapPreferencesPayload(payload)),
        },
      );
      return mapPreferences(response);
    },

    async applyPublicDocumentAction(
      patientAccessToken: string,
      documentId: string,
      payload: { action: "opened" | "acknowledged"; note?: string },
    ): Promise<UnifiedTimelineEvent> {
      const body: PublicDocumentActionRequestBody = {
        action: payload.action,
      };
      if (payload.note !== undefined) {
        body.note = payload.note;
      }
      const response = await requestJson<UnifiedTimelineEventResponseBody>(
        fetchImpl,
        baseUrl,
        `/notification-links/${patientAccessToken}/documents/${documentId}/actions`,
        {
          method: "POST",
          body: JSON.stringify(body),
        },
      );
      return mapTimelineEvent(response);
    },
  };
}
