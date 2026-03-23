from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class LoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: str = Field(min_length=5, max_length=255)
    password: str = Field(min_length=3, max_length=128)


class GoogleOAuthExchangeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str = Field(min_length=10, max_length=4096)
    tenant_id: str = Field(min_length=1, max_length=255)
    redirect_uri: str = Field(min_length=8, max_length=2048)
    role: Literal["psychologist", "patient"]
    state_nonce: str = Field(min_length=6, max_length=255)
    code_verifier: str = Field(min_length=43, max_length=128)
    intake_access_code: str | None = Field(default=None, min_length=7, max_length=64)


class CompleteOnboardingRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    display_name: str = Field(min_length=2, max_length=180)
    clinical_approach: str = Field(min_length=2, max_length=120)
    service_modality: Literal["online", "presential", "hybrid"]


class RefreshRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    refresh_token: str = Field(min_length=20)


class LogoutRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    refresh_token: str = Field(min_length=20)


class TokenPairResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    access_expires_in: int
    refresh_expires_in: int


class LogoutResponse(BaseModel):
    success: bool


class ProfileResponse(BaseModel):
    user_id: str
    tenant_id: str
    psychologist_id: str | None
    email: str
    full_name: str
    onboarding_completed: bool
