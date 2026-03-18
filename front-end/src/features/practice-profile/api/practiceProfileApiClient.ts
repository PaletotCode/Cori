import { getApiBaseUrl } from "../../../shared/config/env";
import type {
  PracticeProfile,
  PracticeProfileApiErrorPayload,
  PracticeProfileResponse,
  PracticeProfileUpsertPayload,
} from "./types";

export class PracticeProfileApiError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "PracticeProfileApiError";
    this.statusCode = statusCode;
  }
}

export interface PracticeProfileApiClient {
  get: (accessToken: string) => Promise<PracticeProfile>;
  upsert: (accessToken: string, payload: PracticeProfileUpsertPayload) => Promise<PracticeProfile>;
}

interface CreatePracticeProfileApiClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

function mapProfile(payload: PracticeProfileResponse): PracticeProfile {
  return {
    id: payload.id,
    tenantId: payload.tenant_id,
    practiceName: payload.practice_name,
    clinicalApproach: payload.clinical_approach,
    serviceModality: payload.service_modality,
    inPersonAddress: payload.in_person_address,
    sessionPriceCents: payload.session_price_cents,
    currency: payload.currency,
    lateCancellationWindowHours: payload.late_cancellation_window_hours,
    lateCancellationFeePercent: payload.late_cancellation_fee_percent,
    noShowFeePercent: payload.no_show_fee_percent,
    notificationEmailEnabled: payload.notification_email_enabled,
    notificationWhatsappEnabled: payload.notification_whatsapp_enabled,
    notificationPushEnabled: payload.notification_push_enabled,
    sessionReminderHoursBefore: payload.session_reminder_hours_before,
    defaultTriageMode: payload.default_triage_mode,
    defaultTriageMessage: payload.default_triage_message,
    onboardingCompleted: payload.onboarding_completed,
    createdAt: payload.created_at,
    updatedAt: payload.updated_at,
  };
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
    const payload = (parsedBody ?? {}) as PracticeProfileApiErrorPayload;
    throw new PracticeProfileApiError(
      payload.detail ?? "Falha ao carregar configuracao da clinica.",
      response.status,
    );
  }

  return parsedBody as TResponse;
}

export function createPracticeProfileApiClient(
  options: CreatePracticeProfileApiClientOptions = {},
): PracticeProfileApiClient {
  const baseUrl = (options.baseUrl ?? getApiBaseUrl()).replace(/\/$/, "");
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    async get(accessToken: string): Promise<PracticeProfile> {
      const payload = await requestJson<PracticeProfileResponse>(fetchImpl, baseUrl, "/practice-profile", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      return mapProfile(payload);
    },

    async upsert(accessToken: string, payload: PracticeProfileUpsertPayload): Promise<PracticeProfile> {
      const response = await requestJson<PracticeProfileResponse>(
        fetchImpl,
        baseUrl,
        "/practice-profile",
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(payload),
        },
      );
      return mapProfile(response);
    },
  };
}
