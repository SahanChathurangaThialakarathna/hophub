"""
Illness triage inference service.

Wraps the trained decision tree exported from ai_training/. The model is
loaded once at import time rather than per request: deserialising a joblib
artifact takes tens of milliseconds, which would dominate the cost of an
otherwise trivial prediction.

The advice text attached to each tier is a static, reviewable mapping — not
model output. The model decides severity; the wording of the guidance is
fixed so it can be checked against HRS and RWAF sources and does not vary
between identical cases.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd


MODEL_PATH = Path(__file__).resolve().parents[2] / "ml_models" / "illness_tree.joblib"


class IllnessModelUnavailable(RuntimeError):
    """Raised when the model artifact is missing or unreadable."""


def _load_artifact() -> dict[str, Any]:
    if not MODEL_PATH.exists():
        raise IllnessModelUnavailable(
            f"Illness model not found at {MODEL_PATH}. "
            "Run ai_training/train_illness_model.py and copy the artifact."
        )
    return joblib.load(MODEL_PATH)


_ARTIFACT = _load_artifact()
_MODEL = _ARTIFACT["model"]
_FEATURES: list[str] = _ARTIFACT["features"]
_INT_TO_LABEL: dict[int, str] = _ARTIFACT["int_to_label"]
_METRICS: dict[str, float] = _ARTIFACT["metrics"]


# --------------------------------------------------------------------------
# Static guidance
#
# Wording is derived from House Rabbit Society and Rabbit Welfare Association
# & Fund guidance. It is deliberately fixed rather than generated: an owner
# deciding whether to seek veterinary care should receive identical advice for
# identical input, and that advice should be reviewable by a third party.
# --------------------------------------------------------------------------

TIER_GUIDANCE: dict[str, dict[str, Any]] = {
    "normal": {
        "title": "No immediate concern",
        "summary": (
            "Nothing you have reported suggests an urgent problem. Continue "
            "your usual routine and keep an eye on eating, drinking and "
            "droppings."
        ),
        "actions": [
            "Check that hay is always available and being eaten.",
            "Count droppings daily so you notice any change early.",
            "Weigh your rabbit weekly and record it.",
        ],
        "urgency_hours": None,
    },
    "monitor": {
        "title": "Monitor closely",
        "summary": (
            "Some of what you have reported is worth watching. Rabbits hide "
            "illness, and small changes in appetite, droppings or energy are "
            "often the first sign of a problem."
        ),
        "actions": [
            "Check appetite and droppings every few hours.",
            "Make sure fresh hay and water are within easy reach.",
            "Note when the signs started and whether they are worsening.",
            "Contact your vet if there is no improvement within 12 hours, or "
            "sooner if anything worsens.",
        ],
        "urgency_hours": 12,
    },
    "see_vet_now": {
        "title": "Contact a vet now",
        "summary": (
            "What you have reported can indicate a serious problem. Rabbits "
            "deteriorate quickly, and several rabbit emergencies are fatal "
            "within hours if untreated. Please contact a rabbit-savvy vet "
            "straight away."
        ),
        "actions": [
            "Contact a rabbit-experienced vet immediately.",
            "Keep your rabbit warm, quiet and undisturbed while you arrange care.",
            "Do not attempt to medicate at home without veterinary advice.",
            "Take a note of the symptoms and when they began.",
        ],
        "urgency_hours": 0,
    },
}


def get_feature_names() -> list[str]:
    """The symptom keys the model expects, in the order it was trained on."""
    return list(_FEATURES)


def get_model_metrics() -> dict[str, float]:
    """Evaluation metrics recorded at training time."""
    return dict(_METRICS)


def predict(symptoms: dict[str, bool]) -> dict[str, Any]:
    """Classify a symptom vector into a triage tier.

    `symptoms` maps feature name to boolean. Any feature absent from the
    input is treated as not present.

    The feature vector is assembled in the exact order recorded in the
    artifact. This matters: scikit-learn estimators receive a positional
    array with no column names, so passing values in a different order would
    not raise an error — it would silently predict on scrambled input and
    return a confident, wrong answer.
    """
    unknown = set(symptoms) - set(_FEATURES)
    if unknown:
        raise ValueError(f"Unknown symptom keys: {sorted(unknown)}")

    # A single-row DataFrame with named columns in the trained order. The
    # model records the feature names it was fitted on and validates them,
    # so a column mismatch raises rather than silently predicting on
    # scrambled input.
    vector = pd.DataFrame(
        [[int(bool(symptoms.get(name, False))) for name in _FEATURES]],
        columns=_FEATURES,
    )

    predicted_int = int(_MODEL.predict(vector)[0])
    tier = _INT_TO_LABEL[predicted_int]

    # Class probabilities from a decision tree are the class proportions in
    # the leaf the sample lands in — not a calibrated confidence. Reported for
    # transparency, but the tier is what the interface should act on.
    proba = _MODEL.predict_proba(vector)[0]
    confidence = float(proba[predicted_int])

    probabilities = {
        _INT_TO_LABEL[i]: round(float(p), 4) for i, p in enumerate(proba)
    }

    reported = [name for name in _FEATURES if symptoms.get(name, False)]

    guidance = TIER_GUIDANCE[tier]

    return {
        "tier": tier,
        "confidence": round(confidence, 4),
        "probabilities": probabilities,
        "title": guidance["title"],
        "summary": guidance["summary"],
        "actions": list(guidance["actions"]),
        "urgency_hours": guidance["urgency_hours"],
        "reported_symptoms": reported,
        "symptom_count": len(reported),
    }