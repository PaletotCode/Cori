export interface LoginRequest {
  email: string;
  password: string;
}

export interface TokenPairResponse {
  access_token: string;
  refresh_token: string;
  token_type: "bearer";
  access_expires_in: number;
  refresh_expires_in: number;
}

export interface RefreshRequest {
  refresh_token: string;
}

export interface LogoutRequest {
  refresh_token: string;
}

export interface LogoutResponse {
  success: boolean;
}

export interface ProfileResponse {
  user_id: string;
  tenant_id: string;
  psychologist_id: string | null;
  email: string;
  full_name: string;
  onboarding_completed: boolean;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  accessExpiresIn: number;
  refreshExpiresIn: number;
}

export interface AuthProfile {
  userId: string;
  tenantId: string;
  psychologistId: string | null;
  email: string;
  fullName: string;
  onboardingCompleted: boolean;
}

export interface AuthApiErrorPayload {
  detail?: string;
}
