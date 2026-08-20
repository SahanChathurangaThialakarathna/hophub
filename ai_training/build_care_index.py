"""
build_care_index.py

HopHub — Module 5, Care Q&A.

Encodes the curated care knowledge base with a sentence-transformer model and
exports the resulting vectors for the backend to search at runtime.

WHY THE EMBEDDING HAPPENS HERE AND NOT IN THE BACKEND
-----------------------------------------------------
sentence-transformers pulls in PyTorch, roughly 2.5 GB on disk. Installing it
in backend/venv, alongside the TensorFlow environment the CNN module will
need, would be wasteful on a machine with limited space. The corpus is encoded
once here and only the resulting vectors — a few hundred kilobytes — ship to
the backend. This is the same boundary already used for the illness model's
joblib and the growth curve's JSON: the two environments communicate only via
exported artefacts.

The backend must still encode the USER'S QUERY with the same model, or cosine
similarities would be meaningless. That is handled by exporting the encoder to
ONNX, which runs in about 90 MB rather than 2.5 GB.

RETRIEVAL DESIGN
----------------
Each entry contributes SEVERAL vectors, not one: the canonical question plus
every phrasing in its 'paraphrases' list. Averaging them into a single vector
would blur exactly the distinctions that make the paraphrases useful. Keeping
them separate means "what do rabbits eat" and "rabbit daily diet" each match
directly, and both resolve to the same entry.

Vectors are L2-normalised on write, so cosine similarity at query time is a
plain dot product — no division, no per-query normalisation of the matrix.

Usage:
    cd C:\\Users\\USER\\hophub\\ai_training
    .\\venv\\Scripts\\Activate.ps1
    python build_care_index.py

    # To test the pipeline with unverified entries included:
    python build_care_index.py --allow-unverified
"""

from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path

import numpy as np

# all-MiniLM-L6-v2 produces 384-dimensional embeddings, is about 90 MB, and is
# the standard baseline for semantic similarity. A larger model would give
# marginally better retrieval at several times the disk cost, which is the
# wrong trade for a corpus of a few dozen entries.
MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"

# Bumped whenever the model or the corpus changes, and stored alongside the
# vectors. A stored answer stays interpretable afterwards — the same reasoning
# as model_version on illness checks and growth assessments.
INDEX_VERSION = "care-minilm-1.0.0"

VALID_LEVELS = ("beginner", "experienced")


def load_corpus(path: Path) -> dict:
    if not path.exists():
        raise SystemExit(
            f"Corpus not found at {path}.\n"
            "Expected ai_training/knowledge_base/care_corpus.json"
        )
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def validate(entries: list[dict]) -> None:
    """Fail loudly on structural problems before spending time encoding.

    Duplicate ids are the dangerous case: the index would silently keep only
    one of them and an entry would vanish from retrieval with no error.
    """
    problems: list[str] = []
    seen_ids: set[str] = set()

    for i, entry in enumerate(entries):
        where = entry.get("id", f"entry #{i}")

        for field in ("id", "question", "answer", "topic", "level"):
            if not entry.get(field):
                problems.append(f"{where}: missing or empty '{field}'")

        if entry.get("id") in seen_ids:
            problems.append(f"{where}: duplicate id")
        seen_ids.add(entry.get("id"))

        if entry.get("level") not in VALID_LEVELS:
            problems.append(
                f"{where}: level is '{entry.get('level')}', "
                f"must be one of {VALID_LEVELS}"
            )

        # A verified entry without a source is the failure mode this whole
        # module is designed to prevent: an answer displayed with a citation
        # that does not exist.
        if entry.get("verified"):
            if not entry.get("source_name"):
                problems.append(f"{where}: verified but has no source_name")
            if not entry.get("source_url"):
                problems.append(f"{where}: verified but has no source_url")
            elif not str(entry["source_url"]).startswith("http"):
                problems.append(
                    f"{where}: source_url does not look like a URL "
                    f"({entry['source_url']!r})"
                )

    if problems:
        print("Corpus validation failed:\n")
        for p in problems:
            print(f"  - {p}")
        raise SystemExit(1)


def build_texts(entries: list[dict]) -> tuple[list[str], list[int]]:
    """Flatten entries into one text per phrasing, with a map back to entries.

    Returns (texts, owner) where owner[i] is the index in `entries` that
    texts[i] came from.
    """
    texts: list[str] = []
    owner: list[int] = []

    for idx, entry in enumerate(entries):
        phrasings = [entry["question"], *entry.get("paraphrases", [])]
        for phrase in phrasings:
            cleaned = str(phrase).strip()
            if cleaned:
                texts.append(cleaned)
                owner.append(idx)

    return texts, owner


def main() -> None:
    parser = argparse.ArgumentParser(description="Build the care Q&A index.")
    parser.add_argument(
        "--allow-unverified",
        action="store_true",
        help=(
            "Include entries whose verified flag is false. Development only: "
            "the output is stamped as containing unverified content."
        ),
    )
    args = parser.parse_args()

    here = Path(__file__).resolve().parent          # ai_training/
    kb_dir = here / "knowledge_base"
    corpus_path = kb_dir / "care_corpus.json"
    kb_dir.mkdir(parents=True, exist_ok=True)

    corpus = load_corpus(corpus_path)
    all_entries: list[dict] = corpus.get("entries", [])

    if not all_entries:
        raise SystemExit("Corpus contains no entries.")

    validate(all_entries)

    verified = [e for e in all_entries if e.get("verified")]
    unverified = [e for e in all_entries if not e.get("verified")]

    print(f"Corpus: {len(all_entries)} entries "
          f"({len(verified)} verified, {len(unverified)} unverified)")

    if args.allow_unverified:
        entries = all_entries
        if unverified:
            print("\n  WARNING: including unverified entries. Development "
                  "build only — do not submit or demo from this index.\n")
    else:
        entries = verified

    if not entries:
        raise SystemExit(
            "\nNo verified entries, so there is nothing to index.\n"
            "Set verified to true on entries you have source-checked, or run\n"
            "with --allow-unverified to test the pipeline."
        )

    texts, owner = build_texts(entries)
    print(f"Encoding {len(texts)} phrasings across {len(entries)} entries...")

    # Imported here rather than at module scope so --help and the validation
    # failure paths do not pay the multi-second import cost.
    try:
        from sentence_transformers import SentenceTransformer
    except ImportError:
        raise SystemExit(
            "sentence-transformers is not installed in this environment.\n"
            "Run: pip install sentence-transformers\n"
            "It must be the ai_training venv, never backend/venv."
        )

    model = SentenceTransformer(MODEL_NAME)
    vectors = model.encode(
        texts,
        batch_size=32,
        show_progress_bar=True,
        convert_to_numpy=True,
        normalize_embeddings=True,   # cosine similarity becomes a dot product
    ).astype(np.float32)

    dim = int(vectors.shape[1])
    print(f"Encoded to {vectors.shape[0]} x {dim} float32")

    # Normalised vectors must be unit length. If this fails, dot-product
    # similarity at query time would be silently wrong — plausible-looking
    # rankings computed from a broken metric.
    norms = np.linalg.norm(vectors, axis=1)
    if not np.allclose(norms, 1.0, atol=1e-4):
        raise SystemExit(
            f"Vectors are not unit length (min {norms.min():.4f}, "
            f"max {norms.max():.4f}). Refusing to write a broken index."
        )

    np.savez_compressed(
        kb_dir / "care_vectors.npz",
        vectors=vectors,
        owner=np.asarray(owner, dtype=np.int32),
    )

    # Metadata travels separately from the vectors so the backend can read
    # answers and citations without loading arrays it does not need.
    meta = {
        "index_version": INDEX_VERSION,
        "model_name": MODEL_NAME,
        "embedding_dim": dim,
        "built_from_corpus_version": corpus.get("corpus_version"),
        "corpus_status": corpus.get("status", ""),
        "disclaimer": corpus.get(
            "disclaimer",
            "This is general guidance, not veterinary advice. If you are "
            "worried about your rabbit, contact a vet.",
        ),
        "contains_unverified": bool(args.allow_unverified and unverified),
        "n_entries": len(entries),
        "n_phrasings": len(texts),
        "entries": [
            {
                "id": e["id"],
                "topic": e["topic"],
                "level": e["level"],
                "question": e["question"],
                "answer": e["answer"],
                "source_name": e.get("source_name", ""),
                "source_url": e.get("source_url", ""),
                "verified": bool(e.get("verified")),
                "verified_on": e.get("verified_on"),
            }
            for e in entries
        ],
    }

    with open(kb_dir / "care_index_meta.json", "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2, ensure_ascii=False)

    topics = Counter(e["topic"] for e in entries)
    levels = Counter(e["level"] for e in entries)
    sources = Counter(e.get("source_name", "(none)") for e in entries)

    print("\nTopic coverage:")
    for topic, count in sorted(topics.items()):
        print(f"  {topic:<16} {count}")

    print("\nLevel split:")
    for level, count in sorted(levels.items()):
        print(f"  {level:<16} {count}")

    print("\nSources cited:")
    for source, count in sorted(sources.items()):
        print(f"  {count:>3}  {source}")

    thin = sorted(t for t, c in topics.items() if c < 3)
    if thin:
        print(
            "\nThin topics (fewer than 3 entries): " + ", ".join(thin)
            + "\n  Queries in these areas will either match weakly or fall "
              "below the similarity threshold and return nothing. That is the "
              "correct behaviour, but it does limit coverage."
        )

    print(f"\nWrote {kb_dir / 'care_vectors.npz'}")
    print(f"Wrote {kb_dir / 'care_index_meta.json'}")
    print("\nNext: export the encoder to ONNX so the backend can embed queries.")


if __name__ == "__main__":
    main()
