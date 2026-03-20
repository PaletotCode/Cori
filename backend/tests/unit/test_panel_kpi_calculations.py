from datetime import UTC, date, datetime

from app.services.panel_service import WindowRange, _shift_month, build_comparison


def test_build_comparison_regular_delta_and_percent() -> None:
    window = WindowRange(
        start_at=datetime(2026, 3, 10, tzinfo=UTC),
        end_at=datetime(2026, 3, 11, tzinfo=UTC),
    )
    result = build_comparison(
        item="yesterday",
        current_value=15.0,
        baseline_value=10.0,
        window=window,
        missing_baseline=False,
    )
    assert result.delta_value == 5.0
    assert result.delta_percent == 50.0
    assert result.trend == "up"
    assert result.comparable is True
    assert result.missing_baseline is False


def test_build_comparison_with_missing_baseline_marks_unknown() -> None:
    window = WindowRange(
        start_at=datetime(2026, 3, 10, tzinfo=UTC),
        end_at=datetime(2026, 3, 11, tzinfo=UTC),
    )
    result = build_comparison(
        item="weekAgo",
        current_value=4.0,
        baseline_value=None,
        window=window,
        missing_baseline=True,
    )
    assert result.delta_value is None
    assert result.delta_percent is None
    assert result.trend == "unknown"
    assert result.comparable is False
    assert result.missing_baseline is True


def test_build_comparison_handles_zero_baseline_without_percent() -> None:
    window = WindowRange(
        start_at=datetime(2026, 3, 10, tzinfo=UTC),
        end_at=datetime(2026, 3, 11, tzinfo=UTC),
    )
    result = build_comparison(
        item="monthAgo",
        current_value=7.0,
        baseline_value=0.0,
        window=window,
        missing_baseline=False,
    )
    assert result.delta_value == 7.0
    assert result.delta_percent is None
    assert result.trend == "up"
    assert result.comparable is True


def test_shift_month_clamps_day_for_shorter_month() -> None:
    assert _shift_month(date(2026, 3, 31), months=-1) == date(2026, 2, 28)
    assert _shift_month(date(2026, 1, 31), months=1) == date(2026, 2, 28)
    assert _shift_month(date(2026, 3, 18), months=-1) == date(2026, 2, 18)
    assert _shift_month(date(2026, 3, 18), months=-12) == date(2025, 3, 18)
