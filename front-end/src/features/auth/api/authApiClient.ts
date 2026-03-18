import { getApiBaseUrl } from "../../../shared/config/env";
import type {
  AuthApiErrorPayload,
  AuthProfile,
  AuthTokens,
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
  refresh: (payload: RefreshRequest) => Promise<AuthTokens>;
  logout: (payload: LogoutRequest) => Promise<LogoutResponse>;
  me: (accessToken: string) => Promise<AuthProfile>;
}

interface CreateAuthApiClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
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
    const payload = (parsedBody ?? {}) as AuthApiErrorPayload;
    throw new AuthApiError(payload.detail ?? "Falha na requisicao de autenticacao.", response.status);
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
