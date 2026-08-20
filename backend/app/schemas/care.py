"""Request and response schemas for the care Q&A endpoint."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

OwnerLevel = Literal["beginner", "experienced"]


class CareQuestionRequest(BaseModel):
    """Body for POST /care/ask.

    `level` serves the two owner modes in the specification from one corpus:
    beginner entries use plain language and assume no prior knowledge,
    experienced entries assume familiarity with basic husbandry. Omitting it
    searches everything, which is the sensible default for a free-text box.
    """

    model_config = ConfigDict(extra="forbid")

    question: str = Field(
        min_length=2,
        max_length=300,
        description="The owner's question, in their own words.",
    )
    level: OwnerLevel | None = Field(
        default=None,
        description="Restrict results to one owner mode. Omit to search both.",
    )


class CareAnswer(BaseModel):
    """One knowledge base entry returned as an answer.

    The text is reproduced exactly as it appears in the corpus. Nothing is
    generated, paraphrased or summarised at request time, which is what makes
    the citation meaningful: source_url points at the guidance this answer was
    written from, and a reader can check it.
    """

    id: str
    question: str
    answer: str
    topic: str
    level: str
    source_name: str
    source_url: str

    # Cosine similarity between the query and the closest stored phrasing of
    # this entry. Exposed so the client can show why a match was weak, and so
    # the evaluation is reproducible from the API rather than only in tests.
    score: float


class CareTopic(BaseModel):
    """A topic present in the corpus, with example questions."""

    topic: str
    count: int
    examples: list[str]


class CareAnswerResponse(BaseModel):
    """Result of a care question."""

    model_config = ConfigDict(from_attributes=True)

    query: str
    matched: bool

    # ok:                   a confident single match
    # below_threshold:      nothing in the corpus was close enough
    # no_entries_for_level: the level filter excluded everything
    reason: Literal["ok", "below_threshold", "no_entries_for_level"]

    answer: CareAnswer | None
    related: list[CareAnswer]

    # True when the runner-up scored almost as highly as the top result. The
    # client should present the alternatives rather than implying the first is
    # definitive, because the query was genuinely ambiguous.
    ambiguous: bool

    # Highest similarity found when nothing passed the threshold. Present only
    # on a refusal, so the client can distinguish "nearly matched" from
    # "completely unrelated".
    best_score: float | None = None

    index_version: str

    disclaimer: str = (
        "This is general guidance, not veterinary advice. Rabbits hide illness "
        "well and deteriorate quickly. If you are worried about your rabbit, "
        "contact a vet."
    )
