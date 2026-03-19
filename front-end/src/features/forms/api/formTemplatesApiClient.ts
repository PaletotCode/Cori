import { getApiBaseUrl } from "../../../shared/config/env";
import type {
  ClinicalFormDetail,
  FormQuestionPayload,
  FormSection,
  FormSectionPayload,
  FormTemplateAssignPayload,
  FormTemplateAssignResult,
  FormTemplateCreatePayload,
  FormTemplateListItem,
  FormsApiErrorPayload,
} from "./types";

export class FormTemplatesApiError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "FormTemplatesApiError";
    this.statusCode = statusCode;
  }
}

interface FormQuestionBody {
  question_id: string;
  label: string;
  field_type: "short_text" | "long_text" | "multiple_choice" | "checkbox" | "scale" | "date_time";
  required: boolean;
  help_text: string | null;
  options: string[] | null;
  scale_min: number | null;
  scale_max: number | null;
}

interface FormSectionBody {
  section_id: string;
  title: string;
  description: string | null;
  questions: FormQuestionBody[];
}

interface FormTemplateResponseBody {
  id: string;
  tenant_id: string;
  psychologist_id: string;
  title: string;
  subtitle: string | null;
  header: string | null;
  sections: FormSectionBody[];
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

interface FormQuestionRequestBody {
  question_id?: string;
  label: string;
  field_type: "short_text" | "long_text" | "multiple_choice" | "checkbox" | "scale" | "date_time";
  required?: boolean;
  help_text?: string;
  options?: string[];
  scale_min?: number;
  scale_max?: number;
}

interface FormSectionRequestBody {
  section_id?: string;
  title: string;
  description?: string;
  questions: FormQuestionRequestBody[];
}

interface FormTemplateCreateRequestBody {
  title: string;
  subtitle?: string;
  header?: string;
  sections: FormSectionRequestBody[];
}

interface FormTemplateAssignOverridesRequestBody {
  title?: string;
  subtitle?: string;
  header?: string;
  sections?: FormSectionRequestBody[];
}

interface FormTemplateAssignRequestBody {
  patient_id: string;
  send_mode: "immediate" | "scheduled";
  scheduled_send_at?: string;
  overrides?: FormTemplateAssignOverridesRequestBody;
}

interface ClinicalFormListItemBody {
  id: string;
  patient_id: string;
  patient_name: string;
  psychologist_id: string;
  source_template_id: string | null;
  status: "draft" | "published" | "scheduled" | "assigned" | "opened" | "partial_saved" | "submitted" | "reviewed";
  title: string;
  subtitle: string | null;
  published_at: string | null;
  scheduled_send_at: string | null;
  assigned_at: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
}

interface ClinicalFormDetailBody extends ClinicalFormListItemBody {
  tenant_id: string;
  header: string | null;
  sections: FormSectionBody[];
  response_data: Record<string, unknown> | null;
  opened_at: string | null;
  partial_saved_at: string | null;
  reviewed_by_user_id: string | null;
  review_note: string | null;
  created_at: string;
  updated_at: string;
}

interface FormTemplateAssignResponseBody {
  idempotency_replayed: boolean;
  form: ClinicalFormDetailBody;
}

export interface FormTemplatesApiClient {
  listTemplates: (
    accessToken: string,
    options?: {
      includeArchived?: boolean;
      limit?: number;
      offset?: number;
    },
  ) => Promise<FormTemplateListItem[]>;
  createTemplate: (accessToken: string, payload: FormTemplateCreatePayload) => Promise<FormTemplateListItem>;
  assignTemplate: (
    accessToken: string,
    templateId: string,
    payload: FormTemplateAssignPayload,
    idempotencyKey: string,
  ) => Promise<FormTemplateAssignResult>;
}

interface CreateFormTemplatesApiClientOptions {
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
    const payload = (parsedBody ?? {}) as FormsApiErrorPayload;
    throw new FormTemplatesApiError(
      payload.detail ?? "Falha na requisicao de templates de formulario.",
      response.status,
    );
  }

  return parsedBody as TResponse;
}

function mapQuestion(payload: FormQuestionBody) {
  return {
    questionId: payload.question_id,
    label: payload.label,
    fieldType: payload.field_type,
    required: payload.required,
    helpText: payload.help_text,
    options: payload.options,
    scaleMin: payload.scale_min,
    scaleMax: payload.scale_max,
  };
}

function mapSection(payload: FormSectionBody): FormSection {
  return {
    sectionId: payload.section_id,
    title: payload.title,
    description: payload.description,
    questions: payload.questions.map(mapQuestion),
  };
}

function mapTemplate(payload: FormTemplateResponseBody): FormTemplateListItem {
  return {
    id: payload.id,
    tenantId: payload.tenant_id,
    psychologistId: payload.psychologist_id,
    title: payload.title,
    subtitle: payload.subtitle,
    header: payload.header,
    sections: payload.sections.map(mapSection),
    createdAt: payload.created_at,
    updatedAt: payload.updated_at,
    archivedAt: payload.archived_at,
  };
}

function mapForm(payload: ClinicalFormDetailBody): ClinicalFormDetail {
  return {
    id: payload.id,
    patientId: payload.patient_id,
    patientName: payload.patient_name,
    psychologistId: payload.psychologist_id,
    sourceTemplateId: payload.source_template_id,
    status: payload.status,
    title: payload.title,
    subtitle: payload.subtitle,
    publishedAt: payload.published_at,
    scheduledSendAt: payload.scheduled_send_at,
    assignedAt: payload.assigned_at,
    submittedAt: payload.submitted_at,
    reviewedAt: payload.reviewed_at,
    tenantId: payload.tenant_id,
    header: payload.header,
    sections: payload.sections.map(mapSection),
    responseData: payload.response_data,
    openedAt: payload.opened_at,
    partialSavedAt: payload.partial_saved_at,
    reviewedByUserId: payload.reviewed_by_user_id,
    reviewNote: payload.review_note,
    createdAt: payload.created_at,
    updatedAt: payload.updated_at,
  };
}

function mapQuestionPayload(question: FormQuestionPayload): FormQuestionRequestBody {
  const body: FormQuestionRequestBody = {
    label: question.label,
    field_type: question.fieldType,
  };
  if (question.questionId !== undefined) body.question_id = question.questionId;
  if (question.required !== undefined) body.required = question.required;
  if (question.helpText !== undefined) body.help_text = question.helpText;
  if (question.options !== undefined) body.options = question.options;
  if (question.scaleMin !== undefined) body.scale_min = question.scaleMin;
  if (question.scaleMax !== undefined) body.scale_max = question.scaleMax;
  return body;
}

function mapSectionPayload(section: FormSectionPayload): FormSectionRequestBody {
  const body: FormSectionRequestBody = {
    title: section.title,
    questions: section.questions.map(mapQuestionPayload),
  };
  if (section.sectionId !== undefined) body.section_id = section.sectionId;
  if (section.description !== undefined) body.description = section.description;
  return body;
}

function mapCreatePayload(payload: FormTemplateCreatePayload): FormTemplateCreateRequestBody {
  const body: FormTemplateCreateRequestBody = {
    title: payload.title,
    sections: payload.sections.map(mapSectionPayload),
  };
  if (payload.subtitle !== undefined) body.subtitle = payload.subtitle;
  if (payload.header !== undefined) body.header = payload.header;
  return body;
}

function mapAssignPayload(payload: FormTemplateAssignPayload): FormTemplateAssignRequestBody {
  const body: FormTemplateAssignRequestBody = {
    patient_id: payload.patientId,
    send_mode: payload.sendMode,
  };
  if (payload.scheduledSendAt !== undefined) {
    body.scheduled_send_at = payload.scheduledSendAt;
  }
  if (payload.overrides !== undefined) {
    const overrides: FormTemplateAssignOverridesRequestBody = {};
    if (payload.overrides.title !== undefined) overrides.title = payload.overrides.title;
    if (payload.overrides.subtitle !== undefined) overrides.subtitle = payload.overrides.subtitle;
    if (payload.overrides.header !== undefined) overrides.header = payload.overrides.header;
    if (payload.overrides.sections !== undefined) {
      overrides.sections = payload.overrides.sections.map(mapSectionPayload);
    }
    body.overrides = overrides;
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
  return query.length > 0 ? `/form-templates?${query}` : "/form-templates";
}

export function createFormTemplatesApiClient(
  options: CreateFormTemplatesApiClientOptions = {},
): FormTemplatesApiClient {
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
    ): Promise<FormTemplateListItem[]> {
      const path = buildListPath(options);
      const response = await requestJson<FormTemplateResponseBody[]>(fetchImpl, baseUrl, path, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      return response.map(mapTemplate);
    },

    async createTemplate(
      accessToken: string,
      payload: FormTemplateCreatePayload,
    ): Promise<FormTemplateListItem> {
      const response = await requestJson<FormTemplateResponseBody>(fetchImpl, baseUrl, "/form-templates", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(mapCreatePayload(payload)),
      });
      return mapTemplate(response);
    },

    async assignTemplate(
      accessToken: string,
      templateId: string,
      payload: FormTemplateAssignPayload,
      idempotencyKey: string,
    ): Promise<FormTemplateAssignResult> {
      const response = await requestJson<FormTemplateAssignResponseBody>(
        fetchImpl,
        baseUrl,
        `/form-templates/${templateId}/assign`,
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
        form: mapForm(response.form),
      };
    },
  };
}
