"""
fit_reference_curve.py

HopHub — Module 4, Kit Growth Tracker.

Fits a Gompertz growth curve to PUBLISHED rabbit weight-by-age means using
ordinary linear regression on a log-linearised form of the Gompertz equation.

WHY THIS APPROACH
-----------------
Rabbit growth is sigmoid, not linear. Fitting a straight line to raw
weight-vs-age would look acceptable to about 8 weeks and then diverge badly.
The Gompertz function is the model that Wojnarowska et al. (2022) found gave
an asymptote closest to true mature weight for New Zealand White and Popielno
White rabbits, outperforming von Bertalanffy on extrapolation.

The Gompertz function is:

    W(t) = A * exp( -b * exp( -k * t ) )

    A = asymptotic (mature) weight in grams
    b = dimensionless integration constant, sets the birth weight offset
    k = maturation rate, per week
    t = age in weeks

It can be made linear in its parameters. Divide by A, take logs twice:

    W/A            = exp( -b * exp(-k t) )
    ln(W/A)        = -b * exp(-k t)
    -ln(W/A)       =  b * exp(-k t)
    ln(-ln(W/A))   =  ln(b) - k*t

So plotting ln(-ln(W/A)) against t gives a STRAIGHT LINE with:

    slope     = -k        ->  k = -slope
    intercept = ln(b)     ->  b = exp(intercept)

This means genuine linear regression is the fitting method, satisfying the
module requirement, while producing a biologically correct sigmoid curve.
The straightness of that transformed plot is also a diagnostic: if it bends,
Gompertz is the wrong model for this data.

DATA PROVENANCE
---------------
See ai_training/DATA_SOURCES.md. All values below are published means from
peer-reviewed sources. Nothing here is generated or invented.

Usage:
    cd C:\\Users\\USER\\hophub\\ai_training
    .\\venv\\Scripts\\Activate.ps1
    python fit_reference_curve.py
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np

# Use the non-interactive backend. The script writes PNG files and never opens
# a window, so it runs the same way from a terminal or from a build step.
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

from sklearn.linear_model import LinearRegression


# ---------------------------------------------------------------------------
# 1. PUBLISHED SOURCE DATA
# ---------------------------------------------------------------------------
# Pałka, S., Kmiecik, M., Migdał, Ł., Kozioł, K., Otwinowska-Mindur, A. &
# Bieniek, J. (2018). Effect of housing system and breed on growth, slaughter
# traits and meat quality traits in rabbits. Scientific Annals of the Polish
# Society of Animal Production, 14(4), 9-18. Table 1.
#
# Ages are in WEEKS. Index 0 is birth, then weeks 1 through 12.
#
# IMPORTANT METHODOLOGICAL NOTE FROM THE PAPER:
# At birth and week 1, the authors weighed the WHOLE LITTER and divided by the
# number of kits. Individual weighing began at week 2. Those first two points
# are therefore litter averages, not individual measurements, and carry a
# different error structure. EXCLUDE_LITTER_AVERAGED_POINTS below lets us test
# whether including them changes the fit.

AGES_WEEKS = np.array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], dtype=float)

SOURCE_DATA = {
    "battery": {
        "label": "Battery cage system (n=42)",
        "mean_g": np.array(
            [71, 168, 265, 367, 630, 913, 1201, 1468, 1723, 2013, 2276, 2576, 2798],
            dtype=float,
        ),
        "sd_g": np.array(
            [8, 18, 30, 53, 91, 94, 109, 135, 146, 191, 176, 235, 253],
            dtype=float,
        ),
    },
    "box": {
        "label": "Deep litter box system (n=20)",
        "mean_g": np.array(
            [61, 127, 247, 349, 516, 792, 998, 1263, 1512, 1701, 1974, 2231, 2353],
            dtype=float,
        ),
        "sd_g": np.array(
            [4, 27, 36, 77, 125, 154, 161, 169, 179, 210, 226, 220, 260],
            dtype=float,
        ),
    },
}

# Number of leading points that are litter averages rather than individual
# weights. Set to 0 to include them in the fit.
EXCLUDE_LITTER_AVERAGED_POINTS = 0

# ---------------------------------------------------------------------------
# 2. THE ASYMPTOTE PROBLEM
# ---------------------------------------------------------------------------
# The Pałka data stops at 12 weeks, when the rabbits are still growing hard.
# The asymptote A is the mature weight, which the data NEVER REACHES. A is
# therefore only weakly identifiable from this data alone, and estimating it
# by curve fitting would be exactly the extrapolation failure that Wojnarowska
# et al. documented for the von Bertalanffy model.
#
# We therefore FIX A from the literature rather than estimate it, and run a
# sensitivity sweep to show how much the other parameters depend on that choice.
#
# Wojnarowska et al. (2022) report that the Gompertz asymptote for Popielno
# White and New Zealand White came out close to true mature weight, about 4 kg.
# Barabasz & Bieniek (2003), cited in Pycha et al. (2020), give adult New
# Zealand White as 4.5-5.5 kg and Californian as 4.1-4.3 kg.

ASYMPTOTE_G = 4000.0
ASYMPTOTE_SWEEP = np.arange(3200.0, 5600.0, 50.0)


# ---------------------------------------------------------------------------
# 3. THE MODEL
# ---------------------------------------------------------------------------

def gompertz(t: np.ndarray, A: float, b: float, k: float) -> np.ndarray:
    """Gompertz growth function. Returns predicted weight in grams."""
    return A * np.exp(-b * np.exp(-k * t))


def linearise(weights_g: np.ndarray, A: float) -> np.ndarray:
    """
    Apply the double-log transformation ln(-ln(W/A)).

    Raises if any weight is at or above the asymptote, because ln(W/A) would
    then be zero or positive and the outer log undefined. That is a real
    modelling error, not a numerical edge case: if an observed weight exceeds
    the assumed mature weight, the assumed mature weight is wrong.
    """
    ratio = weights_g / A
    if np.any(ratio <= 0) or np.any(ratio >= 1):
        bad = weights_g[(ratio <= 0) | (ratio >= 1)]
        raise ValueError(
            f"Asymptote A={A:.0f}g is not above all observed weights. "
            f"Offending values: {bad}. Increase A."
        )
    return np.log(-np.log(ratio))


def fit_gompertz_loglinear(
    ages: np.ndarray, weights_g: np.ndarray, A: float
) -> dict:
    """
    Fit Gompertz parameters b and k by ordinary least squares on the
    linearised form. A is supplied, not fitted.

    Returns a dict of parameters and goodness-of-fit measures. Note that two
    different R-squared values are reported and they mean different things:

      r2_linearised - how straight the transformed data is. This is the
                      diagnostic for whether Gompertz is the right model.
      r2_original   - how well the back-transformed curve predicts actual
                      grams. This is the number that matters for the app.

    Reporting only the first would flatter the model. Both are reported.
    """
    y = linearise(weights_g, A)

    # sklearn expects a 2D feature matrix, hence reshape to a single column.
    X = ages.reshape(-1, 1)

    model = LinearRegression()
    model.fit(X, y)

    slope = float(model.coef_[0])
    intercept = float(model.intercept_)

    k = -slope
    b = float(np.exp(intercept))

    # Goodness of fit in the transformed space.
    y_hat = model.predict(X)
    ss_res_lin = float(np.sum((y - y_hat) ** 2))
    ss_tot_lin = float(np.sum((y - np.mean(y)) ** 2))
    r2_linearised = 1.0 - ss_res_lin / ss_tot_lin

    # Goodness of fit back in grams, which is what a user actually sees.
    predicted_g = gompertz(ages, A, b, k)
    residuals_g = weights_g - predicted_g
    rmse_g = float(np.sqrt(np.mean(residuals_g ** 2)))
    mae_g = float(np.mean(np.abs(residuals_g)))

    ss_res_orig = float(np.sum(residuals_g ** 2))
    ss_tot_orig = float(np.sum((weights_g - np.mean(weights_g)) ** 2))
    r2_original = 1.0 - ss_res_orig / ss_tot_orig

    return {
        "A_g": float(A),
        "b": b,
        "k_per_week": k,
        "slope": slope,
        "intercept": intercept,
        "r2_linearised": r2_linearised,
        "r2_original": r2_original,
        "rmse_g": rmse_g,
        "mae_g": mae_g,
        "predicted_g": predicted_g,
        "residuals_g": residuals_g,
        "linearised_y": y,
        "linearised_y_hat": y_hat,
    }


def sweep_asymptote(ages: np.ndarray, weights_g: np.ndarray) -> list[dict]:
    """
    Refit across a range of assumed asymptotes.

    The purpose is honesty about identifiability. If RMSE is nearly flat across
    a wide range of A, that proves A is not determined by this data and must
    come from literature. That is a finding to report, not a problem to hide.
    """
    results = []
    for A in ASYMPTOTE_SWEEP:
        try:
            fit = fit_gompertz_loglinear(ages, weights_g, A)
        except ValueError:
            continue
        results.append(
            {
                "A_g": float(A),
                "k_per_week": fit["k_per_week"],
                "b": fit["b"],
                "rmse_g": fit["rmse_g"],
                "r2_linearised": fit["r2_linearised"],
            }
        )
    return results


# ---------------------------------------------------------------------------
# 4. PLOTS
# ---------------------------------------------------------------------------

def plot_linearisation(ages, fit, group_label, out_path: Path) -> None:
    """
    Diagnostic plot. If Gompertz is appropriate, the transformed points lie on
    a straight line. Curvature here is evidence against the model, and this is
    the first plot to look at.
    """
    fig, ax = plt.subplots(figsize=(7, 5))
    ax.scatter(ages, fit["linearised_y"], label="Transformed published means", zorder=3)
    ax.plot(ages, fit["linearised_y_hat"], linestyle="--",
            label=f"OLS fit (R\u00b2 = {fit['r2_linearised']:.4f})")
    ax.set_xlabel("Age (weeks)")
    ax.set_ylabel(r"$\ln(-\ln(W/A))$")
    ax.set_title(f"Linearisation diagnostic — {group_label}\nA fixed at {fit['A_g']:.0f} g")
    ax.legend()
    ax.grid(alpha=0.3)
    fig.tight_layout()
    fig.savefig(out_path, dpi=150)
    plt.close(fig)


def plot_fit(ages, observed_g, sd_g, fit, group_label, out_path: Path) -> None:
    """Fitted curve against published means, with published SD as error bars."""
    fine_t = np.linspace(0, 20, 300)
    fine_w = gompertz(fine_t, fit["A_g"], fit["b"], fit["k_per_week"])

    fig, ax = plt.subplots(figsize=(8, 5))
    ax.errorbar(ages, observed_g, yerr=sd_g, fmt="o", capsize=3,
                label="Published mean \u00b1 SD", zorder=3)
    ax.plot(fine_t, fine_w, linestyle="-",
            label=f"Gompertz fit (RMSE = {fit['rmse_g']:.1f} g)")
    ax.axvline(12, linestyle=":", alpha=0.6)
    ax.text(12.2, ax.get_ylim()[0] + 100, "end of source data",
            rotation=90, fontsize=8, alpha=0.7)
    ax.set_xlabel("Age (weeks)")
    ax.set_ylabel("Body weight (g)")
    ax.set_title(f"Gompertz reference curve — {group_label}")
    ax.legend()
    ax.grid(alpha=0.3)
    fig.tight_layout()
    fig.savefig(out_path, dpi=150)
    plt.close(fig)


def plot_residuals(ages, fit, group_label, out_path: Path) -> None:
    """
    Residuals in grams against age. Structure here (a run of same-sign
    residuals) means the model is systematically wrong at those ages, which
    matters more than the headline RMSE.
    """
    fig, ax = plt.subplots(figsize=(7, 4))
    ax.axhline(0, linewidth=1)
    ax.stem(ages, fit["residuals_g"])
    ax.set_xlabel("Age (weeks)")
    ax.set_ylabel("Observed \u2212 predicted (g)")
    ax.set_title(f"Residuals — {group_label}")
    ax.grid(alpha=0.3)
    fig.tight_layout()
    fig.savefig(out_path, dpi=150)
    plt.close(fig)


def plot_asymptote_sensitivity(sweep, group_label, out_path: Path) -> None:
    """Shows how much RMSE and k depend on the assumed asymptote."""
    A_vals = [r["A_g"] for r in sweep]
    rmse_vals = [r["rmse_g"] for r in sweep]
    k_vals = [r["k_per_week"] for r in sweep]

    fig, ax1 = plt.subplots(figsize=(8, 5))
    ax1.plot(A_vals, rmse_vals)
    ax1.set_xlabel("Assumed asymptote A (g)")
    ax1.set_ylabel("RMSE (g)")
    ax1.grid(alpha=0.3)

    ax2 = ax1.twinx()
    ax2.plot(A_vals, k_vals, linestyle="--")
    ax2.set_ylabel("Fitted k (per week)")

    ax1.axvline(ASYMPTOTE_G, linestyle=":", alpha=0.7)
    ax1.set_title(
        f"Asymptote sensitivity — {group_label}\n"
        "solid = RMSE (left axis), dashed = k (right axis)"
    )
    fig.tight_layout()
    fig.savefig(out_path, dpi=150)
    plt.close(fig)


# ---------------------------------------------------------------------------
# 5. MAIN
# ---------------------------------------------------------------------------

def main() -> None:
    here = Path(__file__).resolve().parent          # ai_training/
    repo_root = here.parent                          # hophub/
    reports_dir = repo_root / "reports"
    params_dir = here / "reference"
    reports_dir.mkdir(parents=True, exist_ok=True)
    params_dir.mkdir(parents=True, exist_ok=True)

    skip = EXCLUDE_LITTER_AVERAGED_POINTS
    ages = AGES_WEEKS[skip:]

    all_params = {
        "model": "Gompertz, W(t) = A * exp(-b * exp(-k*t))",
        "fitting_method": "OLS linear regression on ln(-ln(W/A))",
        "asymptote_source": (
            "Fixed, not fitted. Wojnarowska et al. (2022) report a Gompertz "
            "asymptote near true mature weight (~4 kg) for Popielno White and "
            "New Zealand White. Source data ends at 12 weeks and does not "
            "reach the plateau, so A is not identifiable from it."
        ),
        "data_source": (
            "Pa\u0142ka et al. (2018), Scientific Annals of the Polish Society "
            "of Animal Production 14(4), 9-18, Table 1."
        ),
        "litter_averaged_points_excluded": skip,
        "age_range_weeks": [float(ages[0]), float(ages[-1])],
        "groups": {},
    }

    for key, group in SOURCE_DATA.items():
        observed = group["mean_g"][skip:]
        sd = group["sd_g"][skip:]
        label = group["label"]

        fit = fit_gompertz_loglinear(ages, observed, ASYMPTOTE_G)
        sweep = sweep_asymptote(ages, observed)

        print("=" * 70)
        print(f"GROUP: {label}")
        print("=" * 70)
        print(f"  A (fixed)        : {fit['A_g']:.1f} g")
        print(f"  b                : {fit['b']:.5f}")
        print(f"  k                : {fit['k_per_week']:.5f} per week")
        print(f"  R2 (linearised)  : {fit['r2_linearised']:.5f}   <- model-shape diagnostic")
        print(f"  R2 (grams)       : {fit['r2_original']:.5f}   <- practical accuracy")
        print(f"  RMSE             : {fit['rmse_g']:.1f} g")
        print(f"  MAE              : {fit['mae_g']:.1f} g")
        print()
        print("  Age(wk)  Observed  Predicted  Residual   Published SD")
        for t, o, p, r, s in zip(ages, observed, fit["predicted_g"],
                                 fit["residuals_g"], sd):
            flag = "  <-- outside published SD" if abs(r) > s else ""
            print(f"  {t:5.0f}  {o:9.1f}  {p:9.1f}  {r:9.1f}   {s:9.1f}{flag}")
        print()

        rmse_range = max(r["rmse_g"] for r in sweep) - min(r["rmse_g"] for r in sweep)
        print(f"  Asymptote sweep {ASYMPTOTE_SWEEP[0]:.0f}-{ASYMPTOTE_SWEEP[-1]:.0f} g:")
        print(f"    RMSE varies by {rmse_range:.1f} g across that range")
        print(f"    k varies from {min(r['k_per_week'] for r in sweep):.4f} "
              f"to {max(r['k_per_week'] for r in sweep):.4f} per week")
        print()

        plot_linearisation(ages, fit, label, reports_dir / f"growth_linearisation_{key}.png")
        plot_fit(ages, observed, sd, fit, label, reports_dir / f"growth_fit_{key}.png")
        plot_residuals(ages, fit, label, reports_dir / f"growth_residuals_{key}.png")
        plot_asymptote_sensitivity(sweep, label, reports_dir / f"growth_asymptote_{key}.png")

        all_params["groups"][key] = {
            "label": label,
            "A_g": fit["A_g"],
            "b": fit["b"],
            "k_per_week": fit["k_per_week"],
            "r2_linearised": fit["r2_linearised"],
            "r2_original": fit["r2_original"],
            "rmse_g": fit["rmse_g"],
            "mae_g": fit["mae_g"],
            "observed_g": observed.tolist(),
            "predicted_g": fit["predicted_g"].tolist(),
            "residuals_g": fit["residuals_g"].tolist(),
            "published_sd_g": sd.tolist(),
            "asymptote_sweep": sweep,
        }

    out_json = params_dir / "growth_reference_params.json"
    with open(out_json, "w", encoding="utf-8") as f:
        json.dump(all_params, f, indent=2)

    print("=" * 70)
    print(f"Parameters written to: {out_json}")
    print(f"Plots written to     : {reports_dir}")
    print("=" * 70)


if __name__ == "__main__":
    main()
