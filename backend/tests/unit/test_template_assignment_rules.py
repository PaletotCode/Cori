from datetime import UTC, datetime, timedelta

import pytest

from app.services.template_assignment_service import (
    TemplateAssignmentServiceError,
    _normalize_recurrence,
    _normalize_send_mode,
)


def test_normalize_send_mode_immediate_ignores_schedule() -> None:
    resolved = _normalize_send_mode(
        send_mode="immediate",
        scheduled_send_at=datetime.now(UTC) + timedelta(hours=1),
        now=datetime.now(UTC),
    )
    assert resolved is None


def test_normalize_send_mode_requires_future_schedule() -> None:
    now = datetime.now(UTC)
    with pytest.raises(TemplateAssignmentServiceError) as exc:
        _normalize_send_mode(
            send_mode="scheduled",
            scheduled_send_at=now - timedelta(seconds=1),
            now=now,
        )

    assert exc.value.status_code == 422
    assert "futuro" in exc.value.detail


def test_normalize_recurrence_none_resets_values() -> None:
    due_at = datetime.now(UTC) + timedelta(days=1)
    rule, interval, end_at = _normalize_recurrence(
        recurrence_rule="none",
        recurrence_interval=10,
        recurrence_end_at=due_at + timedelta(days=30),
        due_at=due_at,
    )
    assert rule == "none"
    assert interval == 1
    assert end_at is None


def test_normalize_recurrence_requires_end_after_due_at() -> None:
    due_at = datetime.now(UTC) + timedelta(days=1)
    with pytest.raises(TemplateAssignmentServiceError) as exc:
        _normalize_recurrence(
            recurrence_rule="weekly",
            recurrence_interval=1,
            recurrence_end_at=due_at,
            due_at=due_at,
        )

    assert exc.value.status_code == 422
    assert "maior que due_at" in exc.value.detail
