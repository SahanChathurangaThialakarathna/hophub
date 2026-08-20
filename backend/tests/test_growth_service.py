"""Unit tests for the kit growth service.

These tests need no database and no HTTP client. analyse_growth takes plain
values, so the scientific logic can be tested in isolation from FastAPI and
SQLAlchemy — which are already well tested by their own authors. What is
tested here is the part that is this project's own contribution.

Run from the backend directory:

    cd C:\\Users\\USER\\hophub\\backend
    .\\venv\\Scripts\\Activate.ps1
    python -m pytest tests/ -v
"""

from __future__ import annotations

from datetime import date, timedelta

import pytest

from app.services.growth_service import (
    FALLING_BEHIND_SLOPE_G_PER_WEEK,
    MIN_POINTS_FOR_CONFIDENCE,
    MIN_POINTS_FOR_TREND,
    MODEL_VERSION,
    analyse_growth,
    build_reference_curve,
    fit_deviation_trend,
    gompertz,
    reference_sd_g,
    reference_weight_g,
    select_reference_group,
)

# Published means from Palka et al. (2018) Table 1, battery group, birth to
# week 6. Used as a stand-in for one kit that exactly tracks the reference.
PALKA_BATTERY_WEEKLY = [71, 168, 265, 367, 630, 913, 1201]

# The same kit but progressively falling behind.
FALLING_BEHIND_WEEKLY = [70, 160, 240, 320, 480, 650, 820]

KINDLING = date(2026, 6, 1)


def _weekly(weights: list[int], kindling: date = KINDLING) -> list[tuple[date, int]]:
    """Turn a list of weights into weekly (date, grams) pairs from birth."""
    return [(kindling + timedelta(days=7 * i), w) for i, w in enumerate(weights)]


# ---------------------------------------------------------------------------
# Reference curve — guards against the JSON and the code drifting apart
# ---------------------------------------------------------------------------

class TestReferenceCurve:
    """If ml_models/growth_reference_params.json is refitted but not copied
    into backend/, the app silently serves stale parameters with no error.
    These tests are what makes that fail loudly instead.
    """

    def test_week_six_matches_published_fit(self):
        # Value produced by ai_training/fit_reference_curve.py for the battery
        # group. Changing the fit without updating this test is deliberate
        # friction.
        assert reference_weight_g(6.0, "battery") == pytest.approx(1175.0, abs=0.5)

    def test_birth_weight_matches_published_fit(self):
        assert reference_weight_g(0.0, "battery") == pytest.approx(68.5, abs=0.5)

    def test_week_twelve_matches_published_fit(self):
        assert reference_weight_g(12.0, "battery") == pytest.approx(2765.7, abs=0.5)

    def test_box_group_differs_from_battery(self):
        # Palka et al. found housing significant from week 6. If these two are
        # equal, the wrong group is being selected somewhere.
        battery = reference_weight_g(12.0, "battery")
        box = reference_weight_g(12.0, "box")
        assert battery > box
        assert battery - box > 200  # published gap at 12 weeks was 445 g

    def test_curve_is_monotonically_increasing(self):
        weights = [reference_weight_g(t / 2, "battery") for t in range(0, 25)]
        assert all(b > a for a, b in zip(weights, weights[1:]))

    def test_curve_stays_below_asymptote(self):
        # Gompertz approaches A but never reaches it. A value above the
        # asymptote would break the ln(-ln(W/A)) transformation entirely.
        assert gompertz(100.0, 4000.0, 4.0668, 0.19998) < 4000.0


class TestReferenceSpread:
    """The published SD decides whether a deviation is meaningful."""

    def test_week_six_sd_matches_published(self):
        assert reference_sd_g(6.0, "battery") == pytest.approx(109.0, abs=0.5)

    def test_sd_grows_with_age(self):
        # 8 g at birth, 253 g at 12 weeks. A fixed gram threshold would be far
        # too strict early and useless late, which is why this is interpolated.
        assert reference_sd_g(0.0, "battery") < reference_sd_g(12.0, "battery")

    def test_sd_interpolates_between_published_points(self):
        lower = reference_sd_g(6.0, "battery")
        upper = reference_sd_g(7.0, "battery")
        middle = reference_sd_g(6.5, "battery")
        assert lower <= middle <= upper

    def test_sd_clamps_beyond_source_data(self):
        # Palka et al. stop at 12 weeks. Past that the last SD is held.
        assert reference_sd_g(20.0, "battery") == reference_sd_g(12.0, "battery")


class TestGroupSelection:
    """Housing selects the curve, not breed — because Palka et al. found breed
    was not significant for body weight at any age from week 1 to 12."""

    def test_group_housing_uses_box_curve(self):
        assert select_reference_group("group") == "box"

    def test_individual_housing_uses_battery_curve(self):
        assert select_reference_group("individual") == "battery"

    def test_unknown_falls_back_to_battery(self):
        # Most pet litters are reared in a nest box with the doe rather than
        # in a group pen, so the individual curve is the safer default.
        assert select_reference_group("unknown") == "battery"


# ---------------------------------------------------------------------------
# Deviation regression
# ---------------------------------------------------------------------------

class TestDeviationTrend:

    def test_flat_deviation_gives_zero_slope(self):
        trend = fit_deviation_trend([0, 1, 2, 3, 4], [50, 50, 50, 50, 50])
        assert trend["slope_g_per_week"] == pytest.approx(0.0, abs=1e-9)

    def test_widening_gap_gives_negative_slope(self):
        trend = fit_deviation_trend([0, 1, 2, 3, 4], [0, -20, -40, -60, -80])
        assert trend["slope_g_per_week"] == pytest.approx(-20.0, abs=1e-9)

    def test_identical_deviations_do_not_raise(self):
        # Total sum of squares is zero here, so R-squared is undefined rather
        # than 1.0. It must report 0.0 rather than divide by zero.
        trend = fit_deviation_trend([0, 1, 2], [10, 10, 10])
        assert trend["r_squared"] == 0.0


# ---------------------------------------------------------------------------
# Full assessment
# ---------------------------------------------------------------------------

class TestAssessment:

    def test_kit_on_reference_is_on_track(self):
        result = analyse_growth(
            kit_id="k1",
            identifier="Blue",
            kindling_date=KINDLING,
            housing_context="individual",
            weights=_weekly(PALKA_BATTERY_WEEKLY),
        )
        assert result["assessment"] == "on_track"
        assert result["confidence_state"] == "established"
        # Residual slope is the curve's own fit error, not a real trend.
        assert abs(result["trend"]["slope_g_per_week"]) < 5.0

    def test_widening_gap_is_falling_behind(self):
        result = analyse_growth(
            kit_id="k2",
            identifier="Runt",
            kindling_date=KINDLING,
            housing_context="individual",
            weights=_weekly(FALLING_BEHIND_WEEKLY),
        )
        assert result["assessment"] == "falling_behind"
        assert result["trend"]["slope_g_per_week"] < FALLING_BEHIND_SLOPE_G_PER_WEEK

    def test_systematic_age_offset_is_detected(self):
        # Regression test for a real mistake: feeding week-1 onward weights
        # while labelling the first one as birth. Every measurement is then a
        # week too young, and the kit looks consistently ahead of the curve.
        result = analyse_growth(
            kit_id="k3",
            identifier="Offset",
            kindling_date=KINDLING,
            housing_context="individual",
            weights=_weekly(PALKA_BATTERY_WEEKLY[1:]),
        )
        assert result["assessment"] == "above_reference"
        assert result["trend"]["slope_g_per_week"] > 20.0

    def test_light_but_steady_kit_is_below_not_falling_behind(self):
        # A constant deficit is a smaller kit growing normally. Flagging this
        # as falling behind would alarm the owner of every runt that is fine.
        offsets = [w - 150 for w in PALKA_BATTERY_WEEKLY[2:]]
        result = analyse_growth(
            kit_id="k4",
            identifier="Small",
            kindling_date=KINDLING,
            housing_context="individual",
            weights=[
                (KINDLING + timedelta(days=7 * (i + 2)), w)
                for i, w in enumerate(offsets)
            ],
        )
        assert result["assessment"] in ("below_reference", "on_track")
        assert result["assessment"] != "falling_behind"


class TestConfidenceStates:
    """No confident trend line is drawn from two or three dots."""

    def test_no_weights_gives_unknown(self):
        result = analyse_growth(
            kit_id="k5",
            identifier="New",
            kindling_date=KINDLING,
            housing_context="individual",
            weights=[],
        )
        assert result["assessment"] == "unknown"
        assert result["confidence_state"] == "insufficient_data"
        assert result["trend"] is None
        assert result["points"] == []

    def test_two_points_refuses_to_fit(self):
        # Two points define a line exactly and say nothing about trend.
        result = analyse_growth(
            kit_id="k6",
            identifier="Two",
            kindling_date=KINDLING,
            housing_context="individual",
            weights=_weekly(PALKA_BATTERY_WEEKLY[:2]),
        )
        assert result["trend"] is None
        assert result["confidence_state"] == "insufficient_data"
        assert result["assessment"] == "unknown"

    def test_three_points_is_provisional(self):
        result = analyse_growth(
            kit_id="k7",
            identifier="Three",
            kindling_date=KINDLING,
            housing_context="individual",
            weights=_weekly(PALKA_BATTERY_WEEKLY[:MIN_POINTS_FOR_TREND]),
        )
        assert result["trend"] is not None
        assert result["confidence_state"] == "provisional"
        assert "provisional" in result["message"].lower()

    def test_five_points_is_established(self):
        result = analyse_growth(
            kit_id="k8",
            identifier="Five",
            kindling_date=KINDLING,
            housing_context="individual",
            weights=_weekly(PALKA_BATTERY_WEEKLY[:MIN_POINTS_FOR_CONFIDENCE]),
        )
        assert result["confidence_state"] == "established"


class TestDerivedAges:
    """Age is computed from dates, never stored."""

    def test_ages_derive_from_kindling_date(self):
        result = analyse_growth(
            kit_id="k9",
            identifier="Ages",
            kindling_date=KINDLING,
            housing_context="individual",
            weights=_weekly(PALKA_BATTERY_WEEKLY[:3]),
        )
        assert [p["age_days"] for p in result["points"]] == [0, 7, 14]
        assert [p["age_weeks"] for p in result["points"]] == [0.0, 1.0, 2.0]

    def test_moving_kindling_date_moves_every_age(self):
        # This is the whole point of deriving rather than storing age.
        weights = _weekly(PALKA_BATTERY_WEEKLY[:3])
        later = analyse_growth(
            kit_id="k10",
            identifier="Shifted",
            kindling_date=KINDLING - timedelta(days=7),
            housing_context="individual",
            weights=weights,
        )
        assert [p["age_days"] for p in later["points"]] == [7, 14, 21]

    def test_weight_before_birth_raises(self):
        with pytest.raises(ValueError, match="precedes the kindling date"):
            analyse_growth(
                kit_id="k11",
                identifier="Impossible",
                kindling_date=KINDLING,
                housing_context="individual",
                weights=[(KINDLING - timedelta(days=1), 70)],
            )

    def test_unsorted_input_is_ordered(self):
        weights = _weekly(PALKA_BATTERY_WEEKLY[:4])
        result = analyse_growth(
            kit_id="k12",
            identifier="Jumbled",
            kindling_date=KINDLING,
            housing_context="individual",
            weights=list(reversed(weights)),
        )
        ages = [p["age_days"] for p in result["points"]]
        assert ages == sorted(ages)


class TestExtrapolationHonesty:

    def test_beyond_twelve_weeks_is_flagged_to_the_user(self):
        # Palka et al. weighed to 12 weeks. Past that both the curve and its
        # spread are extrapolation, and the user is told so rather than shown
        # a confident number.
        weights = [
            (KINDLING + timedelta(days=7 * i), 2000 + 100 * i) for i in range(10, 16)
        ]
        result = analyse_growth(
            kit_id="k13",
            identifier="Old",
            kindling_date=KINDLING,
            housing_context="individual",
            weights=weights,
        )
        assert "reference data ends" in result["message"]


class TestResponseMetadata:

    def test_model_version_is_reported(self):
        # Stored on every result so a past assessment stays interpretable
        # after the curve is refitted.
        result = analyse_growth(
            kit_id="k14",
            identifier="Meta",
            kindling_date=KINDLING,
            housing_context="group",
            weights=_weekly(PALKA_BATTERY_WEEKLY[:5]),
        )
        assert result["model_version"] == MODEL_VERSION
        assert result["reference_group"] == "box"


class TestPlottableCurve:

    def test_curve_has_expected_shape(self):
        curve = build_reference_curve("battery", max_weeks=12.0, step=0.5)
        assert curve["group"] == "battery"
        assert curve["asymptote_g"] == 4000.0
        assert len(curve["points"]) == 25
        assert curve["points"][0]["age_weeks"] == 0.0
        assert curve["points"][-1]["age_weeks"] == 12.0

    def test_citation_is_present(self):
        # The curve is published literature and must carry its source
        # wherever it is displayed.
        curve = build_reference_curve("battery")
        assert "Palka" in curve["source_citation"]
        assert "2018" in curve["source_citation"]

    def test_unknown_group_raises(self):
        with pytest.raises(ValueError, match="Unknown reference group"):
            build_reference_curve("nonexistent")
