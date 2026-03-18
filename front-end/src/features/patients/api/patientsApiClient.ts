import { getApiBaseUrl } from "../../../shared/config/env";
import type {
  ListPatientsOptions,
  PatientArchiveResult,
  PatientChange,
  PatientCreatePayload,
  PatientDetail,
  PatientListItem,
  PatientTimelineEvent,
  PatientUpdatePayload,
  PatientsApiErrorPayload,
} from "./types";

export class PatientsApiError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "PatientsApiError";
    this.statusCode = statusCode;
  }
}

interface PatientListItemResponseBody {
  id: string;
  full_name: string;
  preferred_name: string | null;
  email: string | null;
  phone: string | null;
  preferred_contact_channel: "whatsapp" | "email" | "phone";
  profile_source: "manual" | "intake";
  whatsapp_number_valid: boolean;
  updated_at: string;
}

interface PatientDetailResponseBody {
  id: string;
  tenant_id: string;
  full_name: string;
  preferred_name: string | null;
  email: string | null;
  phone: string | null;
  birth_date: string | null;
  pronouns: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  preferred_contact_channel: "whatsapp" | "email" | "phone";
  preferred_contact_period: "morning" | "afternoon" | "night" | "flexible" | null;
  communication_notes: string | null;
  profile_source: "manual" | "intake";
  whatsapp_number_valid: boolean;
  created_at: string;
  updated_at: string;
}

interface PatientCreateRequestBody {
  full_name: string;
  preferred_name?: string;
  email?: string;
  phone?: string;
  birth_date?: string;
  pronouns?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  preferred_contact_channel?: "whatsapp" | "email" | "phone";
  preferred_contact_period?: "morning" | "afternoon" | "night" | "flexible";
  communication_notes?: string;
}

interface PatientUpdateRequestBody extends PatientCreateRequestBody {
  overwrite_initial_registration?: boolean;
  overwrite_reason?: string;
}

interface PatientChangeResponseBody {
  id: string;
  change_type: "created" | "updated" | "overwritten" | "archived";
  changed_fields: string[];
  previous_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  changed_by_user_id: string | null;
  reason: string | null;
  created_at: string;
}

interface PatientTimelineEventResponseBody {
  id: string;
  event_type: string;
  actor_type: string;
  actor_id: string | null;
  payload: Record<string, unknown>;
  created_at: string;
}

interface PatientArchiveResponseBody {
  patient_id: string;
  archived_at: string;
}

export interface PatientsApiClient {
  list: (accessToken: string, options?: ListPatientsOptions) => Promise<PatientListItem[]>;
  create: (accessToken: string, payload: PatientCreatePayload) => Promise<PatientDetail>;
  get: (accessToken: string, patientId: string) => Promise<PatientDetail>;
  update: (
    accessToken: string,
    patientId: string,
    payload: PatientUpdatePayload,
  ) => Promise<PatientDetail>;
  archive: (accessToken: string, patientId: string) => Promise<PatientArchiveResult>;
  listChanges: (accessToken: string, patientId: string, limit?: number) => Promise<PatientChange[]>;
  listTimelineEvents: (
    accessToken: string,
    patientId: string,
    limit?: number,
  ) => Promise<PatientTimelineEvent[]>;
}

interface CreatePatientsApiClientOptions {
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
    const payload = (parsedBody ?? {}) as PatientsApiErrorPayload;
    throw new PatientsApiError(payload.detail ?? "Falha na requisicao de pacientes.", response.status);
  }

  return parsedBody as TResponse;
}

function mapListItem(payload: PatientListItemResponseBody): PatientListItem {
  return {
    id: payload.id,
    fullName: payload.full_name,
    preferredName: payload.preferred_name,
    email: payload.email,
    phone: payload.phone,
    preferredContactChannel: payload.preferred_contact_channel,
    profileSource: payload.profile_source,
    whatsappNumberValid: payload.whatsapp_number_valid,
    updatedAt: payload.updated_at,
  };
}

function mapPatientDetail(payload: PatientDetailResponseBody): PatientDetail {
  return {
    id: payload.id,
    tenantId: payload.tenant_id,
    fullName: payload.full_name,
    preferredName: payload.preferred_name,
    email: payload.email,
    phone: payload.phone,
    birthDate: payload.birth_date,
    pronouns: payload.pronouns,
    emergencyContactName: payload.emergency_contact_name,
    emergencyContactPhone: payload.emergency_contact_phone,
    preferredContactChannel: payload.preferred_contact_channel,
    preferredContactPeriod: payload.preferred_contact_period,
    communicationNotes: payload.communication_notes,
    profileSource: payload.profile_source,
    whatsappNumberValid: payload.whatsapp_number_valid,
    createdAt: payload.created_at,
    updatedAt: payload.updated_at,
  };
}

function mapCreatePayload(payload: PatientCreatePayload): PatientCreateRequestBody {
  const body: PatientCreateRequestBody = {
    full_name: payload.fullName,
  };
  if (payload.preferredName !== undefined) body.preferred_name = payload.preferredName;
  if (payload.email !== undefined) body.email = payload.email;
  if (payload.phone !== undefined) body.phone = payload.phone;
  if (payload.birthDate !== undefined) body.birth_date = payload.birthDate;
  if (payload.pronouns !== undefined) body.pronouns = payload.pronouns;
  if (payload.emergencyContactName !== undefined) {
    body.emergency_contact_name = payload.emergencyContactName;
  }
  if (payload.emergencyContactPhone !== undefined) {
    body.emergency_contact_phone = payload.emergencyContactPhone;
  }
  if (payload.preferredContactChannel !== undefined) {
    body.preferred_contact_channel = payload.preferredContactChannel;
  }
  if (payload.preferredContactPeriod !== undefined) {
    body.preferred_contact_period = payload.preferredContactPeriod;
  }
  if (payload.communicationNotes !== undefined) {
    body.communication_notes = payload.communicationNotes;
  }
  return body;
}

function mapUpdatePayload(payload: PatientUpdatePayload): PatientUpdateRequestBody {
  const body: PatientUpdateRequestBody = mapCreatePayload(payload);
  if (payload.overwriteInitialRegistration !== undefined) {
    body.overwrite_initial_registration = payload.overwriteInitialRegistration;
  }
  if (payload.overwriteReason !== undefined) {
    body.overwrite_reason = payload.overwriteReason;
  }
  return body;
}

function mapChange(payload: PatientChangeResponseBody): PatientChange {
  return {
    id: payload.id,
    changeType: payload.change_type,
    changedFields: payload.changed_fields,
    previousData: payload.previous_data,
    newData: payload.new_data,
    changedByUserId: payload.changed_by_user_id,
    reason: payload.reason,
    createdAt: payload.created_at,
  };
}

function mapTimelineEvent(payload: PatientTimelineEventResponseBody): PatientTimelineEvent {
  return {
    id: payload.id,
    eventType: payload.event_type,
    actorType: payload.actor_type,
    actorId: payload.actor_id,
    payload: payload.payload,
    createdAt: payload.created_at,
  };
}

function mapArchive(payload: PatientArchiveResponseBody): PatientArchiveResult {
  return {
    patientId: payload.patient_id,
    archivedAt: payload.archived_at,
  };
}

function buildListPath(options?: ListPatientsOptions): string {
  const params = new URLSearchParams();
  if (options?.search !== undefined && options.search.trim().length > 0) {
    params.set("search", options.search.trim());
  }
  if (options?.preferredContactChannel !== undefined) {
    params.set("preferred_contact_channel", options.preferredContactChannel);
  }
  if (options?.hasWhatsapp !== undefined) {
    params.set("has_whatsapp", options.hasWhatsapp ? "true" : "false");
  }
  if (options?.sortBy !== undefined) {
    params.set("sort_by", options.sortBy);
  }
  if (options?.sortOrder !== undefined) {
    params.set("sort_order", options.sortOrder);
  }

  const query = params.toString();
  return query.length > 0 ? `/patients?${query}` : "/patients";
}

export function createPatientsApiClient(
  options: CreatePatientsApiClientOptions = {},
): PatientsApiClient {
  const baseUrl = (options.baseUrl ?? getApiBaseUrl()).replace(/\/$/, "");
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    async list(accessToken: string, options?: ListPatientsOptions): Promise<PatientListItem[]> {
      const path = buildListPath(options);
      const payload = await requestJson<PatientListItemResponseBody[]>(fetchImpl, baseUrl, path, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      return payload.map(mapListItem);
    },

    async create(accessToken: string, payload: PatientCreatePayload): Promise<PatientDetail> {
      const response = await requestJson<PatientDetailResponseBody>(fetchImpl, baseUrl, "/patients", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(mapCreatePayload(payload)),
      });
      return mapPatientDetail(response);
    },

    async get(accessToken: string, patientId: string): Promise<PatientDetail> {
      const response = await requestJson<PatientDetailResponseBody>(
        fetchImpl,
        baseUrl,
        `/patients/${patientId}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );
      return mapPatientDetail(response);
    },

    async update(
      accessToken: string,
      patientId: string,
      payload: PatientUpdatePayload,
    ): Promise<PatientDetail> {
      const response = await requestJson<PatientDetailResponseBody>(
        fetchImpl,
        baseUrl,
        `/patients/${patientId}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(mapUpdatePayload(payload)),
        },
      );
      return mapPatientDetail(response);
    },

    async archive(accessToken: string, patientId: string): Promise<PatientArchiveResult> {
      const response = await requestJson<PatientArchiveResponseBody>(
        fetchImpl,
        baseUrl,
        `/patients/${patientId}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );
      return mapArchive(response);
    },

    async listChanges(
      accessToken: string,
      patientId: string,
      limit = 120,
    ): Promise<PatientChange[]> {
      const response = await requestJson<PatientChangeResponseBody[]>(
        fetchImpl,
        baseUrl,
        `/patients/${patientId}/changes?limit=${limit}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );
      return response.map(mapChange);
    },

    async listTimelineEvents(
      accessToken: string,
      patientId: string,
      limit = 120,
    ): Promise<PatientTimelineEvent[]> {
      const response = await requestJson<PatientTimelineEventResponseBody[]>(
        fetchImpl,
        baseUrl,
        `/patients/${patientId}/timeline-events?limit=${limit}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );
      return response.map(mapTimelineEvent);
    },
  };
}
