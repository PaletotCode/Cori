from datetime import UTC, datetime

from fastapi import APIRouter, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.core.db import check_database
from app.core.redis_client import check_redis

router = APIRouter(tags=["health"])


class DependencyStatus(BaseModel):
    database: str
    redis: str


class HealthResponse(BaseModel):
    status: str
    timestamp_utc: datetime
    dependencies: DependencyStatus


@router.get("/", include_in_schema=False)
def root() -> dict[str, str]:
    return {"service": "cori-v2-api", "docs": "/docs", "health": "/health"}


@router.get("/health", response_model=HealthResponse)
def healthcheck() -> JSONResponse:
    db_ok = check_database()
    redis_ok = check_redis()

    payload = HealthResponse(
        status="ok" if db_ok and redis_ok else "degraded",
        timestamp_utc=datetime.now(UTC),
        dependencies=DependencyStatus(
            database="ok" if db_ok else "down",
            redis="ok" if redis_ok else "down",
        ),
    )

    status_code = status.HTTP_200_OK if db_ok and redis_ok else status.HTTP_503_SERVICE_UNAVAILABLE
    return JSONResponse(status_code=status_code, content=payload.model_dump(mode="json"))
