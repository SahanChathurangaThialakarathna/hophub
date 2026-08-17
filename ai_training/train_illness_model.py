"""
Train and evaluate the HopHub illness triage classifier.

A decision tree is used deliberately. The underlying task is the application
of a published triage protocol, which is itself a set of nested conditional
rules — a structure a decision tree represents natively. Equally important,
the fitted tree can be exported and read, so a clinical reviewer can inspect
exactly which symptom combinations lead to which recommendation. That
transparency matters more here than raw predictive power: an owner is being
told whether to seek veterinary care, and an unexplainable model would be
inappropriate for that decision.

Outputs:
    ml_models/illness_tree.joblib     fitted model + metadata for serving
    reports/illness_confusion.png     confusion matrix figure
    reports/illness_tree.png          visualised decision tree
    reports/illness_metrics.txt       full classification report
"""

from __future__ import annotations

import json
from pathlib import Path

import joblib
import matplotlib
import pandas as pd

matplotlib.use("Agg")  # non-interactive backend; no display required
import matplotlib.pyplot as plt  # noqa: E402

from sklearn.metrics import (  # noqa: E402
    ConfusionMatrixDisplay,
    classification_report,
    confusion_matrix,
)
from sklearn.model_selection import GridSearchCV, train_test_split  # noqa: E402
from sklearn.tree import DecisionTreeClassifier, plot_tree  # noqa: E402

from generate_illness_dataset import FEATURES, LABELS  # noqa: E402

SEED = 42
DATASET = Path("datasets/illness/illness_dataset.csv")
MODEL_DIR = Path("ml_models")
REPORT_DIR = Path("reports")

# Ordinal encoding: the tiers have a natural severity order, and encoding it
# means a confusion between adjacent tiers is visibly less severe in the
# matrix than one between the extremes.
LABEL_TO_INT = {"normal": 0, "monitor": 1, "see_vet_now": 2}
INT_TO_LABEL = {v: k for k, v in LABEL_TO_INT.items()}


def load_data() -> tuple[pd.DataFrame, pd.Series]:
    if not DATASET.exists():
        raise SystemExit(
            f"{DATASET} not found. Run generate_illness_dataset.py first."
        )

    df = pd.read_csv(DATASET)
    X = df[FEATURES]
    y = df["triage"].map(LABEL_TO_INT)

    print(f"Loaded {len(df)} cases, {len(FEATURES)} features")
    print(df["triage"].value_counts().to_string(), "\n")
    return X, y


def tune_and_fit(X_train, y_train) -> DecisionTreeClassifier:
    """Select hyperparameters by cross-validated grid search.

    `max_depth` and `min_samples_leaf` control how finely the tree partitions
    the space. Left unbounded, a tree will grow until every leaf is pure —
    memorising the training set rather than learning a generalisable
    boundary. The grid search finds the shallowest tree that still separates
    the classes well.

    Scoring uses macro-averaged recall rather than accuracy. Macro averaging
    weights every class equally regardless of its size, so the small `normal`
    class cannot be ignored by a model that simply predicts the larger
    classes well.
    """
    param_grid = {
        "max_depth": [4, 6, 8, 10, 12, None],
        "min_samples_leaf": [1, 2, 5, 10],
        "criterion": ["gini", "entropy"],
    }

    base = DecisionTreeClassifier(
        random_state=SEED,
        class_weight="balanced",
    )

    search = GridSearchCV(
        base,
        param_grid,
        scoring="recall_macro",
        cv=5,
        n_jobs=-1,
        verbose=0,
    )
    search.fit(X_train, y_train)

    print("Best hyperparameters:")
    for key, value in search.best_params_.items():
        print(f"  {key}: {value}")
    print(f"  cross-validated macro recall: {search.best_score_:.4f}\n")

    return search.best_estimator_


def evaluate(model, X_test, y_test) -> dict:
    y_pred = model.predict(X_test)

    target_names = [INT_TO_LABEL[i] for i in sorted(INT_TO_LABEL)]
    report_text = classification_report(
        y_test, y_pred, target_names=target_names, digits=4
    )
    report_dict = classification_report(
        y_test, y_pred, target_names=target_names, output_dict=True
    )

    print("Classification report (held-out test set):")
    print(report_text)

    cm = confusion_matrix(y_test, y_pred)
    print("Confusion matrix (rows = actual, columns = predicted):")
    print(pd.DataFrame(cm, index=target_names, columns=target_names).to_string(), "\n")

    # The metric that matters most clinically: of all cases that genuinely
    # required urgent veterinary attention, what proportion did the model
    # identify? A missed emergency is the failure mode with real consequences.
    severe_recall = report_dict["see_vet_now"]["recall"]
    print(f"Severe-tier recall: {severe_recall:.4f}  (target >= 0.90)")

    if severe_recall >= 0.90:
        print("Target met.\n")
    else:
        print("TARGET NOT MET — review model or rule base.\n")

    # How many true emergencies were classified as needing no action at all?
    # This is the most dangerous single error the system can make.
    critical_misses = int(cm[LABEL_TO_INT["see_vet_now"]][LABEL_TO_INT["normal"]])
    print(f"Emergencies classified as 'normal': {critical_misses}")

    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    (REPORT_DIR / "illness_metrics.txt").write_text(
        "HopHub illness triage — evaluation on held-out test set\n\n"
        + report_text
        + "\nConfusion matrix (rows = actual, columns = predicted):\n"
        + pd.DataFrame(cm, index=target_names, columns=target_names).to_string()
        + f"\n\nSevere-tier recall: {severe_recall:.4f}"
        + f"\nEmergencies classified as normal: {critical_misses}\n",
        encoding="utf-8",
    )

    # Confusion matrix figure
    fig, ax = plt.subplots(figsize=(6, 5))
    ConfusionMatrixDisplay(cm, display_labels=target_names).plot(
        ax=ax, cmap="Blues", colorbar=False
    )
    ax.set_title("Illness triage — confusion matrix")
    plt.xticks(rotation=20, ha="right")
    plt.tight_layout()
    fig.savefig(REPORT_DIR / "illness_confusion.png", dpi=160)
    plt.close(fig)

    return report_dict


def report_feature_importance(model) -> list[tuple[str, float]]:
    """Rank features by their contribution to the tree's splits.

    Useful as a sanity check on the model: the features the tree relies on
    most should be the ones the clinical protocol treats as most decisive.
    A high-importance feature that is clinically trivial would indicate the
    dataset had encoded something unintended.
    """
    pairs = sorted(
        zip(FEATURES, model.feature_importances_),
        key=lambda p: p[1],
        reverse=True,
    )

    print("\nTop features by importance:")
    for name, importance in pairs[:12]:
        if importance > 0:
            bar = "#" * int(importance * 120)
            print(f"  {name:30} {importance:.4f}  {bar}")

    unused = [name for name, imp in pairs if imp == 0]
    if unused:
        print(f"\n{len(unused)} features unused by the tree: {', '.join(unused)}")

    return pairs


def save_tree_figure(model) -> None:
    """Render the fitted tree.

    Depth is capped in the figure for legibility — the full tree is preserved
    in the saved model. The point of the figure is to show that the learned
    structure is inspectable, not to reproduce every leaf.
    """
    fig, ax = plt.subplots(figsize=(22, 12))
    plot_tree(
        model,
        feature_names=FEATURES,
        class_names=[INT_TO_LABEL[i] for i in sorted(INT_TO_LABEL)],
        filled=True,
        rounded=True,
        fontsize=7,
        max_depth=4,
        ax=ax,
    )
    ax.set_title("Illness triage decision tree (top 4 levels)")
    plt.tight_layout()
    fig.savefig(REPORT_DIR / "illness_tree.png", dpi=140)
    plt.close(fig)


def main() -> None:
    X, y = load_data()

    # Stratified split preserves the class proportions in both partitions, so
    # the test set is a fair sample of every tier rather than an accident of
    # shuffling.
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=SEED, stratify=y
    )
    print(f"Train: {len(X_train)}   Test: {len(X_test)}\n")

    model = tune_and_fit(X_train, y_train)
    metrics = evaluate(model, X_test, y_test)
    importances = report_feature_importance(model)
    save_tree_figure(model)

    # Persist the model together with everything needed to serve it. Bundling
    # the feature order is essential: the model expects columns in exactly the
    # order it was trained on, and a mismatch at inference time would produce
    # confident nonsense rather than an error.
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    artifact = {
        "model": model,
        "features": FEATURES,
        "labels": LABELS,
        "label_to_int": LABEL_TO_INT,
        "int_to_label": INT_TO_LABEL,
        "metrics": {
            "severe_recall": metrics["see_vet_now"]["recall"],
            "macro_f1": metrics["macro avg"]["f1-score"],
            "accuracy": metrics["accuracy"],
        },
        "sklearn_params": model.get_params(),
    }
    joblib.dump(artifact, MODEL_DIR / "illness_tree.joblib")

    (REPORT_DIR / "illness_feature_importance.json").write_text(
        json.dumps({name: float(imp) for name, imp in importances}, indent=2),
        encoding="utf-8",
    )

    print(f"\nSaved model to {MODEL_DIR / 'illness_tree.joblib'}")
    print(f"Saved figures and metrics to {REPORT_DIR}/")


if __name__ == "__main__":
    main()