import { getApiBaseUrl } from "../../../shared/config/env";
import type {
  IntakeDetail,
  IntakeInviteCreatePayload,
  IntakeInviteCreateResult,
  IntakePublicSubmitPayload,
  IntakePublicSubmitResult,
  IntakePublicView,
  IntakeQueueItem,
  IntakeReviewPayload,
  IntakeReviewResult,
  TimelineEvent,
  TriageApiErrorPayload,
} from "./types";

export class TriageApiError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "TriageApiError";
    this.statusCode = statusCode;
  }
}

interface IntakeCustomQuestionResponse {
  question_id: string;
  prompt: string;
  required: boolean;
}

interface IntakeInviteCreateRequestBody {
  mode: "simple_invite" | "custom_triage";
  expires_in_hours: number;
  invite_message?: string;
  custom_questions?: Array<{
    prompt: string;
    required: boolean;
  }>;
}

interface IntakeInviteCreateResponseBody {
  intake_id: string;
  mode: "simple_invite" | "custom_triage";
  status:
    | "pending_submission"
    | "submitted"
    | "complement_requested"
    | "approved"
    | "rejected"
    | "expired";
  invite_token: string;
  invite_link: string;
  invite_expires_at: string;
}

interface IntakePublicViewResponseBody {
  intake_id: string;
  mode: "simple_invite" | "custom_triage";
  status:
    | "pending_submission"
    | "submitted"
    | "complement_requested"
    | "approved"
    | "rejected"
    | "expired";
  invite_expires_at: string;
  practice_name: string | null;
  invite_message: string | null;
  requires_custom_triage: boolean;
  custom_questions: IntakeCustomQuestionResponse[];
  complement_request_note: string | null;
}

interface IntakePublicSubmitRequestBody {
  patient_full_name: string;
  patient_email?: string;
  patient_phone?: string;
  consent_terms_accepted: boolean;
  consent_privacy_accepted: boolean;
  triage_answers?: Record<string, string>;
}

interface IntakePublicSubmitResponseBody {
  intake_id: string;
  status:
    | "pending_submission"
    | "submitted"
    | "complement_requested"
    | "approved"
    | "rejected"
    | "expired";
  submitted_at: string | null;
}

interface IntakeQueueItemResponseBody {
  intake_id: string;
  mode: "simple_invite" | "custom_triage";
  status:
    | "pending_submission"
    | "submitted"
    | "complement_requested"
    | "approved"
    | "rejected"
    | "expired";
  invite_expires_at: string;
  opened_at: string | null;
  submitted_at: string | null;
  patient_full_name: string | null;
  patient_email: string | null;
  patient_phone: string | null;
  complement_request_note: string | null;
  activated_patient_id: string | null;
  has_triage_answers: boolean;
}

interface IntakeDetailResponseBody {
  intake_id: string;
  mode: "simple_invite" | "custom_triage";
  status:
    | "pending_submission"
    | "submitted"
    | "complement_requested"
    | "approved"
    | "rejected"
    | "expired";
  invite_expires_at: string;
  opened_at: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  activated_at: string | null;
  patient_full_name: string | null;
  patient_email: string | null;
  patient_phone: string | null;
  custom_questions: IntakeCustomQuestionResponse[];
  triage_answers: Record<string, string> | null;
  review_note: string | null;
  complement_request_note: string | null;
  activated_patient_id: string | null;
}

interface IntakeReviewRequestBody {
  action: "approve" | "reject" | "request_complement";
  note?: string;
}

interface IntakeReviewResponseBody {
  intake_id: string;
  status:
    | "pending_submission"
    | "submitted"
    | "complement_requested"
    | "approved"
    | "rejected"
    | "expired";
  reviewed_at: string | null;
  activated_patient_id: string | null;
}

interface TimelineEventResponseBody {
  id: string;
  intake_id: string | null;
  patient_id: string | null;
  event_type: string;
  actor_type: string;
  actor_id: string | null;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface TriageApiClient {
  createInvite: (accessToken: string, payload: IntakeInviteCreatePayload) => Promise<IntakeInviteCreateResult>;
  getQueue: (accessToken: string, statuses?: string[]) => Promise<IntakeQueueItem[]>;
  getIntakeDetail: (accessToken: string, intakeId: string) => Promise<IntakeDetail>;
  reviewIntake: (
    accessToken: string,
    intakeId: string,
    payload: IntakeReviewPayload,
  ) => Promise<IntakeReviewResult>;
  getTimelineEvents: (
    accessToken: string,
    options?: { intakeId?: string; limit?: number },
  ) => Promise<TimelineEvent[]>;
  getPublicIntake: (inviteToken: string) => Promise<IntakePublicView>;
  submitPublicIntake: (
    inviteToken: string,
    payload: IntakePublicSubmitPayload,
  ) => Promise<IntakePublicSubmitResult>;
}

interface CreateTriageApiClientOptions {
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
    const payload = (parsedBody ?? {}) as TriageApiErrorPayload;
    throw new TriageApiError(payload.detail ?? "Falha na requisicao de triagem.", response.status);
  }

  return parsedBody as TResponse;
}

function mapCustomQuestion(question: IntakeCustomQuestionResponse) {
  return {
    questionId: question.question_id,
    prompt: question.prompt,
    required: question.required,
  };
}

function mapInviteCreatePayload(payload: IntakeInviteCreatePayload): IntakeInviteCreateRequestBody {
  const body: IntakeInviteCreateRequestBody = {
    mode: payload.mode,
    expires_in_hours: payload.expiresInHours,
  };
  if (payload.inviteMessage !== undefined) {
    body.invite_message = payload.inviteMessage;
  }
  if (payload.customQuestions !== undefined) {
    body.custom_questions = payload.customQuestions;
  }
  return body;
}

function mapInviteCreateResponse(payload: IntakeInviteCreateResponseBody): IntakeInviteCreateResult {
  return {
    intakeId: payload.intake_id,
    mode: payload.mode,
    status: payload.status,
    inviteToken: payload.invite_token,
    inviteLink: payload.invite_link,
    inviteExpiresAt: payload.invite_expires_at,
  };
}

function mapPublicView(payload: IntakePublicViewResponseBody): IntakePublicView {
  return {
    intakeId: payload.intake_id,
    mode: payload.mode,
    status: payload.status,
    inviteExpiresAt: payload.invite_expires_at,
    practiceName: payload.practice_name,
    inviteMessage: payload.invite_message,
    requiresCustomTriage: payload.requires_custom_triage,
    customQuestions: payload.custom_questions.map(mapCustomQuestion),
    complementRequestNote: payload.complement_request_note,
  };
}

function mapPublicSubmitPayload(payload: IntakePublicSubmitPayload): IntakePublicSubmitRequestBody {
  const body: IntakePublicSubmitRequestBody = {
    patient_full_name: payload.patientFullName,
    consent_terms_accepted: payload.consentTermsAccepted,
    consent_privacy_accepted: payload.consentPrivacyAccepted,
  };
  if (payload.patientEmail !== undefined) {
    body.patient_email = payload.patientEmail;
  }
  if (payload.patientPhone !== undefined) {
    body.patient_phone = payload.patientPhone;
  }
  if (payload.triageAnswers !== undefined) {
    body.triage_answers = payload.triageAnswers;
  }
  return body;
}

function mapPublicSubmitResponse(payload: IntakePublicSubmitResponseBody): IntakePublicSubmitResult {
  return {
    intakeId: payload.intake_id,
    status: payload.status,
    submittedAt: payload.submitted_at,
  };
}

function mapQueueItem(payload: IntakeQueueItemResponseBody): IntakeQueueItem {
  return {
    intakeId: payload.intake_id,
    mode: payload.mode,
    status: payload.status,
    inviteExpiresAt: payload.invite_expires_at,
    openedAt: payload.opened_at,
    submittedAt: payload.submitted_at,
    patientFullName: payload.patient_full_name,
    patientEmail: payload.patient_email,
    patientPhone: payload.patient_phone,
    complementRequestNote: payload.complement_request_note,
    activatedPatientId: payload.activated_patient_id,
    hasTriageAnswers: payload.has_triage_answers,
  };
}

function mapIntakeDetail(payload: IntakeDetailResponseBody): IntakeDetail {
  return {
    intakeId: payload.intake_id,
    mode: payload.mode,
    status: payload.status,
    inviteExpiresAt: payload.invite_expires_at,
    openedAt: payload.opened_at,
    submittedAt: payload.submitted_at,
    reviewedAt: payload.reviewed_at,
    activatedAt: payload.activated_at,
    patientFullName: payload.patient_full_name,
    patientEmail: payload.patient_email,
    patientPhone: payload.patient_phone,
    customQuestions: payload.custom_questions.map(mapCustomQuestion),
    triageAnswers: payload.triage_answers,
    reviewNote: payload.review_note,
    complementRequestNote: payload.complement_request_note,
    activatedPatientId: payload.activated_patient_id,
  };
}

function mapReviewPayload(payload: IntakeReviewPayload): IntakeReviewRequestBody {
  const body: IntakeReviewRequestBody = {
    action: payload.action,
  };
  if (payload.note !== undefined) {
    body.note = payload.note;
  }
  return body;
}

function mapReviewResponse(payload: IntakeReviewResponseBody): IntakeReviewResult {
  return {
    intakeId: payload.intake_id,
    status: payload.status,
    reviewedAt: payload.reviewed_at,
    activatedPatientId: payload.activated_patient_id,
  };
}

function mapTimelineEvent(payload: TimelineEventResponseBody): TimelineEvent {
  return {
    id: payload.id,
    intakeId: payload.intake_id,
    patientId: payload.patient_id,
    eventType: payload.event_type,
    actorType: payload.actor_type,
    actorId: payload.actor_id,
    payload: payload.payload,
    createdAt: payload.created_at,
  };
}

export function createTriageApiClient(options: CreateTriageApiClientOptions = {}): TriageApiClient {
  const baseUrl = (options.baseUrl ?? getApiBaseUrl()).replace(/\/$/, "");
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    async createInvite(accessToken, payload): Promise<IntakeInviteCreateResult> {
      const response = await requestJson<IntakeInviteCreateResponseBody>(
        fetchImpl,
        baseUrl,
        "/intakes/invites",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(mapInviteCreatePayload(payload)),
        },
      );
      return mapInviteCreateResponse(response);
    },

    async getQueue(accessToken, statuses): Promise<IntakeQueueItem[]> {
      const query =
        statuses && statuses.length > 0
          ? `?statuses=${encodeURIComponent(statuses.join(","))}`
          : "";
      const response = await requestJson<IntakeQueueItemResponseBody[]>(
        fetchImpl,
        baseUrl,
        `/intakes/queue${query}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );
      return response.map(mapQueueItem);
    },

    async getIntakeDetail(accessToken, intakeId): Promise<IntakeDetail> {
      const response = await requestJson<IntakeDetailResponseBody>(
        fetchImpl,
        baseUrl,
        `/intakes/${encodeURIComponent(intakeId)}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );
      return mapIntakeDetail(response);
    },

    async reviewIntake(accessToken, intakeId, payload): Promise<IntakeReviewResult> {
      const response = await requestJson<IntakeReviewResponseBody>(
        fetchImpl,
        baseUrl,
        `/intakes/${encodeURIComponent(intakeId)}/review`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(mapReviewPayload(payload)),
        },
      );
      return mapReviewResponse(response);
    },

    async getTimelineEvents(accessToken, options): Promise<TimelineEvent[]> {
      const searchParams = new URLSearchParams();
      if (options?.intakeId) {
        searchParams.set("intake_id", options.intakeId);
      }
      if (options?.limit) {
        searchParams.set("limit", String(options.limit));
      }
      const query = searchParams.toString();
      const response = await requestJson<TimelineEventResponseBody[]>(
        fetchImpl,
        baseUrl,
        `/intakes/timeline-events${query.length > 0 ? `?${query}` : ""}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );
      return response.map(mapTimelineEvent);
    },

    async getPublicIntake(inviteToken): Promise<IntakePublicView> {
      const response = await requestJson<IntakePublicViewResponseBody>(
        fetchImpl,
        baseUrl,
        `/intake-links/${encodeURIComponent(inviteToken)}`,
        {
          method: "GET",
        },
      );
      return mapPublicView(response);
    },

    async submitPublicIntake(inviteToken, payload): Promise<IntakePublicSubmitResult> {
      const response = await requestJson<IntakePublicSubmitResponseBody>(
        fetchImpl,
        baseUrl,
        `/intake-links/${encodeURIComponent(inviteToken)}/submit`,
        {
          method: "POST",
          body: JSON.stringify(mapPublicSubmitPayload(payload)),
        },
      );
      return mapPublicSubmitResponse(response);
    },
  };
}
