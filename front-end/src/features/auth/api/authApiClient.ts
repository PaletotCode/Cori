import { getApiBaseUrl } from "../../../shared/config/env";
import type {
  AuthApiErrorPayload,
  CompleteOnboardingRequest,
  AuthProfile,
  AuthTokens,
  GoogleOAuthExchangeRequest,
  LoginRequest,
  LogoutRequest,
  LogoutResponse,
  ProfileResponse,
  RefreshRequest,
  TokenPairResponse,
} from "./types";

export class AuthApiError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "AuthApiError";
    this.statusCode = statusCode;
  }
}

export interface AuthApiClient {
  login: (payload: LoginRequest) => Promise<AuthTokens>;
  exchangeGoogleCode: (payload: GoogleOAuthExchangeRequest) => Promise<AuthTokens>;
  completeOnboarding: (
    accessToken: string,
    payload: CompleteOnboardingRequest,
  ) => Promise<AuthProfile>;
  refresh: (payload: RefreshRequest) => Promise<AuthTokens>;
  logout: (payload: LogoutRequest) => Promise<LogoutResponse>;
  me: (accessToken: string) => Promise<AuthProfile>;
}

interface CreateAuthApiClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

interface ApiValidationItem {
  msg?: unknown;
  loc?: unknown;
}

function mapTokens(payload: TokenPairResponse): AuthTokens {
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    accessExpiresIn: payload.access_expires_in,
    refreshExpiresIn: payload.refresh_expires_in,
  };
}

function mapProfile(payload: ProfileResponse): AuthProfile {
  return {
    userId: payload.user_id,
    tenantId: payload.tenant_id,
    psychologistId: payload.psychologist_id,
    email: payload.email,
    fullName: payload.full_name,
    onboardingCompleted: payload.onboarding_completed,
  };
}

function mapGoogleExchangePayload(payload: GoogleOAuthExchangeRequest): {
  code: string;
  tenant_id: string;
  redirect_uri: string;
  role: "psychologist" | "patient";
  state_nonce: string;
  code_verifier: string;
  intake_access_code?: string;
} {
  const requestPayload: {
    code: string;
    tenant_id: string;
    redirect_uri: string;
    role: "psychologist" | "patient";
    state_nonce: string;
    code_verifier: string;
    intake_access_code?: string;
  } = {
    code: payload.code,
    tenant_id: payload.tenantId,
    redirect_uri: payload.redirectUri,
    role: payload.role,
    state_nonce: payload.stateNonce,
    code_verifier: payload.codeVerifier,
  };
  if (payload.intakeAccessCode !== undefined) {
    requestPayload.intake_access_code = payload.intakeAccessCode;
  }
  return requestPayload;
}

function mapCompleteOnboardingPayload(payload: CompleteOnboardingRequest): {
  display_name: string;
  clinical_approach: string;
  service_modality: "online" | "presential" | "hybrid";
} {
  return {
    display_name: payload.displayName,
    clinical_approach: payload.clinicalApproach,
    service_modality: payload.serviceModality,
  };
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

function resolveErrorMessage(
  parsedBody: unknown,
  fallbackMessage: string,
): string {
  const payload = (parsedBody ?? {}) as AuthApiErrorPayload;
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
    throw new AuthApiError(
      resolveErrorMessage(parsedBody, "Falha na requisicao de autenticacao."),
      response.status,
    );
  }

  return parsedBody as TResponse;
}

export function createAuthApiClient(options: CreateAuthApiClientOptions = {}): AuthApiClient {
  const baseUrl = (options.baseUrl ?? getApiBaseUrl()).replace(/\/$/, "");
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    async login(payload: LoginRequest): Promise<AuthTokens> {
      const response = await requestJson<TokenPairResponse>(fetchImpl, baseUrl, "/auth/login", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      return mapTokens(response);
    },

    async exchangeGoogleCode(payload: GoogleOAuthExchangeRequest): Promise<AuthTokens> {
      const response = await requestJson<TokenPairResponse>(
        fetchImpl,
        baseUrl,
        "/auth/google/exchange",
        {
          method: "POST",
          body: JSON.stringify(mapGoogleExchangePayload(payload)),
        },
      );
      return mapTokens(response);
    },

    async completeOnboarding(
      accessToken: string,
      payload: CompleteOnboardingRequest,
    ): Promise<AuthProfile> {
      const response = await requestJson<ProfileResponse>(
        fetchImpl,
        baseUrl,
        "/auth/onboarding/complete",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(mapCompleteOnboardingPayload(payload)),
        },
      );
      return mapProfile(response);
    },

    async refresh(payload: RefreshRequest): Promise<AuthTokens> {
      const response = await requestJson<TokenPairResponse>(fetchImpl, baseUrl, "/auth/refresh", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      return mapTokens(response);
    },

    async logout(payload: LogoutRequest): Promise<LogoutResponse> {
      return requestJson<LogoutResponse>(fetchImpl, baseUrl, "/auth/logout", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },

    async me(accessToken: string): Promise<AuthProfile> {
      const response = await requestJson<ProfileResponse>(fetchImpl, baseUrl, "/auth/me", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      return mapProfile(response);
    },
  };
}
