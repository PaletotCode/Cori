from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Cori V2 API"
    app_version: str = "0.1.0"
    app_env: str = "development"

    database_url: str = "postgresql+psycopg://cori:cori@postgres:5432/cori"
    redis_url: str = "redis://redis:6379/0"
    worker_heartbeat_seconds: int = 20
    worker_enable_session_reminders: bool = False
    worker_enable_activities_overdue: bool = False
    worker_enable_activities_dispatch: bool = False
    worker_enable_forms_dispatch: bool = False
    worker_max_jobs_per_cycle: int = 100
    worker_job_claim_timeout_seconds: int = 1
    worker_job_max_attempts: int = 5
    worker_retry_backoff_base_seconds: int = 2
    worker_retry_backoff_max_seconds: int = 120
    notification_delivery_mode: str = "inline"
    realtime_pubsub_channel: str = "cori:realtime:notifications"
    realtime_publish_circuit_failures_threshold: int = 5
    realtime_publish_circuit_cooldown_seconds: int = 30
    jwt_secret_key: str = "change-me-in-env"
    jwt_algorithm: str = "HS256"
    access_token_exp_minutes: int = 30
    refresh_token_exp_days: int = 15
    google_oauth_client_id: str = ""
    google_oauth_ios_client_id: str = ""
    google_oauth_client_secret: str = ""
    google_oauth_token_url: str = "https://oauth2.googleapis.com/token"
    google_oauth_userinfo_url: str = "https://openidconnect.googleapis.com/v1/userinfo"
    google_oauth_http_timeout_seconds: int = 8
    google_oauth_allowed_redirect_uris: str = ""
    patient_invite_base_url: str = "http://localhost:8081/paciente/convite"
    patient_sessions_base_url: str = "http://localhost:8081/paciente/sessoes"
    patient_activities_base_url: str = "http://localhost:8081/paciente/atividades"
    patient_forms_base_url: str = "http://localhost:8081/paciente/formularios"

    model_config = SettingsConfigDict(
        env_file=(".env", "backend/.env"),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
