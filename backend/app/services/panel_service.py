from calendar import monthrange
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from typing import Literal, cast
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import status
from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session

from app.models import DashboardCardPreference, PracticeProfile, User
from app.models import Session as ClinicalSession
from app.schemas.panel import (
    BaselineItem,
    PanelCardKey,
    PanelCardPreferencesPatchRequest,
    PanelCardPreferencesResponse,
    PanelDisplayMode,
    PanelKpiCardResponse,
    PanelKpiComparisonResponse,
    PanelKpisResponse,
    PanelPreferencesResponse,
    PanelTrendDirection,
)

CALCULATION_VERSION: Literal["panel_kpi_v1"] = "panel_kpi_v1"
DEFAULT_TIMEZONE = "UTC"

BASELINE_ITEMS: tuple[BaselineItem, ...] = ("yesterday", "weekAgo", "monthAgo")
BASELINE_ITEMS_SET = {"yesterday", "weekAgo", "monthAgo"}
PANEL_CARD_KEYS: tuple[PanelCardKey, ...] = (
    "sessions_today",
    "pending_confirmation",
    "weekly_revenue_forecast",
)
PANEL_CARD_KEYS_SET = {
    "sessions_today",
    "pending_confirmation",
    "weekly_revenue_forecast",
}
DEFAULT_ORDER: list[BaselineItem] = ["yesterday", "weekAgo", "monthAgo"]

VALID_SESSION_STATUSES = ("scheduled", "confirmed", "rescheduled", "completed")
PENDING_CONFIRMATION_STATUSES = ("scheduled", "rescheduled")


@dataclass(frozen=True)
class WindowRange:
    start_at: datetime
    end_at: datetime


class PanelServiceError(Exception):
    def __init__(self, *, status_code: int, detail: str) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


def _utcnow() -> datetime:
    return datetime.now(UTC)


def _shift_month(reference_day: date, *, months: int) -> date:
    total_months = (reference_day.year * 12) + (reference_day.month - 1) + months
    target_year = total_months // 12
    target_month = (total_months % 12) + 1
    max_day = monthrange(target_year, target_month)[1]
    target_day = min(reference_day.day, max_day)
    return date(target_year, target_month, target_day)


def build_comparison(
    *,
    item: BaselineItem,
    current_value: float | None,
    baseline_value: float | None,
    window: WindowRange,
    missing_baseline: bool,
    metadata: dict[str, object] | None = None,
) -> PanelKpiComparisonResponse:
    if current_value is None or baseline_value is None:
        return PanelKpiComparisonResponse(
            item=item,
            baseline_value=baseline_value,
            delta_value=None,
            delta_percent=None,
            trend="unknown",
            comparable=False,
            missing_baseline=missing_baseline,
            window_start_at=window.start_at,
            window_end_at=window.end_at,
            metadata=metadata or {},
        )

    delta_value = current_value - baseline_value
    if delta_value > 0:
        trend: PanelTrendDirection = "up"
    elif delta_value < 0:
        trend = "down"
    else:
        trend = "flat"

    if baseline_value == 0:
        delta_percent = 0.0 if current_value == 0 else None
    else:
        delta_percent = round((delta_value / abs(baseline_value)) * 100, 2)

    return PanelKpiComparisonResponse(
        item=item,
        baseline_value=baseline_value,
        delta_value=delta_value,
        delta_percent=delta_percent,
        trend=trend,
        comparable=True,
        missing_baseline=missing_baseline,
        window_start_at=window.start_at,
        window_end_at=window.end_at,
        metadata=metadata or {},
    )


def _resolve_timezone(timezone_name: str | None) -> ZoneInfo:
    candidate = (timezone_name or "").strip() or DEFAULT_TIMEZONE
    try:
        return ZoneInfo(candidate)
    except ZoneInfoNotFoundError as exc:
        raise PanelServiceError(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="timezone invalido.",
        ) from exc


def _to_day_window(local_day: date, *, tz: ZoneInfo) -> WindowRange:
    local_start = datetime.combine(local_day, time.min, tzinfo=tz)
    local_end = local_start + timedelta(days=1)
    return WindowRange(
        start_at=local_start.astimezone(UTC),
        end_at=local_end.astimezone(UTC),
    )


def _to_week_window(anchor_day: date, *, tz: ZoneInfo) -> WindowRange:
    week_start_day = anchor_day - timedelta(days=anchor_day.weekday())
    local_start = datetime.combine(week_start_day, time.min, tzinfo=tz)
    local_end = local_start + timedelta(days=7)
    return WindowRange(
        start_at=local_start.astimezone(UTC),
        end_at=local_end.astimezone(UTC),
    )


def _baseline_anchor_dates(current_local_day: date) -> dict[BaselineItem, date]:
    return {
        "yesterday": current_local_day - timedelta(days=1),
        "weekAgo": current_local_day - timedelta(days=7),
        "monthAgo": _shift_month(current_local_day, months=-1),
    }


def _to_panel_card_key(card_key: str) -> PanelCardKey:
    if card_key not in PANEL_CARD_KEYS_SET:
        raise PanelServiceError(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="card_key invalido.",
        )
    return cast(PanelCardKey, card_key)


def _to_display_mode(value: str) -> PanelDisplayMode:
    if value not in {"dynamic", "fixed"}:
        raise PanelServiceError(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="display_mode invalido.",
        )
    return cast(PanelDisplayMode, value)


def _to_baseline_item(value: str) -> BaselineItem:
    if value not in BASELINE_ITEMS_SET:
        raise PanelServiceError(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="fixed_item invalido.",
        )
    return cast(BaselineItem, value)


def _normalize_order(order_raw: object, *, allow_fallback: bool) -> list[BaselineItem]:
    if isinstance(order_raw, list):
        as_strings = [str(item) for item in order_raw]
        if (
            len(as_strings) == len(DEFAULT_ORDER)
            and len(set(as_strings)) == len(DEFAULT_ORDER)
            and set(as_strings) == BASELINE_ITEMS_SET
        ):
            return [cast(BaselineItem, item) for item in as_strings]

    if allow_fallback:
        return list(DEFAULT_ORDER)

    raise PanelServiceError(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail="order invalido: use yesterday, weekAgo, monthAgo sem duplicidade.",
    )


class PanelService:
    def _assert_user_belongs_to_tenant(
        self,
        db: Session,
        *,
        tenant_id: UUID,
        user_id: UUID,
    ) -> None:
        user = db.scalar(
            select(User).where(
                User.tenant_id == tenant_id,
                User.id == user_id,
                User.is_active.is_(True),
            )
        )
        if user is None:
            raise PanelServiceError(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Usuario nao encontrado no tenant.",
            )

    def _count_sessions(
        self,
        db: Session,
        *,
        tenant_id: UUID,
        window: WindowRange,
        statuses: tuple[str, ...] | None,
    ) -> int:
        query: Select[tuple[int]] = select(func.count(ClinicalSession.id)).where(
            ClinicalSession.tenant_id == tenant_id,
            ClinicalSession.scheduled_start_at >= window.start_at,
            ClinicalSession.scheduled_start_at < window.end_at,
        )
        if statuses is not None:
            query = query.where(ClinicalSession.status.in_(statuses))
        return int(db.scalar(query) or 0)

    def _default_preferences_for_card(self, card_key: PanelCardKey) -> PanelCardPreferencesResponse:
        return PanelCardPreferencesResponse(
            card_key=card_key,
            carousel_enabled=True,
            display_mode="dynamic",
            fixed_item="yesterday",
            order=list(DEFAULT_ORDER),
        )

    def _serialize_preference(
        self, preference: DashboardCardPreference
    ) -> PanelCardPreferencesResponse:
        return PanelCardPreferencesResponse(
            card_key=_to_panel_card_key(preference.card_key),
            carousel_enabled=preference.carousel_enabled,
            display_mode=_to_display_mode(preference.display_mode),
            fixed_item=_to_baseline_item(preference.fixed_item),
            order=_normalize_order(preference.display_order, allow_fallback=True),
        )

    def _resolve_profile_session_price(
        self, db: Session, *, tenant_id: UUID
    ) -> tuple[int | None, str | None]:
        profile = db.scalar(select(PracticeProfile).where(PracticeProfile.tenant_id == tenant_id))
        if profile is None:
            return None, None
        if profile.session_price_cents <= 0:
            return None, profile.currency
        return profile.session_price_cents, profile.currency

    def get_panel_kpis(
        self,
        db: Session,
        *,
        tenant_id: UUID,
        user_id: UUID,
        timezone_name: str | None,
    ) -> PanelKpisResponse:
        self._assert_user_belongs_to_tenant(db, tenant_id=tenant_id, user_id=user_id)
        tz = _resolve_timezone(timezone_name)
        now_utc = _utcnow()
        current_local_day = now_utc.astimezone(tz).date()
        baseline_anchors = _baseline_anchor_dates(current_local_day)

        current_day_window = _to_day_window(current_local_day, tz=tz)
        sessions_today_current = self._count_sessions(
            db,
            tenant_id=tenant_id,
            window=current_day_window,
            statuses=VALID_SESSION_STATUSES,
        )
        pending_today_current = self._count_sessions(
            db,
            tenant_id=tenant_id,
            window=current_day_window,
            statuses=PENDING_CONFIRMATION_STATUSES,
        )

        sessions_today_comparisons: list[PanelKpiComparisonResponse] = []
        pending_confirmation_comparisons: list[PanelKpiComparisonResponse] = []
        for item in BASELINE_ITEMS:
            window = _to_day_window(baseline_anchors[item], tz=tz)
            baseline_any = self._count_sessions(
                db,
                tenant_id=tenant_id,
                window=window,
                statuses=None,
            )
            sessions_baseline = self._count_sessions(
                db,
                tenant_id=tenant_id,
                window=window,
                statuses=VALID_SESSION_STATUSES,
            )
            pending_baseline = self._count_sessions(
                db,
                tenant_id=tenant_id,
                window=window,
                statuses=PENDING_CONFIRMATION_STATUSES,
            )
            missing_baseline = baseline_any == 0

            sessions_today_comparisons.append(
                build_comparison(
                    item=item,
                    current_value=float(sessions_today_current),
                    baseline_value=None if missing_baseline else float(sessions_baseline),
                    window=window,
                    missing_baseline=missing_baseline,
                    metadata={"baseline_session_records": baseline_any},
                )
            )
            pending_confirmation_comparisons.append(
                build_comparison(
                    item=item,
                    current_value=float(pending_today_current),
                    baseline_value=None if missing_baseline else float(pending_baseline),
                    window=window,
                    missing_baseline=missing_baseline,
                    metadata={"baseline_session_records": baseline_any},
                )
            )

        session_price_cents, currency = self._resolve_profile_session_price(db, tenant_id=tenant_id)
        missing_session_price = session_price_cents is None
        session_price_for_calc = 0 if session_price_cents is None else session_price_cents
        current_week_window = _to_week_window(current_local_day, tz=tz)
        weekly_current_sessions = self._count_sessions(
            db,
            tenant_id=tenant_id,
            window=current_week_window,
            statuses=VALID_SESSION_STATUSES,
        )
        weekly_current_revenue = (
            None
            if missing_session_price
            else float(weekly_current_sessions * session_price_for_calc)
        )

        weekly_revenue_comparisons: list[PanelKpiComparisonResponse] = []
        for item in BASELINE_ITEMS:
            week_window = _to_week_window(baseline_anchors[item], tz=tz)
            baseline_any = self._count_sessions(
                db,
                tenant_id=tenant_id,
                window=week_window,
                statuses=None,
            )
            baseline_valid_sessions = self._count_sessions(
                db,
                tenant_id=tenant_id,
                window=week_window,
                statuses=VALID_SESSION_STATUSES,
            )
            baseline_missing = missing_session_price or baseline_any == 0
            baseline_revenue = (
                None
                if baseline_missing
                else float(baseline_valid_sessions * session_price_for_calc)
            )
            weekly_revenue_comparisons.append(
                build_comparison(
                    item=item,
                    current_value=weekly_current_revenue,
                    baseline_value=baseline_revenue,
                    window=week_window,
                    missing_baseline=baseline_missing,
                    metadata={
                        "baseline_session_records": baseline_any,
                        "baseline_valid_sessions": baseline_valid_sessions,
                        "missing_session_price": missing_session_price,
                    },
                )
            )

        return PanelKpisResponse(
            timezone=tz.key,
            generated_at=now_utc,
            calculation_version=CALCULATION_VERSION,
            cards=[
                PanelKpiCardResponse(
                    key="sessions_today",
                    unit="count",
                    current_value=float(sessions_today_current),
                    window_start_at=current_day_window.start_at,
                    window_end_at=current_day_window.end_at,
                    comparisons=sessions_today_comparisons,
                    metadata={"valid_statuses": list(VALID_SESSION_STATUSES)},
                ),
                PanelKpiCardResponse(
                    key="pending_confirmation",
                    unit="count",
                    current_value=float(pending_today_current),
                    window_start_at=current_day_window.start_at,
                    window_end_at=current_day_window.end_at,
                    comparisons=pending_confirmation_comparisons,
                    metadata={"pending_statuses": list(PENDING_CONFIRMATION_STATUSES)},
                ),
                PanelKpiCardResponse(
                    key="weekly_revenue_forecast",
                    unit="currency_cents",
                    currency=currency or "BRL",
                    current_value=weekly_current_revenue,
                    window_start_at=current_week_window.start_at,
                    window_end_at=current_week_window.end_at,
                    comparisons=weekly_revenue_comparisons,
                    metadata={
                        "valid_statuses": list(VALID_SESSION_STATUSES),
                        "session_price_cents": session_price_cents,
                        "missing_session_price": missing_session_price,
                        "formula": "valid_sessions_in_week * current_session_price_cents",
                    },
                ),
            ],
        )

    def list_preferences(
        self,
        db: Session,
        *,
        tenant_id: UUID,
        user_id: UUID,
    ) -> PanelPreferencesResponse:
        self._assert_user_belongs_to_tenant(db, tenant_id=tenant_id, user_id=user_id)
        preferences = list(
            db.scalars(
                select(DashboardCardPreference).where(
                    DashboardCardPreference.tenant_id == tenant_id,
                    DashboardCardPreference.user_id == user_id,
                )
            ).all()
        )
        by_card_key = {preference.card_key: preference for preference in preferences}
        cards: list[PanelCardPreferencesResponse] = []
        for card_key in PANEL_CARD_KEYS:
            existing = by_card_key.get(card_key)
            cards.append(
                self._default_preferences_for_card(card_key)
                if existing is None
                else self._serialize_preference(existing)
            )
        return PanelPreferencesResponse(
            tenant_id=str(tenant_id),
            user_id=str(user_id),
            cards=cards,
        )

    def put_card_preference(
        self,
        db: Session,
        *,
        tenant_id: UUID,
        user_id: UUID,
        card_key: PanelCardKey,
        carousel_enabled: bool,
        display_mode: PanelDisplayMode,
        fixed_item: BaselineItem,
        order: list[BaselineItem],
    ) -> PanelCardPreferencesResponse:
        self._assert_user_belongs_to_tenant(db, tenant_id=tenant_id, user_id=user_id)
        normalized_order = _normalize_order(order, allow_fallback=False)
        if display_mode == "fixed" and fixed_item not in normalized_order:
            raise PanelServiceError(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="fixed_item deve existir dentro de order quando display_mode=fixed.",
            )

        preference = db.scalar(
            select(DashboardCardPreference).where(
                DashboardCardPreference.tenant_id == tenant_id,
                DashboardCardPreference.user_id == user_id,
                DashboardCardPreference.card_key == card_key,
            )
        )
        if preference is None:
            preference = DashboardCardPreference(
                tenant_id=tenant_id,
                user_id=user_id,
                card_key=card_key,
                carousel_enabled=carousel_enabled,
                display_mode=display_mode,
                fixed_item=fixed_item,
                display_order=[str(item) for item in normalized_order],
            )
            db.add(preference)
        else:
            preference.carousel_enabled = carousel_enabled
            preference.display_mode = display_mode
            preference.fixed_item = fixed_item
            preference.display_order = [str(item) for item in normalized_order]
        db.flush()
        return self._serialize_preference(preference)

    def patch_card_preference(
        self,
        db: Session,
        *,
        tenant_id: UUID,
        user_id: UUID,
        card_key: PanelCardKey,
        payload: PanelCardPreferencesPatchRequest,
    ) -> PanelCardPreferencesResponse:
        current = self.list_preferences(db, tenant_id=tenant_id, user_id=user_id)
        current_card = next((card for card in current.cards if card.card_key == card_key), None)
        if current_card is None:
            raise PanelServiceError(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Preferencia de card nao encontrada.",
            )

        return self.put_card_preference(
            db,
            tenant_id=tenant_id,
            user_id=user_id,
            card_key=card_key,
            carousel_enabled=(
                payload.carousel_enabled
                if payload.carousel_enabled is not None
                else current_card.carousel_enabled
            ),
            display_mode=payload.display_mode or current_card.display_mode,
            fixed_item=payload.fixed_item or current_card.fixed_item,
            order=payload.order or current_card.order,
        )


panel_service = PanelService()
