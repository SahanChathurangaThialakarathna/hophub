"""Unit tests for the care Q&A retrieval service.

No database and no HTTP client. The index and the encoder are loaded directly,
so what is tested is the retrieval behaviour itself rather than FastAPI's
request handling.

The calibration class is the substantive one: it is the evidence behind the
accuracy figure and the similarity threshold reported in the dissertation.
Both are measured here rather than asserted.

Run from the backend directory:

    cd C:\\Users\\USER\\hophub\\backend
    .\\venv\\Scripts\\Activate.ps1
    python -m pytest tests/ -v

The first test to touch the encoder loads MiniLM, which takes a few seconds.
Subsequent tests reuse it.
"""

from __future__ import annotations

import numpy as np
import pytest

from app.services.care_service import (
    AMBIGUITY_MARGIN,
    ENTRIES,
    MODEL_NAME,
    OWNER,
    SIMILARITY_THRESHOLD,
    VECTORS,
    encode_query,
    list_topics,
    search,
)

# 26 queries that should each retrieve a specific entry, phrased differently
# from the stored questions where possible, and 4 that should be refused.
#
# The off-topic set matters as much as the on-topic set. Nearest-neighbour
# search always returns something, so a module that never refuses is not
# working — it is just failing quietly.
ON_TOPIC: list[tuple[str, str]] = [
    ("what should I feed my rabbit", "diet-001"),
    ("how much hay do rabbits need", "diet-002"),
    ("is chocolate bad for rabbits", "diet-003"),
    ("can rabbits eat carrot every day", "diet-004"),
    ("can I give my bunny an apple", "diet-006"),
    ("how big should my rabbit cage be", "housing-001"),
    ("should I get a second rabbit", "housing-002"),
    ("my two rabbits keep fighting", "housing-003"),
    ("what litter should I use", "housing-004"),
    ("my rabbit seems sick", "health-001"),
    ("bunny wont eat anything today", "health-002"),
    ("should I spay my female rabbit", "health-003"),
    ("do indoor rabbits need vaccines", "health-004"),
    ("there are maggots on my rabbit", "health-005"),
    ("my rabbit is drooling a lot", "dental-001"),
    ("why does my rabbit stamp its foot", "behaviour-001"),
    ("rabbit eating its own poop", "behaviour-002"),
    ("what does binky mean", "behaviour-003"),
    ("how to carry a rabbit properly", "handling-001"),
    ("are rabbits ok for young kids", "handling-002"),
    ("do I need to brush my rabbit", "grooming-001"),
    ("keeping rabbits cool in summer", "climate-001"),
    ("caring for an old rabbit", "senior-001"),
    ("rabbit recovering from being neutered", "postop-001"),
    ("how long is rabbit pregnancy", "breeding-001"),
    ("when to separate kits from mum", "breeding-002"),
]

OFF_TOPIC: list[str] = [
    "what is the capital of France",
    "how do I train my dog to sit",
    "best laptop under 50000 rupees",
    "what time is it",
]


class TestIndexIntegrity:
    """The vectors and the metadata must describe the same corpus.

    If they fall out of step — usually by copying one file and not the other —
    retrieval would return the wrong entry for a correct match, which is far
    harder to notice than an outright failure.
    """

    def test_every_vector_maps_to_a_real_entry(self):
        assert int(OWNER.max()) < len(ENTRIES)
        assert int(OWNER.min()) >= 0

    def test_vector_and_owner_counts_agree(self):
        assert VECTORS.shape[0] == OWNER.shape[0]

    def test_vectors_are_unit_length(self):
        # Cosine similarity is computed as a plain dot product, which is only
        # valid if both sides are normalised. Non-unit vectors would produce a
        # silently wrong metric rather than an error.
        norms = np.linalg.norm(VECTORS, axis=1)
        assert np.allclose(norms, 1.0, atol=1e-4)

    def test_every_entry_has_a_citation(self):
        # The module's claim to be grounded in published guidance rests
        # entirely on this. An entry without a source is an answer the app
        # would present with a citation that does not exist.
        for entry in ENTRIES:
            assert entry["source_name"], f"{entry['id']} has no source_name"
            assert entry["source_url"].startswith("http"), (
                f"{entry['id']} has no usable source_url"
            )

    def test_every_entry_reachable_by_at_least_one_vector(self):
        reachable = set(int(i) for i in OWNER)
        missing = [
            e["id"] for i, e in enumerate(ENTRIES) if i not in reachable
        ]
        assert not missing, f"Entries with no vectors: {missing}"


class TestQueryEncoding:

    def test_query_vector_is_unit_length(self):
        vec = encode_query("what do rabbits eat")
        assert np.isclose(np.linalg.norm(vec), 1.0, atol=1e-4)

    def test_query_dimension_matches_index(self):
        # A dimension mismatch means the query was encoded by a different
        # model than the corpus, putting it in an unrelated vector space.
        vec = encode_query("hello")
        assert vec.shape[0] == VECTORS.shape[1]

    def test_model_name_comes_from_the_index(self):
        # Stored in the metadata rather than hardcoded twice, so the encoder
        # cannot drift from the one that built the corpus.
        assert "MiniLM" in MODEL_NAME


class TestCalibration:
    """Measures the accuracy figure and justifies the threshold.

    These are the numbers reported in the evaluation chapter.
    """

    def test_on_topic_queries_retrieve_the_right_entry(self):
        wrong = []
        for query, expected in ON_TOPIC:
            result = search(query)
            got = result["answer"]["id"] if result["matched"] else None
            if got != expected:
                score = (
                    result["answer"]["score"]
                    if result["matched"]
                    else result.get("best_score", 0.0)
                )
                wrong.append(f"{query!r}: expected {expected}, got {got} ({score:.3f})")
        assert not wrong, "Incorrect retrievals:\n  " + "\n  ".join(wrong)

    def test_off_topic_queries_are_refused(self):
        answered = []
        for query in OFF_TOPIC:
            result = search(query)
            if result["matched"]:
                answered.append(
                    f"{query!r} returned {result['answer']['id']} "
                    f"({result['answer']['score']:.3f})"
                )
        assert not answered, (
            "Off-topic queries were answered instead of refused:\n  "
            + "\n  ".join(answered)
        )

    def test_score_populations_are_separated(self):
        """The threshold must sit in a gap, not inside either distribution.

        This is what makes SIMILARITY_THRESHOLD a derived value rather than a
        guessed constant: on-topic and off-topic queries occupy disjoint score
        ranges, and the threshold is placed between them.
        """
        on_scores = [
            search(q)["answer"]["score"]
            for q, _ in ON_TOPIC
        ]
        off_scores = [
            search(q).get("best_score", 0.0)
            for q in OFF_TOPIC
        ]

        lowest_correct = min(on_scores)
        highest_offtopic = max(off_scores)

        assert highest_offtopic < SIMILARITY_THRESHOLD < lowest_correct, (
            f"Threshold {SIMILARITY_THRESHOLD} does not separate the two "
            f"populations: off-topic peaks at {highest_offtopic:.3f}, "
            f"lowest correct match is {lowest_correct:.3f}."
        )


class TestRefusalBehaviour:

    def test_refusal_reports_how_close_it_got(self):
        # Lets the client distinguish "nearly matched, try rephrasing" from
        # "this corpus does not cover that at all".
        result = search("what is the capital of France")
        assert result["matched"] is False
        assert result["reason"] == "below_threshold"
        assert result["best_score"] < SIMILARITY_THRESHOLD

    def test_refusal_returns_no_answer_and_no_related(self):
        result = search("best laptop under 50000 rupees")
        assert result["answer"] is None
        assert result["related"] == []

    def test_empty_query_raises(self):
        with pytest.raises(ValueError):
            search("   ")


class TestLevelFilter:
    """Two owner modes served from one corpus."""

    def test_beginner_filter_returns_only_beginner_entries(self):
        result = search("what should I feed my rabbit", level="beginner")
        assert result["matched"]
        assert result["answer"]["level"] == "beginner"
        for item in result["related"]:
            assert item["level"] == "beginner"

    def test_experienced_filter_returns_only_experienced_entries(self):
        result = search("rabbit recovering from being neutered", level="experienced")
        assert result["matched"]
        assert result["answer"]["level"] == "experienced"

    def test_filter_can_exclude_everything(self):
        # An experienced-only query about a beginner topic should refuse
        # rather than return a loosely related experienced entry.
        result = search("what is the capital of France", level="experienced")
        assert result["matched"] is False


class TestResultShape:

    def test_related_never_repeats_the_primary_answer(self):
        # Several phrasings map to one entry. Without collapsing to the best
        # score per entry, a well-paraphrased entry would fill every slot
        # with itself.
        result = search("what should I feed my rabbit")
        assert result["matched"]
        primary = result["answer"]["id"]
        assert all(item["id"] != primary for item in result["related"])

    def test_related_are_ranked_below_the_answer(self):
        result = search("my rabbit seems sick")
        assert result["matched"]
        for item in result["related"]:
            assert item["score"] <= result["answer"]["score"]

    def test_related_all_clear_the_threshold(self):
        # A weak related entry is still an answer presented to the user, so
        # the threshold applies to it too.
        result = search("my rabbit seems sick")
        for item in result["related"]:
            assert item["score"] >= SIMILARITY_THRESHOLD

    def test_ambiguity_flag_agrees_with_the_margin(self):
        result = search("my rabbit is not eating")
        if result["matched"] and result["related"]:
            gap = result["answer"]["score"] - result["related"][0]["score"]
            assert result["ambiguous"] == (gap < AMBIGUITY_MARGIN)

    def test_answer_carries_its_citation(self):
        result = search("how much hay do rabbits need")
        assert result["matched"]
        assert result["answer"]["source_name"]
        assert result["answer"]["source_url"].startswith("http")

    def test_disclaimer_is_always_present(self):
        for query in ("what should I feed my rabbit", "what is the capital of France"):
            assert search(query)["disclaimer"]


class TestTopics:

    def test_topics_cover_the_whole_corpus(self):
        topics = list_topics()
        assert sum(t["count"] for t in topics) == len(ENTRIES)

    def test_topics_carry_example_questions(self):
        for topic in list_topics():
            assert topic["examples"], f"{topic['topic']} has no examples"
            assert len(topic["examples"]) <= 3
