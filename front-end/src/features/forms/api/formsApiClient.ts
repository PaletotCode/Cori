import { getApiBaseUrl } from "../../../shared/config/env";
import type {
  ClinicalFormCreatePayload,
  ClinicalFormCreateResult,
  ClinicalFormDetail,
  ClinicalFormListItem,
  ClinicalFormPatientActionPayload,
  ClinicalFormPsychologistActionPayload,
  ClinicalFormPublicActionResult,
  ClinicalFormPublicList,
  ClinicalFormTimelineEvent,
  ClinicalFormUpdatePayload,
  FormsApiErrorPayload,
  FormsDispatchRunResult,
} from "./types";

export class FormsApiError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "FormsApiError";
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

interface ClinicalFormListItemBody {
  id: string;
  patient_id: string;
  patient_name: string;
  psychologist_id: string;
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

interface ClinicalFormCreateBody extends ClinicalFormDetailBody {
  patient_access_token: string;
  patient_access_link: string;
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

interface ClinicalFormCreateRequestBody {
  patient_id: string;
  title: string;
  subtitle?: string;
  header?: string;
  sections: FormSectionRequestBody[];
}

interface ClinicalFormUpdateRequestBody {
  title?: string;
  subtitle?: string;
  header?: string;
  sections?: FormSectionRequestBody[];
}

interface ClinicalFormPsychologistActionRequestBody {
  action: "publish" | "send" | "schedule" | "review";
  scheduled_send_at?: string;
  review_note?: string;
}

interface ClinicalFormPatientActionRequestBody {
  action: "open" | "partial_save" | "submit";
  answers?: Record<string, unknown>;
}

interface ClinicalFormTimelineBody {
  id: string;
  form_id: string | null;
  patient_id: string | null;
  event_type: string;
  actor_type: string;
  actor_id: string | null;
  payload: Record<string, unknown>;
  created_at: string;
}

interface ClinicalFormPublicListBody {
  patient_id: string;
  patient_name: string;
  forms: ClinicalFormDetailBody[];
}

interface ClinicalFormPublicActionBody {
  form: ClinicalFormDetailBody;
}

interface FormsDispatchRunBody {
  processed: number;
  dispatched: number;
}

export interface FormsApiClient {
  createForm: (accessToken: string, payload: ClinicalFormCreatePayload) => Promise<ClinicalFormCreateResult>;
  listForms: (
    accessToken: string,
    options?: {
      patientId?: string;
      statusFilter?: string;
      limit?: number;
    },
  ) => Promise<ClinicalFormListItem[]>;
  listReceivedResponses: (accessToken: string, limit?: number) => Promise<ClinicalFormDetail[]>;
  getForm: (accessToken: string, formId: string) => Promise<ClinicalFormDetail>;
  updateForm: (
    accessToken: string,
    formId: string,
    payload: ClinicalFormUpdatePayload,
  ) => Promise<ClinicalFormDetail>;
  applyPsychologistAction: (
    accessToken: string,
    formId: string,
    payload: ClinicalFormPsychologistActionPayload,
  ) => Promise<ClinicalFormDetail>;
  listTimelineEvents: (
    accessToken: string,
    formId: string,
    limit?: number,
  ) => Promise<ClinicalFormTimelineEvent[]>;
  listPublicForms: (patientAccessToken: string) => Promise<ClinicalFormPublicList>;
  applyPublicAction: (
    patientAccessToken: string,
    formId: string,
    payload: ClinicalFormPatientActionPayload,
  ) => Promise<ClinicalFormPublicActionResult>;
  runDispatchScheduler: (accessToken: string) => Promise<FormsDispatchRunResult>;
}

interface CreateFormsApiClientOptions {
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
    throw new FormsApiError(payload.detail ?? "Falha na requisicao de formularios.", response.status);
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

function mapSection(payload: FormSectionBody) {
  return {
    sectionId: payload.section_id,
    title: payload.title,
    description: payload.description,
    questions: payload.questions.map(mapQuestion),
  };
}

function mapListItem(payload: ClinicalFormListItemBody): ClinicalFormListItem {
  return {
    id: payload.id,
    patientId: payload.patient_id,
    patientName: payload.patient_name,
    psychologistId: payload.psychologist_id,
    status: payload.status,
    title: payload.title,
    subtitle: payload.subtitle,
    publishedAt: payload.published_at,
    scheduledSendAt: payload.scheduled_send_at,
    assignedAt: payload.assigned_at,
    submittedAt: payload.submitted_at,
    reviewedAt: payload.reviewed_at,
  };
}

function mapDetail(payload: ClinicalFormDetailBody): ClinicalFormDetail {
  return {
    ...mapListItem(payload),
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

function mapQuestionPayload(question: ClinicalFormCreatePayload["sections"][number]["questions"][number]): FormQuestionRequestBody {
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

function mapSectionPayload(section: ClinicalFormCreatePayload["sections"][number]): FormSectionRequestBody {
  const body: FormSectionRequestBody = {
    title: section.title,
    questions: section.questions.map(mapQuestionPayload),
  };
  if (section.sectionId !== undefined) body.section_id = section.sectionId;
  if (section.description !== undefined) body.description = section.description;
  return body;
}

function mapCreatePayload(payload: ClinicalFormCreatePayload): ClinicalFormCreateRequestBody {
  const body: ClinicalFormCreateRequestBody = {
    patient_id: payload.patientId,
    title: payload.title,
    sections: payload.sections.map(mapSectionPayload),
  };
  if (payload.subtitle !== undefined) body.subtitle = payload.subtitle;
  if (payload.header !== undefined) body.header = payload.header;
  return body;
}

function mapUpdatePayload(payload: ClinicalFormUpdatePayload): ClinicalFormUpdateRequestBody {
  const body: ClinicalFormUpdateRequestBody = {};
  if (payload.title !== undefined) body.title = payload.title;
  if (payload.subtitle !== undefined) body.subtitle = payload.subtitle;
  if (payload.header !== undefined) body.header = payload.header;
  if (payload.sections !== undefined) {
    body.sections = payload.sections.map(mapSectionPayload);
  }
  return body;
}

function mapPsychologistActionPayload(
  payload: ClinicalFormPsychologistActionPayload,
): ClinicalFormPsychologistActionRequestBody {
  const body: ClinicalFormPsychologistActionRequestBody = {
    action: payload.action,
  };
  if (payload.scheduledSendAt !== undefined) body.scheduled_send_at = payload.scheduledSendAt;
  if (payload.reviewNote !== undefined) body.review_note = payload.reviewNote;
  return body;
}

function mapPatientActionPayload(
  payload: ClinicalFormPatientActionPayload,
): ClinicalFormPatientActionRequestBody {
  const body: ClinicalFormPatientActionRequestBody = {
    action: payload.action,
  };
  if (payload.answers !== undefined) body.answers = payload.answers;
  return body;
}

function mapTimeline(payload: ClinicalFormTimelineBody): ClinicalFormTimelineEvent {
  return {
    id: payload.id,
    formId: payload.form_id,
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
  return query.length > 0 ? `/forms?${query}` : "/forms";
}

export function createFormsApiClient(options: CreateFormsApiClientOptions = {}): FormsApiClient {
  const baseUrl = (options.baseUrl ?? getApiBaseUrl()).replace(/\/$/, "");
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    async createForm(accessToken: string, payload: ClinicalFormCreatePayload): Promise<ClinicalFormCreateResult> {
      const response = await requestJson<ClinicalFormCreateBody>(fetchImpl, baseUrl, "/forms", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify(mapCreatePayload(payload)),
      });
      return {
        ...mapDetail(response),
        patientAccessToken: response.patient_access_token,
        patientAccessLink: response.patient_access_link,
      };
    },

    async listForms(
      accessToken: string,
      options?: {
        patientId?: string;
        statusFilter?: string;
        limit?: number;
      },
    ): Promise<ClinicalFormListItem[]> {
      const response = await requestJson<ClinicalFormListItemBody[]>(
        fetchImpl,
        baseUrl,
        buildListPath(options),
        {
          method: "GET",
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );
      return response.map(mapListItem);
    },

    async listReceivedResponses(accessToken: string, limit = 200): Promise<ClinicalFormDetail[]> {
      const response = await requestJson<ClinicalFormDetailBody[]>(
        fetchImpl,
        baseUrl,
        `/forms/responses?limit=${limit}`,
        {
          method: "GET",
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );
      return response.map(mapDetail);
    },

    async getForm(accessToken: string, formId: string): Promise<ClinicalFormDetail> {
      const response = await requestJson<ClinicalFormDetailBody>(
        fetchImpl,
        baseUrl,
        `/forms/${formId}`,
        {
          method: "GET",
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );
      return mapDetail(response);
    },

    async updateForm(
      accessToken: string,
      formId: string,
      payload: ClinicalFormUpdatePayload,
    ): Promise<ClinicalFormDetail> {
      const response = await requestJson<ClinicalFormDetailBody>(
        fetchImpl,
        baseUrl,
        `/forms/${formId}`,
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
      formId: string,
      payload: ClinicalFormPsychologistActionPayload,
    ): Promise<ClinicalFormDetail> {
      const response = await requestJson<ClinicalFormDetailBody>(
        fetchImpl,
        baseUrl,
        `/forms/${formId}/actions`,
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
      formId: string,
      limit = 200,
    ): Promise<ClinicalFormTimelineEvent[]> {
      const response = await requestJson<ClinicalFormTimelineBody[]>(
        fetchImpl,
        baseUrl,
        `/forms/${formId}/timeline-events?limit=${limit}`,
        {
          method: "GET",
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );
      return response.map(mapTimeline);
    },

    async listPublicForms(patientAccessToken: string): Promise<ClinicalFormPublicList> {
      const response = await requestJson<ClinicalFormPublicListBody>(
        fetchImpl,
        baseUrl,
        `/form-links/${patientAccessToken}/forms`,
        {
          method: "GET",
        },
      );
      return {
        patientId: response.patient_id,
        patientName: response.patient_name,
        forms: response.forms.map(mapDetail),
      };
    },

    async applyPublicAction(
      patientAccessToken: string,
      formId: string,
      payload: ClinicalFormPatientActionPayload,
    ): Promise<ClinicalFormPublicActionResult> {
      const response = await requestJson<ClinicalFormPublicActionBody>(
        fetchImpl,
        baseUrl,
        `/form-links/${patientAccessToken}/forms/${formId}/actions`,
        {
          method: "POST",
          body: JSON.stringify(mapPatientActionPayload(payload)),
        },
      );
      return {
        form: mapDetail(response.form),
      };
    },

    async runDispatchScheduler(accessToken: string): Promise<FormsDispatchRunResult> {
      const response = await requestJson<FormsDispatchRunBody>(
        fetchImpl,
        baseUrl,
        "/scheduler/forms-dispatch/run",
        {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );
      return {
        processed: response.processed,
        dispatched: response.dispatched,
      };
    },
  };
}
