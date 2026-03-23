import { getApiBaseUrl } from "../../../shared/config/env";
import type {
  IntakeDetail,
  IntakeInviteCreatePayload,
  IntakeInviteCreateResult,
  IntakePatientSubmitPayload,
  IntakePatientSubmitResult,
  IntakeQueueItem,
  IntakeRotateCodePayload,
  IntakeRotateCodeResult,
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
  access_code_alias?: string;
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
  access_code: string;
  access_code_expires_at: string;
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
  access_code_expires_at: string | null;
  opened_at: string | null;
  submitted_at: string | null;
  patient_full_name: string | null;
  patient_preferred_name: string | null;
  patient_email: string | null;
  patient_phone: string | null;
  patient_birth_date: string | null;
  patient_pronouns: string | null;
  patient_emergency_contact_name: string | null;
  patient_emergency_contact_phone: string | null;
  patient_profile_photo_url: string | null;
  patient_profile_banner_url: string | null;
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
  access_code_expires_at: string | null;
  opened_at: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  activated_at: string | null;
  patient_full_name: string | null;
  patient_preferred_name: string | null;
  patient_email: string | null;
  patient_phone: string | null;
  patient_birth_date: string | null;
  patient_pronouns: string | null;
  patient_emergency_contact_name: string | null;
  patient_emergency_contact_phone: string | null;
  patient_communication_notes: string | null;
  patient_profile_photo_url: string | null;
  patient_profile_banner_url: string | null;
  custom_questions: IntakeCustomQuestionResponse[];
  triage_answers: Record<string, string> | null;
  review_note: string | null;
  complement_request_note: string | null;
  activated_patient_id: string | null;
}

interface IntakePatientSubmitRequestBody {
  patient_full_name: string;
  patient_preferred_name?: string;
  patient_email?: string;
  patient_phone?: string;
  patient_birth_date?: string;
  patient_pronouns?: string;
  patient_emergency_contact_name?: string;
  patient_emergency_contact_phone?: string;
  patient_communication_notes?: string;
  patient_profile_photo_url?: string;
  patient_profile_banner_url?: string;
  consent_terms_accepted: true;
  consent_privacy_accepted: true;
}

interface IntakePatientSubmitResponseBody {
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

interface IntakeRotateCodeRequestBody {
  alias?: string;
}

interface IntakeRotateCodeResponseBody {
  intake_id: string;
  access_code: string;
  access_code_expires_at: string;
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
  getPatientIntake: (accessToken: string) => Promise<IntakeDetail>;
  submitPatientIntake: (
    accessToken: string,
    payload: IntakePatientSubmitPayload,
  ) => Promise<IntakePatientSubmitResult>;
  reviewIntake: (
    accessToken: string,
    intakeId: string,
    payload: IntakeReviewPayload,
  ) => Promise<IntakeReviewResult>;
  rotateAccessCode: (
    accessToken: string,
    intakeId: string,
    payload?: IntakeRotateCodePayload,
  ) => Promise<IntakeRotateCodeResult>;
  getTimelineEvents: (
    accessToken: string,
    options?: { intakeId?: string; limit?: number },
  ) => Promise<TimelineEvent[]>;
}

interface CreateTriageApiClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

interface ApiValidationItem {
  msg?: unknown;
  loc?: unknown;
}

function stringifyLoc(loc: unknown): string | null {
  if (!Array.isArray(loc)) {
    return null;
  }
  const tokens = loc
    .map((chunk) =>
      typeof chunk === "string" || typeof chunk === "number" ? String(chunk) : null,
    )
    .filter((chunk): chunk is string => chunk !== null);
  return tokens.length > 0 ? tokens.join(".") : null;
}

function extractDetailMessage(detail: unknown): string | null {
  if (typeof detail === "string" && detail.trim().length > 0) {
    return detail.trim();
  }

  if (Array.isArray(detail)) {
    const parts = detail
      .map((entry) => {
        if (typeof entry === "string" && entry.trim().length > 0) {
          return entry.trim();
        }
        if (entry && typeof entry === "object") {
          const validationItem = entry as ApiValidationItem;
          const message =
            typeof validationItem.msg === "string" && validationItem.msg.trim().length > 0
              ? validationItem.msg.trim()
              : null;
          const location = stringifyLoc(validationItem.loc);
          if (message && location) {
            return `${message} (${location})`;
          }
          return message;
        }
        return null;
      })
      .filter((entry): entry is string => entry !== null);

    if (parts.length > 0) {
      return parts.join(" | ");
    }
    return null;
  }

  if (detail && typeof detail === "object") {
    const candidate = detail as Record<string, unknown>;
    const nested =
      extractDetailMessage(candidate.message) ??
      extractDetailMessage(candidate.error) ??
      extractDetailMessage(candidate.detail) ??
      extractDetailMessage(candidate.msg);
    if (nested) {
      return nested;
    }
  }

  return null;
}

function resolveErrorMessage(parsedBody: unknown, fallbackMessage: string): string {
  const payload = (parsedBody ?? {}) as TriageApiErrorPayload;
  return extractDetailMessage(payload.detail) ?? fallbackMessage;
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
  let parsedBody: unknown = null;
  if (rawBody.trim().length > 0) {
    try {
      parsedBody = JSON.parse(rawBody) as unknown;
    } catch {
      parsedBody = { detail: rawBody.trim() };
    }
  }

  if (!response.ok) {
    throw new TriageApiError(
      resolveErrorMessage(parsedBody, "Falha na requisicao de triagem."),
      response.status,
    );
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
  if (payload.accessCodeAlias !== undefined) {
    body.access_code_alias = payload.accessCodeAlias;
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
    accessCode: payload.access_code,
    accessCodeExpiresAt: payload.access_code_expires_at,
  };
}

function mapQueueItem(payload: IntakeQueueItemResponseBody): IntakeQueueItem {
  return {
    intakeId: payload.intake_id,
    mode: payload.mode,
    status: payload.status,
    inviteExpiresAt: payload.invite_expires_at,
    accessCodeExpiresAt: payload.access_code_expires_at,
    openedAt: payload.opened_at,
    submittedAt: payload.submitted_at,
    patientFullName: payload.patient_full_name,
    patientPreferredName: payload.patient_preferred_name,
    patientEmail: payload.patient_email,
    patientPhone: payload.patient_phone,
    patientBirthDate: payload.patient_birth_date,
    patientPronouns: payload.patient_pronouns,
    patientEmergencyContactName: payload.patient_emergency_contact_name,
    patientEmergencyContactPhone: payload.patient_emergency_contact_phone,
    patientProfilePhotoUrl: payload.patient_profile_photo_url,
    patientProfileBannerUrl: payload.patient_profile_banner_url,
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
    accessCodeExpiresAt: payload.access_code_expires_at,
    openedAt: payload.opened_at,
    submittedAt: payload.submitted_at,
    reviewedAt: payload.reviewed_at,
    activatedAt: payload.activated_at,
    patientFullName: payload.patient_full_name,
    patientPreferredName: payload.patient_preferred_name,
    patientEmail: payload.patient_email,
    patientPhone: payload.patient_phone,
    patientBirthDate: payload.patient_birth_date,
    patientPronouns: payload.patient_pronouns,
    patientEmergencyContactName: payload.patient_emergency_contact_name,
    patientEmergencyContactPhone: payload.patient_emergency_contact_phone,
    patientCommunicationNotes: payload.patient_communication_notes,
    patientProfilePhotoUrl: payload.patient_profile_photo_url,
    patientProfileBannerUrl: payload.patient_profile_banner_url,
    customQuestions: payload.custom_questions.map(mapCustomQuestion),
    triageAnswers: payload.triage_answers,
    reviewNote: payload.review_note,
    complementRequestNote: payload.complement_request_note,
    activatedPatientId: payload.activated_patient_id,
  };
}

function mapPatientSubmitPayload(payload: IntakePatientSubmitPayload): IntakePatientSubmitRequestBody {
  const body: IntakePatientSubmitRequestBody = {
    patient_full_name: payload.patientFullName,
    consent_terms_accepted: payload.consentTermsAccepted,
    consent_privacy_accepted: payload.consentPrivacyAccepted,
  };
  if (payload.patientPreferredName !== undefined) {
    body.patient_preferred_name = payload.patientPreferredName;
  }
  if (payload.patientEmail !== undefined) {
    body.patient_email = payload.patientEmail;
  }
  if (payload.patientPhone !== undefined) {
    body.patient_phone = payload.patientPhone;
  }
  if (payload.patientBirthDate !== undefined) {
    body.patient_birth_date = payload.patientBirthDate;
  }
  if (payload.patientPronouns !== undefined) {
    body.patient_pronouns = payload.patientPronouns;
  }
  if (payload.patientEmergencyContactName !== undefined) {
    body.patient_emergency_contact_name = payload.patientEmergencyContactName;
  }
  if (payload.patientEmergencyContactPhone !== undefined) {
    body.patient_emergency_contact_phone = payload.patientEmergencyContactPhone;
  }
  if (payload.patientCommunicationNotes !== undefined) {
    body.patient_communication_notes = payload.patientCommunicationNotes;
  }
  if (payload.patientProfilePhotoUrl !== undefined) {
    body.patient_profile_photo_url = payload.patientProfilePhotoUrl;
  }
  if (payload.patientProfileBannerUrl !== undefined) {
    body.patient_profile_banner_url = payload.patientProfileBannerUrl;
  }
  return body;
}

function mapPatientSubmitResponse(payload: IntakePatientSubmitResponseBody): IntakePatientSubmitResult {
  return {
    intakeId: payload.intake_id,
    status: payload.status,
    submittedAt: payload.submitted_at,
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

function mapRotateCodePayload(payload?: IntakeRotateCodePayload): IntakeRotateCodeRequestBody {
  if (payload?.alias === undefined) {
    return {};
  }
  return {
    alias: payload.alias,
  };
}

function mapRotateCodeResponse(payload: IntakeRotateCodeResponseBody): IntakeRotateCodeResult {
  return {
    intakeId: payload.intake_id,
    accessCode: payload.access_code,
    accessCodeExpiresAt: payload.access_code_expires_at,
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

    async getPatientIntake(accessToken): Promise<IntakeDetail> {
      const response = await requestJson<IntakeDetailResponseBody>(
        fetchImpl,
        baseUrl,
        "/intakes/patient/me",
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );
      return mapIntakeDetail(response);
    },

    async submitPatientIntake(accessToken, payload): Promise<IntakePatientSubmitResult> {
      const response = await requestJson<IntakePatientSubmitResponseBody>(
        fetchImpl,
        baseUrl,
        "/intakes/patient/me/submit",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(mapPatientSubmitPayload(payload)),
        },
      );
      return mapPatientSubmitResponse(response);
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

    async rotateAccessCode(accessToken, intakeId, payload): Promise<IntakeRotateCodeResult> {
      const response = await requestJson<IntakeRotateCodeResponseBody>(
        fetchImpl,
        baseUrl,
        `/intakes/${encodeURIComponent(intakeId)}/access-code/rotate`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(mapRotateCodePayload(payload)),
        },
      );
      return mapRotateCodeResponse(response);
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
  };
}
