"""Care Q&A: semantic retrieval over a curated, source-checked knowledge base.

RETRIEVAL, NOT GENERATION
-------------------------
This module never writes an answer. It finds the closest entry in a corpus
that a human wrote and checked against published guidance, and returns that
entry verbatim together with its citation. Nothing is paraphrased, summarised
or synthesised at request time.

That is a deliberate constraint, not a limitation of the technique. An answer
about a sick animal must be traceable to a named source, and a generative
model cannot offer that. It is also what makes the module's claim to be
"grounded in verified veterinary documentation" literally true.

HOW IT WORKS
------------
The corpus was encoded offline by ai_training/build_care_index.py, which wrote
one vector per PHRASING — each entry's canonical question plus its paraphrases.
Vectors were L2-normalised at build time, so cosine similarity here is a plain
dot product against the matrix.

At request time the user's query is encoded with the SAME model. Using a
different model would produce vectors in an unrelated space and the
similarities would be meaningless while still looking plausible, so the model
name is stored in the index metadata and checked on load.

REFUSING TO ANSWER
------------------
Below SIMILARITY_THRESHOLD the module returns no answer rather than the
closest available one. Nearest-neighbour search always returns something; on
an unrelated query that something is nonsense presented with the same
confidence as a good match. Saying "I don't have guidance on that" is the
correct output, and it follows the same reasoning as refusing to fit a growth
trend from two points.
"""

from __future__ import annotations

import json
import threading
from pathlib import Path

import numpy as np

# Minimum cosine similarity for a result to be offered at all.
#
# Set from a 30-query calibration run against this corpus: correct matches
# scored 0.726-1.000, genuine off-topic queries 0.151-0.303. 0.60 sits in that
# empty band, refusing the one near-miss at 0.546 while leaving 0.126 of
# headroom below the lowest correct match. Recalibrate if the corpus grows.
SIMILARITY_THRESHOLD = 0.60

# A result must be clearly the best to be presented as the answer. If the
# runner-up is within this margin the query is genuinely ambiguous, and the
# alternatives are surfaced rather than one being picked arbitrarily.
AMBIGUITY_MARGIN = 0.04

MAX_RELATED = 3


class CareIndexError(RuntimeError):
    """Raised when the index files are missing, malformed or inconsistent."""


_MODEL_LOCK = threading.Lock()
_model = None


def _artifact_dir() -> Path:
    # growth_service resolves its JSON the same way. app/services -> app -> backend
    return Path(__file__).resolve().parents[2] / "ml_models"


def _load_index() -> tuple[np.ndarray, np.ndarray, dict]:
    """Load vectors and metadata once, at import.

    Loading at import means a missing or corrupt index fails loudly at startup
    rather than intermittently under traffic — the same reasoning as the
    illness model's joblib and the growth reference JSON.
    """
    base = _artifact_dir()
    vec_path = base / "care_vectors.npz"
    meta_path = base / "care_index_meta.json"

    for path in (vec_path, meta_path):
        if not path.exists():
            raise CareIndexError(
                f"Care index file not found at {path}. Run "
                "ai_training/build_care_index.py and copy care_vectors.npz "
                "and care_index_meta.json into backend/ml_models/."
            )

    with open(meta_path, "r", encoding="utf-8") as f:
        meta = json.load(f)

    data = np.load(vec_path)
    vectors = data["vectors"].astype(np.float32)
    owner = data["owner"].astype(np.int32)

    if vectors.shape[0] != owner.shape[0]:
        raise CareIndexError(
            f"Index is inconsistent: {vectors.shape[0]} vectors but "
            f"{owner.shape[0]} owner entries."
        )

    n_entries = len(meta.get("entries", []))
    if n_entries == 0:
        raise CareIndexError("Index metadata contains no entries.")

    if int(owner.max()) >= n_entries:
        raise CareIndexError(
            f"Index points at entry {int(owner.max())} but metadata has only "
            f"{n_entries} entries. The vectors and metadata are out of step — "
            "rebuild and copy both files together."
        )

    if int(meta.get("embedding_dim", 0)) != int(vectors.shape[1]):
        raise CareIndexError(
            f"Metadata declares {meta.get('embedding_dim')} dimensions but the "
            f"vectors have {vectors.shape[1]}."
        )

    return vectors, owner, meta


VECTORS, OWNER, META = _load_index()
ENTRIES: list[dict] = META["entries"]
MODEL_NAME: str = META["model_name"]
INDEX_VERSION: str = META.get("index_version", "unknown")
DISCLAIMER: str = META.get(
    "disclaimer",
    "This is general guidance, not veterinary advice. If you are worried "
    "about your rabbit, contact a vet.",
)


def _get_model():
    """Load the encoder lazily, once, behind a lock.

    Lazy because importing and loading the model costs several seconds and
    would slow every backend start, including runs that never touch Q&A.
    Locked because FastAPI serves requests from a thread pool and two
    simultaneous first-requests would otherwise both load it.
    """
    global _model
    if _model is None:
        with _MODEL_LOCK:
            if _model is None:
                try:
                    from sentence_transformers import SentenceTransformer
                except ImportError as exc:
                    raise CareIndexError(
                        "sentence-transformers is not installed in the backend "
                        "environment. Run: pip install sentence-transformers"
                    ) from exc
                # MUST match the model the corpus was encoded with. A different
                # model puts queries in an unrelated vector space, producing
                # similarities that are meaningless but still look plausible.
                _model = SentenceTransformer(MODEL_NAME)
    return _model


def encode_query(text: str) -> np.ndarray:
    """Encode one query to a unit-length vector."""
    model = _get_model()
    vec = model.encode(
        [text],
        convert_to_numpy=True,
        normalize_embeddings=True,
    ).astype(np.float32)
    return vec[0]


def _entry_payload(entry: dict, score: float) -> dict:
    return {
        "id": entry["id"],
        "question": entry["question"],
        "answer": entry["answer"],
        "topic": entry["topic"],
        "level": entry["level"],
        "source_name": entry.get("source_name", ""),
        "source_url": entry.get("source_url", ""),
        "score": round(float(score), 4),
    }


def search(
    query: str,
    *,
    level: str | None = None,
    max_related: int = MAX_RELATED,
) -> dict:
    """Find the best matching knowledge base entry for a query.

    `level` optionally restricts results to 'beginner' or 'experienced'
    entries, which is how the two owner modes in the specification are served
    from one corpus.

    Returns a dict describing either a confident answer, an ambiguous set of
    candidates, or no match at all. The caller does not have to interpret raw
    similarity scores.
    """
    cleaned = (query or "").strip()
    if not cleaned:
        raise ValueError("Query is empty.")

    query_vec = encode_query(cleaned)

    # Both sides are unit length, so the dot product is the cosine similarity.
    scores = VECTORS @ query_vec

    # Several phrasings map to the same entry, so collapse to the best score
    # per entry before ranking. Without this a well-paraphrased entry would
    # fill every result slot with itself.
    best_per_entry: dict[int, float] = {}
    for i, score in enumerate(scores):
        idx = int(OWNER[i])
        if score > best_per_entry.get(idx, -1.0):
            best_per_entry[idx] = float(score)

    candidates = [
        (idx, score)
        for idx, score in best_per_entry.items()
        if level is None or ENTRIES[idx]["level"] == level
    ]

    if not candidates:
        return {
            "query": cleaned,
            "matched": False,
            "reason": "no_entries_for_level",
            "answer": None,
            "related": [],
            "ambiguous": False,
            "index_version": INDEX_VERSION,
            "disclaimer": DISCLAIMER,
        }

    candidates.sort(key=lambda pair: pair[1], reverse=True)
    top_idx, top_score = candidates[0]

    if top_score < SIMILARITY_THRESHOLD:
        # Deliberately returns nothing rather than the closest available
        # entry. See module docstring.
        return {
            "query": cleaned,
            "matched": False,
            "reason": "below_threshold",
            "best_score": round(float(top_score), 4),
            "answer": None,
            "related": [],
            "ambiguous": False,
            "index_version": INDEX_VERSION,
            "disclaimer": DISCLAIMER,
        }

    related = [
        _entry_payload(ENTRIES[idx], score)
        for idx, score in candidates[1 : 1 + max_related]
        if score >= SIMILARITY_THRESHOLD
    ]

    ambiguous = bool(related) and (top_score - related[0]["score"]) < AMBIGUITY_MARGIN

    return {
        "query": cleaned,
        "matched": True,
        "reason": "ok",
        "answer": _entry_payload(ENTRIES[top_idx], top_score),
        "related": related,
        "ambiguous": ambiguous,
        "index_version": INDEX_VERSION,
        "disclaimer": DISCLAIMER,
    }


def list_topics() -> list[dict]:
    """Topics present in the corpus, with counts and example questions.

    Served so the client can offer browsable starting points. An empty search
    box is intimidating and gives no sense of what the module knows about.
    """
    grouped: dict[str, list[dict]] = {}
    for entry in ENTRIES:
        grouped.setdefault(entry["topic"], []).append(entry)

    return [
        {
            "topic": topic,
            "count": len(items),
            "examples": [e["question"] for e in items[:3]],
        }
        for topic, items in sorted(grouped.items())
    ]


def calibrate_threshold(probes: list[tuple[str, str | None]]) -> list[dict]:
    """Score a set of probe queries against the corpus, for tuning.

    Each probe is (query, expected_entry_id) where expected_entry_id is None
    for queries that SHOULD return nothing. Used by the tests to check that
    the threshold separates on-topic from off-topic queries, rather than the
    value being asserted without evidence.
    """
    results = []
    for query, expected in probes:
        outcome = search(query)
        got = outcome["answer"]["id"] if outcome["matched"] else None
        score = (
            outcome["answer"]["score"]
            if outcome["matched"]
            else outcome.get("best_score", 0.0)
        )
        results.append(
            {
                "query": query,
                "expected": expected,
                "got": got,
                "score": score,
                "correct": got == expected,
            }
        )
    return results
