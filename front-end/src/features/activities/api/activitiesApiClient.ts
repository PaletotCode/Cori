import { getApiBaseUrl } from "../../../shared/config/env";
import type {
  ActivitiesApiErrorPayload,
  ActivitiesOverdueRunResult,
  ActivityCreatePayload,
  ActivityCreateResult,
  ActivityDetail,
  ActivityItem,
  ActivityPatientActionPayload,
  ActivityPsychologistActionPayload,
  ActivityTimelineEvent,
  ActivityUpdatePayload,
  PublicActivityActionResult,
  PublicActivityList,
} from "./types";

export class ActivitiesApiError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "ActivitiesApiError";
    this.statusCode = statusCode;
  }
}

interface ActivityItemResponseBody {
  id: string;
  patient_id: string;
  patient_name: string;
  psychologist_id: string;
  activity_type: "simple_task" | "guided_meditation" | "habit" | "document_reading";
  status: "assigned" | "opened" | "in_progress" | "paused" | "completed" | "canceled" | "overdue";
  title: string;
  due_at: string;
  assigned_at: string;
  overdue_at: string | null;
  recurrence_rule: "none" | "daily" | "weekly";
  recurrence_interval: number;
  recurrence_end_at: string | null;
  execution_elapsed_seconds: number;
}

interface ActivityDetailResponseBody extends ActivityItemResponseBody {
  tenant_id: string;
  description: string | null;
  instructions: string | null;
  document_url: string | null;
  configuration: Record<string, unknown>;
  opened_at: string | null;
  started_at: string | null;
  paused_at: string | null;
  completed_at: string | null;
  canceled_at: string | null;
  feedback_note: string | null;
  created_at: string;
  updated_at: string;
}

interface ActivityCreateResponseBody extends ActivityDetailResponseBody {
  patient_access_token: string;
  patient_access_link: string;
}

interface ActivityCreateRequestBody {
  patient_id: string;
  activity_type: "simple_task" | "guided_meditation" | "habit" | "document_reading";
  title: string;
  description?: string;
  instructions?: string;
  document_url?: string;
  configuration?: Record<string, unknown>;
  due_at: string;
  recurrence_rule?: "none" | "daily" | "weekly";
  recurrence_interval?: number;
  recurrence_end_at?: string;
}

interface ActivityUpdateRequestBody {
  activity_type?: "simple_task" | "guided_meditation" | "habit" | "document_reading";
  title?: string;
  description?: string;
  instructions?: string;
  document_url?: string;
  configuration?: Record<string, unknown>;
  due_at?: string;
  recurrence_rule?: "none" | "daily" | "weekly";
  recurrence_interval?: number;
  recurrence_end_at?: string;
}

interface PsychologistActionRequestBody {
  action: "resend" | "cancel" | "reopen";
  reason?: string;
}

interface PatientActionRequestBody {
  action: "open" | "start" | "pause" | "complete";
  feedback_note?: string;
}

interface ActivityTimelineResponseBody {
  id: string;
  activity_id: string | null;
  patient_id: string | null;
  event_type: string;
  actor_type: string;
  actor_id: string | null;
  payload: Record<string, unknown>;
  created_at: string;
}

interface PublicActivityListResponseBody {
  patient_id: string;
  patient_name: string;
  activities: ActivityItemResponseBody[];
}

interface PublicActivityActionResponseBody {
  activity: ActivityDetailResponseBody;
}

interface ActivitiesOverdueRunResponseBody {
  processed: number;
  marked_overdue: number;
}

export interface ActivitiesApiClient {
  createActivity: (accessToken: string, payload: ActivityCreatePayload) => Promise<ActivityCreateResult>;
  listActivities: (
    accessToken: string,
    options?: {
      patientId?: string;
      statusFilter?: string;
      limit?: number;
    },
  ) => Promise<ActivityItem[]>;
  getActivity: (accessToken: string, activityId: string) => Promise<ActivityDetail>;
  updateActivity: (
    accessToken: string,
    activityId: string,
    payload: ActivityUpdatePayload,
  ) => Promise<ActivityDetail>;
  applyPsychologistAction: (
    accessToken: string,
    activityId: string,
    payload: ActivityPsychologistActionPayload,
  ) => Promise<ActivityDetail>;
  listTimelineEvents: (
    accessToken: string,
    activityId: string,
    limit?: number,
  ) => Promise<ActivityTimelineEvent[]>;
  listPublicActivities: (patientAccessToken: string) => Promise<PublicActivityList>;
  applyPublicAction: (
    patientAccessToken: string,
    activityId: string,
    payload: ActivityPatientActionPayload,
  ) => Promise<PublicActivityActionResult>;
  runOverdueScheduler: (accessToken: string) => Promise<ActivitiesOverdueRunResult>;
}

interface CreateActivitiesApiClientOptions {
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
    const payload = (parsedBody ?? {}) as ActivitiesApiErrorPayload;
    throw new ActivitiesApiError(
      payload.detail ?? "Falha na requisicao de atividades.",
      response.status,
    );
  }

  return parsedBody as TResponse;
}

function mapItem(payload: ActivityItemResponseBody): ActivityItem {
  return {
    id: payload.id,
    patientId: payload.patient_id,
    patientName: payload.patient_name,
    psychologistId: payload.psychologist_id,
    activityType: payload.activity_type,
    status: payload.status,
    title: payload.title,
    dueAt: payload.due_at,
    assignedAt: payload.assigned_at,
    overdueAt: payload.overdue_at,
    recurrenceRule: payload.recurrence_rule,
    recurrenceInterval: payload.recurrence_interval,
    recurrenceEndAt: payload.recurrence_end_at,
    executionElapsedSeconds: payload.execution_elapsed_seconds,
  };
}

function mapDetail(payload: ActivityDetailResponseBody): ActivityDetail {
  return {
    ...mapItem(payload),
    tenantId: payload.tenant_id,
    description: payload.description,
    instructions: payload.instructions,
    documentUrl: payload.document_url,
    configuration: payload.configuration,
    openedAt: payload.opened_at,
    startedAt: payload.started_at,
    pausedAt: payload.paused_at,
    completedAt: payload.completed_at,
    canceledAt: payload.canceled_at,
    feedbackNote: payload.feedback_note,
    createdAt: payload.created_at,
    updatedAt: payload.updated_at,
  };
}

function mapCreatePayload(payload: ActivityCreatePayload): ActivityCreateRequestBody {
  const body: ActivityCreateRequestBody = {
    patient_id: payload.patientId,
    activity_type: payload.activityType,
    title: payload.title,
    due_at: payload.dueAt,
  };
  if (payload.description !== undefined) body.description = payload.description;
  if (payload.instructions !== undefined) body.instructions = payload.instructions;
  if (payload.documentUrl !== undefined) body.document_url = payload.documentUrl;
  if (payload.configuration !== undefined) body.configuration = payload.configuration;
  if (payload.recurrenceRule !== undefined) body.recurrence_rule = payload.recurrenceRule;
  if (payload.recurrenceInterval !== undefined) body.recurrence_interval = payload.recurrenceInterval;
  if (payload.recurrenceEndAt !== undefined) body.recurrence_end_at = payload.recurrenceEndAt;
  return body;
}

function mapUpdatePayload(payload: ActivityUpdatePayload): ActivityUpdateRequestBody {
  const body: ActivityUpdateRequestBody = {};
  if (payload.activityType !== undefined) body.activity_type = payload.activityType;
  if (payload.title !== undefined) body.title = payload.title;
  if (payload.description !== undefined) body.description = payload.description;
  if (payload.instructions !== undefined) body.instructions = payload.instructions;
  if (payload.documentUrl !== undefined) body.document_url = payload.documentUrl;
  if (payload.configuration !== undefined) body.configuration = payload.configuration;
  if (payload.dueAt !== undefined) body.due_at = payload.dueAt;
  if (payload.recurrenceRule !== undefined) body.recurrence_rule = payload.recurrenceRule;
  if (payload.recurrenceInterval !== undefined) body.recurrence_interval = payload.recurrenceInterval;
  if (payload.recurrenceEndAt !== undefined) body.recurrence_end_at = payload.recurrenceEndAt;
  return body;
}

function mapPsychologistActionPayload(
  payload: ActivityPsychologistActionPayload,
): PsychologistActionRequestBody {
  const body: PsychologistActionRequestBody = {
    action: payload.action,
  };
  if (payload.reason !== undefined) body.reason = payload.reason;
  return body;
}

function mapPatientActionPayload(payload: ActivityPatientActionPayload): PatientActionRequestBody {
  const body: PatientActionRequestBody = {
    action: payload.action,
  };
  if (payload.feedbackNote !== undefined) body.feedback_note = payload.feedbackNote;
  return body;
}

function mapTimelineEvent(payload: ActivityTimelineResponseBody): ActivityTimelineEvent {
  return {
    id: payload.id,
    activityId: payload.activity_id,
    patientId: payload.patient_id,
    eventType: payload.event_type,
    actorType: payload.actor_type,
    actorId: payload.actor_id,
    payload: payload.payload,
    createdAt: payload.created_at,
  };
}

function buildListPath(options?: {
  patientId?: string;
  statusFilter?: string;
  limit?: number;
}): string {
  const params = new URLSearchParams();
  if (options?.patientId !== undefined && options.patientId.length > 0) {
    params.set("patient_id", options.patientId);
  }
  if (options?.statusFilter !== undefined && options.statusFilter.length > 0) {
    params.set("status_filter", options.statusFilter);
  }
  if (options?.limit !== undefined) {
    params.set("limit", String(options.limit));
  }
  const query = params.toString();
  return query.length > 0 ? `/activities?${query}` : "/activities";
}

export function createActivitiesApiClient(
  options: CreateActivitiesApiClientOptions = {},
): ActivitiesApiClient {
  const baseUrl = (options.baseUrl ?? getApiBaseUrl()).replace(/\/$/, "");
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    async createActivity(accessToken: string, payload: ActivityCreatePayload): Promise<ActivityCreateResult> {
      const response = await requestJson<ActivityCreateResponseBody>(
        fetchImpl,
        baseUrl,
        "/activities",
        {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify(mapCreatePayload(payload)),
        },
      );
      return {
        ...mapDetail(response),
        patientAccessToken: response.patient_access_token,
        patientAccessLink: response.patient_access_link,
      };
    },

    async listActivities(
      accessToken: string,
      options?: {
        patientId?: string;
        statusFilter?: string;
        limit?: number;
      },
    ): Promise<ActivityItem[]> {
      const response = await requestJson<ActivityItemResponseBody[]>(
        fetchImpl,
        baseUrl,
        buildListPath(options),
        {
          method: "GET",
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );
      return response.map(mapItem);
    },

    async getActivity(accessToken: string, activityId: string): Promise<ActivityDetail> {
      const response = await requestJson<ActivityDetailResponseBody>(
        fetchImpl,
        baseUrl,
        `/activities/${activityId}`,
        {
          method: "GET",
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );
      return mapDetail(response);
    },

    async updateActivity(
      accessToken: string,
      activityId: string,
      payload: ActivityUpdatePayload,
    ): Promise<ActivityDetail> {
      const response = await requestJson<ActivityDetailResponseBody>(
        fetchImpl,
        baseUrl,
        `/activities/${activityId}`,
        {
          method: "PATCH",
          headers: { Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify(mapUpdatePayload(payload)),
        },
      );
      return mapDetail(response);
    },

    async applyPsychologistAction(
      accessToken: string,
      activityId: string,
      payload: ActivityPsychologistActionPayload,
    ): Promise<ActivityDetail> {
      const response = await requestJson<ActivityDetailResponseBody>(
        fetchImpl,
        baseUrl,
        `/activities/${activityId}/actions`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify(mapPsychologistActionPayload(payload)),
        },
      );
      return mapDetail(response);
    },

    async listTimelineEvents(
      accessToken: string,
      activityId: string,
      limit = 200,
    ): Promise<ActivityTimelineEvent[]> {
      const response = await requestJson<ActivityTimelineResponseBody[]>(
        fetchImpl,
        baseUrl,
        `/activities/${activityId}/timeline-events?limit=${limit}`,
        {
          method: "GET",
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );
      return response.map(mapTimelineEvent);
    },

    async listPublicActivities(patientAccessToken: string): Promise<PublicActivityList> {
      const response = await requestJson<PublicActivityListResponseBody>(
        fetchImpl,
        baseUrl,
        `/activity-links/${patientAccessToken}/activities`,
        {
          method: "GET",
        },
      );
      return {
        patientId: response.patient_id,
        patientName: response.patient_name,
        activities: response.activities.map(mapItem),
      };
    },

    async applyPublicAction(
      patientAccessToken: string,
      activityId: string,
      payload: ActivityPatientActionPayload,
    ): Promise<PublicActivityActionResult> {
      const response = await requestJson<PublicActivityActionResponseBody>(
        fetchImpl,
        baseUrl,
        `/activity-links/${patientAccessToken}/activities/${activityId}/actions`,
        {
          method: "POST",
          body: JSON.stringify(mapPatientActionPayload(payload)),
        },
      );
      return {
        activity: mapDetail(response.activity),
      };
    },

    async runOverdueScheduler(accessToken: string): Promise<ActivitiesOverdueRunResult> {
      const response = await requestJson<ActivitiesOverdueRunResponseBody>(
        fetchImpl,
        baseUrl,
        "/scheduler/activities-overdue/run",
        {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );
      return {
        processed: response.processed,
        markedOverdue: response.marked_overdue,
      };
    },
  };
}
