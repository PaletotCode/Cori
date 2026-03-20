import { getApiBaseUrl } from "../../../shared/config/env";
import type {
  ActivitiesApiErrorPayload,
  ActivityDetail,
  ActivityTemplateAssignPayload,
  ActivityTemplateAssignResult,
  ActivityTemplateCreatePayload,
  ActivityTemplateListItem,
} from "./types";

export class ActivityTemplatesApiError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "ActivityTemplatesApiError";
    this.statusCode = statusCode;
  }
}

interface ActivityTemplateResponseBody {
  id: string;
  tenant_id: string;
  psychologist_id: string;
  title: string;
  description: string | null;
  instructions: string | null;
  document_url: string | null;
  configuration: Record<string, unknown>;
  activity_type: "simple_task" | "guided_meditation" | "habit" | "document_reading";
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

interface ActivityTemplateCreateRequestBody {
  title: string;
  description?: string;
  instructions?: string;
  document_url?: string;
  configuration?: Record<string, unknown>;
  activity_type: "simple_task" | "guided_meditation" | "habit" | "document_reading";
}

interface ActivityTemplateAssignOverridesRequestBody {
  title?: string;
  description?: string;
  instructions?: string;
  document_url?: string;
  configuration?: Record<string, unknown>;
  activity_type?: "simple_task" | "guided_meditation" | "habit" | "document_reading";
  recurrence_rule?: "none" | "daily" | "weekly";
  recurrence_interval?: number;
  recurrence_end_at?: string;
}

interface ActivityTemplateAssignRequestBody {
  patient_id: string;
  send_mode: "immediate" | "scheduled";
  scheduled_send_at?: string;
  due_at: string;
  overrides?: ActivityTemplateAssignOverridesRequestBody;
}

interface ActivityItemResponseBody {
  id: string;
  patient_id: string;
  patient_name: string;
  psychologist_id: string;
  source_template_id: string | null;
  activity_type: "simple_task" | "guided_meditation" | "habit" | "document_reading";
  status:
    | "scheduled"
    | "assigned"
    | "opened"
    | "in_progress"
    | "paused"
    | "completed"
    | "canceled"
    | "overdue";
  title: string;
  due_at: string;
  scheduled_send_at: string | null;
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

interface ActivityTemplateAssignResponseBody {
  idempotency_replayed: boolean;
  activity: ActivityDetailResponseBody;
}

export interface ActivityTemplatesApiClient {
  listTemplates: (
    accessToken: string,
    options?: {
      includeArchived?: boolean;
      limit?: number;
      offset?: number;
    },
  ) => Promise<ActivityTemplateListItem[]>;
  createTemplate: (
    accessToken: string,
    payload: ActivityTemplateCreatePayload,
  ) => Promise<ActivityTemplateListItem>;
  updateTemplate: (
    accessToken: string,
    templateId: string,
    payload: ActivityTemplateCreatePayload,
  ) => Promise<ActivityTemplateListItem>;
  assignTemplate: (
    accessToken: string,
    templateId: string,
    payload: ActivityTemplateAssignPayload,
    idempotencyKey: string,
  ) => Promise<ActivityTemplateAssignResult>;
}

interface CreateActivityTemplatesApiClientOptions {
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
    throw new ActivityTemplatesApiError(
      payload.detail ?? "Falha na requisicao de templates de atividade.",
      response.status,
    );
  }

  return parsedBody as TResponse;
}

function mapTemplate(payload: ActivityTemplateResponseBody): ActivityTemplateListItem {
  return {
    id: payload.id,
    tenantId: payload.tenant_id,
    psychologistId: payload.psychologist_id,
    title: payload.title,
    description: payload.description,
    instructions: payload.instructions,
    documentUrl: payload.document_url,
    configuration: payload.configuration,
    activityType: payload.activity_type,
    createdAt: payload.created_at,
    updatedAt: payload.updated_at,
    archivedAt: payload.archived_at,
  };
}

function mapActivity(payload: ActivityDetailResponseBody): ActivityDetail {
  return {
    id: payload.id,
    patientId: payload.patient_id,
    patientName: payload.patient_name,
    psychologistId: payload.psychologist_id,
    sourceTemplateId: payload.source_template_id,
    activityType: payload.activity_type,
    status: payload.status,
    title: payload.title,
    dueAt: payload.due_at,
    scheduledSendAt: payload.scheduled_send_at,
    assignedAt: payload.assigned_at,
    overdueAt: payload.overdue_at,
    recurrenceRule: payload.recurrence_rule,
    recurrenceInterval: payload.recurrence_interval,
    recurrenceEndAt: payload.recurrence_end_at,
    executionElapsedSeconds: payload.execution_elapsed_seconds,
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

function mapCreatePayload(payload: ActivityTemplateCreatePayload): ActivityTemplateCreateRequestBody {
  const body: ActivityTemplateCreateRequestBody = {
    title: payload.title,
    activity_type: payload.activityType,
  };
  if (payload.description !== undefined) body.description = payload.description;
  if (payload.instructions !== undefined) body.instructions = payload.instructions;
  if (payload.documentUrl !== undefined) body.document_url = payload.documentUrl;
  if (payload.configuration !== undefined) body.configuration = payload.configuration;
  return body;
}

function mapAssignPayload(payload: ActivityTemplateAssignPayload): ActivityTemplateAssignRequestBody {
  const body: ActivityTemplateAssignRequestBody = {
    patient_id: payload.patientId,
    send_mode: payload.sendMode,
    due_at: payload.dueAt,
  };
  if (payload.scheduledSendAt !== undefined) {
    body.scheduled_send_at = payload.scheduledSendAt;
  }
  if (payload.overrides !== undefined) {
    body.overrides = {
      title: payload.overrides.title,
      description: payload.overrides.description,
      instructions: payload.overrides.instructions,
      document_url: payload.overrides.documentUrl,
      configuration: payload.overrides.configuration,
      activity_type: payload.overrides.activityType,
      recurrence_rule: payload.overrides.recurrenceRule,
      recurrence_interval: payload.overrides.recurrenceInterval,
      recurrence_end_at: payload.overrides.recurrenceEndAt,
    };
  }
  return body;
}

function buildListPath(options?: {
  includeArchived?: boolean;
  limit?: number;
  offset?: number;
}): string {
  const params = new URLSearchParams();
  if (options?.includeArchived !== undefined) {
    params.set("include_archived", options.includeArchived ? "true" : "false");
  }
  if (options?.limit !== undefined) {
    params.set("limit", String(options.limit));
  }
  if (options?.offset !== undefined) {
    params.set("offset", String(options.offset));
  }
  const query = params.toString();
  return query.length > 0 ? `/activity-templates?${query}` : "/activity-templates";
}

export function createActivityTemplatesApiClient(
  options: CreateActivityTemplatesApiClientOptions = {},
): ActivityTemplatesApiClient {
  const baseUrl = (options.baseUrl ?? getApiBaseUrl()).replace(/\/$/, "");
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    async listTemplates(
      accessToken: string,
      options?: {
        includeArchived?: boolean;
        limit?: number;
        offset?: number;
      },
    ): Promise<ActivityTemplateListItem[]> {
      const path = buildListPath(options);
      const response = await requestJson<ActivityTemplateResponseBody[]>(fetchImpl, baseUrl, path, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      return response.map(mapTemplate);
    },

    async createTemplate(
      accessToken: string,
      payload: ActivityTemplateCreatePayload,
    ): Promise<ActivityTemplateListItem> {
      const response = await requestJson<ActivityTemplateResponseBody>(
        fetchImpl,
        baseUrl,
        "/activity-templates",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(mapCreatePayload(payload)),
        },
      );
      return mapTemplate(response);
    },

    async updateTemplate(
      accessToken: string,
      templateId: string,
      payload: ActivityTemplateCreatePayload,
    ): Promise<ActivityTemplateListItem> {
      const response = await requestJson<ActivityTemplateResponseBody>(
        fetchImpl,
        baseUrl,
        `/activity-templates/${templateId}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(mapCreatePayload(payload)),
        },
      );
      return mapTemplate(response);
    },

    async assignTemplate(
      accessToken: string,
      templateId: string,
      payload: ActivityTemplateAssignPayload,
      idempotencyKey: string,
    ): Promise<ActivityTemplateAssignResult> {
      const response = await requestJson<ActivityTemplateAssignResponseBody>(
        fetchImpl,
        baseUrl,
        `/activity-templates/${templateId}/assign`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Idempotency-Key": idempotencyKey,
          },
          body: JSON.stringify(mapAssignPayload(payload)),
        },
      );
      return {
        idempotencyReplayed: response.idempotency_replayed,
        activity: mapActivity(response.activity),
      };
    },
  };
}
