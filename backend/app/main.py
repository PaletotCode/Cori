from fastapi import FastAPI

from app.api.routes_activities import router as activities_router
from app.api.routes_auth import router as auth_router
from app.api.routes_forms import router as forms_router
from app.api.routes_health import router as health_router
from app.api.routes_notifications import router as notifications_router
from app.api.routes_patients import router as patients_router
from app.api.routes_practice_profile import router as practice_profile_router
from app.api.routes_realtime import router as realtime_router
from app.api.routes_sessions import router as sessions_router
from app.api.routes_triage import router as triage_router
from app.core.config import settings
from app.core.tenant_middleware import TenantContextMiddleware


def create_app() -> FastAPI:
    app = FastAPI(title=settings.app_name, version=settings.app_version)
    app.add_middleware(TenantContextMiddleware)
    app.include_router(activities_router)
    app.include_router(auth_router)
    app.include_router(forms_router)
    app.include_router(notifications_router)
    app.include_router(practice_profile_router)
    app.include_router(triage_router)
    app.include_router(patients_router)
    app.include_router(sessions_router)
    app.include_router(realtime_router)
    app.include_router(health_router)
    return app


app = create_app()
