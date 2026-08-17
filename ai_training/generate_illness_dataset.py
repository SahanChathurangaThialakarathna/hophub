"""
Generate a labelled triage dataset for the HopHub illness checker.

Rabbit triage is protocol-driven: published guidance from the House Rabbit
Society (HRS) and the Rabbit Welfare Association & Fund (RWAF) defines which
presentations constitute emergencies. This script encodes that guidance as an
explicit rule base, then samples symptom combinations and labels them by rule.

The resulting dataset is used to train a decision tree that learns the
protocol. The tree is not discovering novel clinical knowledge — it is
learning a published triage standard in a form that can be served, evaluated
and explained. Generating data from rules rather than collecting patient
records also avoids the ethics burden of clinical data collection.

The protocol is deliberately asymmetric. False reassurance (telling an owner
their rabbit is fine when it is not) is far more costly than false caution,
so the normal/monitor boundary sits close to "completely well". This makes
the normal class small in distinct-vector terms, which is a property of the
clinical design rather than a sampling failure.
"""

from __future__ import annotations

import random
from itertools import combinations
from pathlib import Path

import pandas as pd

SEED = 42
N_SAMPLES = 12000
PER_CLASS = 1200
OUTPUT = Path("datasets/illness/illness_dataset.csv")

# --------------------------------------------------------------------------
# Feature definitions
#
# Every feature is binary (0/1) and phrased so an owner can answer it by
# observation alone — no clinical instruments, no veterinary judgement.
# --------------------------------------------------------------------------

FEATURES = [
    # Appetite and gut — the most important axis in rabbit medicine
    "not_eating_12h",
    "reduced_appetite",
    "no_faecal_pellets_12h",
    "fewer_smaller_pellets",
    "diarrhoea",
    "bloated_abdomen",
    # Posture and behaviour
    "hunched_posture",
    "teeth_grinding",
    "lethargy",
    "unresponsive_or_collapsed",
    "seizure",
    # Respiratory
    "open_mouth_breathing",
    "laboured_breathing",
    "sneezing",
    "nasal_discharge",
    # Neurological
    "head_tilt",
    "rolling_or_loss_of_balance",
    # Skin and external
    "maggots_or_flystrike",
    "soiled_rear",
    "open_wound_bleeding",
    "skin_lesion_minor",
    # Urinary
    "blood_in_urine",
    "straining_to_urinate",
    "not_urinating",
    # Eyes and teeth
    "eye_discharge",
    "overgrown_teeth",
    # General
    "weight_loss",
]

LABELS = ["normal", "monitor", "see_vet_now"]

# Findings used for exhaustive enumeration near the decision boundary.
MILD_FINDINGS = [
    "sneezing",
    "skin_lesion_minor",
    "eye_discharge",
    "reduced_appetite",
    "fewer_smaller_pellets",
    "lethargy",
    "overgrown_teeth",
    "weight_loss",
    "nasal_discharge",
    "soiled_rear",
    "teeth_grinding",
    "hunched_posture",
]


# --------------------------------------------------------------------------
# Rule base — derived from HRS and RWAF triage guidance
# --------------------------------------------------------------------------

def triage(symptoms: dict[str, int]) -> str:
    """Apply the triage protocol to a symptom vector.

    Rules are evaluated most-severe-first: a single red-tier finding
    determines the outcome regardless of what else is present. This mirrors
    clinical triage, where the highest-acuity finding drives the decision.
    """
    s = symptoms

    # ---- RED: emergency, veterinary attention required now ----------------

    # Flystrike. Fatal within hours in warm climates — highly relevant in
    # Sri Lanka, where ambient temperatures accelerate larval development.
    if s["maggots_or_flystrike"]:
        return "see_vet_now"

    # Rabbits are obligate nasal breathers. Open-mouth breathing indicates
    # severe respiratory compromise and is always an emergency.
    if s["open_mouth_breathing"]:
        return "see_vet_now"

    # Collapse, unresponsiveness or seizure
    if s["unresponsive_or_collapsed"] or s["seizure"]:
        return "see_vet_now"

    # Complete GI stasis: the leading cause of rabbit mortality. Absence of
    # both intake and output for 12 hours is a surgical-risk emergency.
    if s["not_eating_12h"] and s["no_faecal_pellets_12h"]:
        return "see_vet_now"

    # GI stasis with pain signals. Hunched posture and bruxism (teeth
    # grinding) are the classic rabbit pain presentation.
    if s["not_eating_12h"] and (s["hunched_posture"] or s["teeth_grinding"]):
        return "see_vet_now"

    # Bloat — gastric dilatation, rapidly fatal
    if s["bloated_abdomen"] and (s["not_eating_12h"] or s["hunched_posture"]):
        return "see_vet_now"

    # Vestibular disease with rolling
    if s["head_tilt"] and s["rolling_or_loss_of_balance"]:
        return "see_vet_now"

    # Urinary obstruction
    if s["not_urinating"] or (s["blood_in_urine"] and s["straining_to_urinate"]):
        return "see_vet_now"

    # Significant haemorrhage
    if s["open_wound_bleeding"]:
        return "see_vet_now"

    # Severe respiratory distress
    if s["laboured_breathing"]:
        return "see_vet_now"

    # Diarrhoea with systemic signs — dehydration risk is acute in rabbits
    if s["diarrhoea"] and (s["lethargy"] or s["not_eating_12h"]):
        return "see_vet_now"

    # Soiled rear with diarrhoea is a flystrike precursor
    if s["soiled_rear"] and s["diarrhoea"]:
        return "see_vet_now"

    # ---- AMBER: monitor closely, seek advice if worsening ------------------
    #
    # Appetite, faecal output, energy and weight are the four cardinal signs
    # in rabbit medicine. Any change in these warrants monitoring on its own,
    # because GI stasis presents first as reduced intake and output.
    # Under-calling these is the most dangerous error this system could make.

    if s["not_eating_12h"] or s["no_faecal_pellets_12h"]:
        return "monitor"

    if s["reduced_appetite"] or s["fewer_smaller_pellets"]:
        return "monitor"

    if s["lethargy"] or s["weight_loss"]:
        return "monitor"

    if s["diarrhoea"] or s["bloated_abdomen"]:
        return "monitor"

    # Pain signals
    if s["hunched_posture"] or s["teeth_grinding"]:
        return "monitor"

    # Neurological or urinary findings in isolation
    if s["head_tilt"] or s["blood_in_urine"] or s["straining_to_urinate"]:
        return "monitor"

    if s["soiled_rear"]:
        return "monitor"

    if s["nasal_discharge"]:
        return "monitor"

    # Findings that can be benign alone but not in combination
    if s["sneezing"] and s["eye_discharge"]:
        return "monitor"

    if s["overgrown_teeth"] and s["skin_lesion_minor"]:
        return "monitor"

    # ---- GREEN: no concerning findings -------------------------------------
    #
    # Reached only when appetite, output, energy and weight are all normal
    # and at most one minor finding is present.
    return "normal"


# --------------------------------------------------------------------------
# Sampling
# --------------------------------------------------------------------------

# Base prevalence for each symptom when sampling independently. These are
# deliberately low — most observations of a healthy rabbit are unremarkable —
# with rarer emergency signs given lower weight than common mild ones.
PREVALENCE = {
    "not_eating_12h": 0.020,
    "reduced_appetite": 0.045,
    "no_faecal_pellets_12h": 0.020,
    "fewer_smaller_pellets": 0.045,
    "diarrhoea": 0.018,
    "bloated_abdomen": 0.012,
    "hunched_posture": 0.022,
    "teeth_grinding": 0.018,
    "lethargy": 0.040,
    "unresponsive_or_collapsed": 0.006,
    "seizure": 0.005,
    "open_mouth_breathing": 0.006,
    "laboured_breathing": 0.009,
    "sneezing": 0.045,
    "nasal_discharge": 0.022,
    "head_tilt": 0.012,
    "rolling_or_loss_of_balance": 0.008,
    "maggots_or_flystrike": 0.006,
    "soiled_rear": 0.022,
    "open_wound_bleeding": 0.008,
    "skin_lesion_minor": 0.022,
    "blood_in_urine": 0.011,
    "straining_to_urinate": 0.011,
    "not_urinating": 0.006,
    "eye_discharge": 0.026,
    "overgrown_teeth": 0.016,
    "weight_loss": 0.022,
}

# Symptoms that genuinely co-occur clinically. Sampling every feature
# independently would produce implausible vectors (e.g. flystrike with no
# soiled rear) and an unrealistically easy classification problem.
CORRELATED_GROUPS = [
    # GI stasis cluster
    (["not_eating_12h", "no_faecal_pellets_12h", "hunched_posture", "teeth_grinding"], 0.35),
    # Mild GI slowdown
    (["reduced_appetite", "fewer_smaller_pellets", "lethargy"], 0.30),
    # Upper respiratory infection ("snuffles")
    (["sneezing", "nasal_discharge", "eye_discharge"], 0.32),
    # Flystrike cluster
    (["soiled_rear", "maggots_or_flystrike"], 0.25),
    # Vestibular disease
    (["head_tilt", "rolling_or_loss_of_balance"], 0.35),
    # Urinary tract disease
    (["blood_in_urine", "straining_to_urinate"], 0.35),
    # Dental disease
    (["overgrown_teeth", "weight_loss", "reduced_appetite"], 0.25),
    # Critical collapse
    (["unresponsive_or_collapsed", "lethargy", "not_eating_12h"], 0.45),
]


def sample_case(rng: random.Random) -> dict[str, int]:
    """Draw one plausible symptom vector."""
    case = {f: int(rng.random() < PREVALENCE[f]) for f in FEATURES}

    # Propagate within clinically correlated groups: if one member is
    # present, the others become more likely.
    for group, propagation in CORRELATED_GROUPS:
        if any(case[f] for f in group):
            for f in group:
                if not case[f] and rng.random() < propagation:
                    case[f] = 1

    return case


def main() -> None:
    rng = random.Random(SEED)

    seen: set[tuple[int, ...]] = set()
    pool: list[dict[str, int]] = []

    def add(case: dict[str, int]) -> None:
        """Record a case if this exact symptom vector has not been seen."""
        key = tuple(case[f] for f in FEATURES)
        if key in seen:
            return
        seen.add(key)
        case["triage"] = triage(case)
        pool.append(case)

    # ---- Stage 1: correlated random sampling ------------------------------
    for _ in range(N_SAMPLES * 4):
        add(sample_case(rng))

    # ---- Stage 2: every symptom in isolation ------------------------------
    for feature in FEATURES:
        case = {f: 0 for f in FEATURES}
        case[feature] = 1
        add(case)

    # ---- Stage 3: exhaustive enumeration near the decision boundary -------
    #
    # The correlated sampler rarely produces cases with only one or two mild
    # findings, because any symptom firing tends to pull its cluster in.
    # Those cases are where the normal/monitor boundary sits, so all
    # combinations of up to three mild findings are enumerated directly.
    for size in (0, 1, 2, 3):
        for combo in combinations(MILD_FINDINGS, size):
            case = {f: 0 for f in FEATURES}
            for f in combo:
                case[f] = 1
            add(case)

    df_pool = pd.DataFrame(pool)

    print("Distinct symptom vectors generated:")
    print(df_pool["triage"].value_counts(), "\n")

    # ---- Stage 4: balance the classes -------------------------------------
    #
    # Distinct emergency vectors vastly outnumber distinct healthy ones,
    # because the protocol defines "normal" narrowly by design. Training on
    # the raw pool would teach the model that "see_vet_now" is almost always
    # correct.
    #
    # Sampling each class to a common size gives the tree balanced exposure.
    # Class frequency here is a modelling choice, not an epidemiological
    # claim — this dataset is not a prevalence estimate.

    balanced_frames = []

    for label in LABELS:
        subset = df_pool[df_pool["triage"] == label]
        if subset.empty:
            raise RuntimeError(f"No cases generated for class '{label}'")
        resampled = subset.sample(
            n=PER_CLASS,
            replace=len(subset) < PER_CLASS,
            random_state=SEED,
        )
        balanced_frames.append(resampled)
        print(f"{label:14} {len(subset):5} distinct -> {PER_CLASS} sampled")

    df = pd.concat(balanced_frames).sample(frac=1.0, random_state=SEED)
    df = df.reset_index(drop=True)

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(OUTPUT, index=False)

    print(f"\nWrote {len(df)} balanced cases to {OUTPUT}")
    print("\nClass distribution:")
    print(df["triage"].value_counts())


if __name__ == "__main__":
    main()