from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.dependencies import AuthContext, get_auth_context, get_tenant_db
from app.schemas.panel import (
    PanelCardKey,
    PanelCardPreferencesPatchRequest,
    PanelCardPreferencesPutRequest,
    PanelCardPreferencesResponse,
    PanelKpisResponse,
    PanelPreferencesResponse,
)
from app.services.panel_service import PanelServiceError, panel_service

router = APIRouter(tags=["panel"])


@router.get("/panel/kpis", response_model=PanelKpisResponse)
def get_panel_kpis(
    timezone: str | None = Query(default=None),
    context: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_tenant_db),
) -> PanelKpisResponse:
    try:
        return panel_service.get_panel_kpis(
            db,
            tenant_id=context.tenant_id,
            user_id=context.user_id,
            timezone_name=timezone,
        )
    except PanelServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc


@router.get("/panel/preferences", response_model=PanelPreferencesResponse)
def list_panel_preferences(
    context: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_tenant_db),
) -> PanelPreferencesResponse:
    try:
        return panel_service.list_preferences(
            db,
            tenant_id=context.tenant_id,
            user_id=context.user_id,
        )
    except PanelServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc


@router.put("/panel/preferences/{card_key}", response_model=PanelCardPreferencesResponse)
def put_panel_card_preference(
    card_key: PanelCardKey,
    payload: PanelCardPreferencesPutRequest,
    context: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_tenant_db),
) -> PanelCardPreferencesResponse:
    try:
        return panel_service.put_card_preference(
            db,
            tenant_id=context.tenant_id,
            user_id=context.user_id,
            card_key=card_key,
            carousel_enabled=payload.carousel_enabled,
            display_mode=payload.display_mode,
            fixed_item=payload.fixed_item,
            order=payload.order,
        )
    except PanelServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc


@router.patch("/panel/preferences/{card_key}", response_model=PanelCardPreferencesResponse)
def patch_panel_card_preference(
    card_key: PanelCardKey,
    payload: PanelCardPreferencesPatchRequest,
    context: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_tenant_db),
) -> PanelCardPreferencesResponse:
    try:
        return panel_service.patch_card_preference(
            db,
            tenant_id=context.tenant_id,
            user_id=context.user_id,
            card_key=card_key,
            payload=payload,
        )
    except PanelServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
