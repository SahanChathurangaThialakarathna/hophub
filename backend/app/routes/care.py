"""Care Q&A endpoints.

    GET  /care/topics    the corpus topics, with example questions
    POST /care/ask       retrieve the closest knowledge base entry

Auth follows the illness module: the catalogue endpoint is public, since it is
static reference content, while the endpoint an owner actually uses requires a
token.

RETRIEVAL, NOT GENERATION
-------------------------
Answers are returned verbatim from a corpus a human wrote and source-checked.
Nothing is generated at request time, so every answer carries a citation the
reader can follow. When no entry is close enough, the module returns nothing
rather than the nearest available answer — see care_service for why.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from app.deps import get_current_user
from app.models.user import User
from app.schemas.care import (
    CareAnswerResponse,
    CareQuestionRequest,
    CareTopic,
)
from app.services import care_service

router = APIRouter(prefix="/care", tags=["Care Q&A"])


@router.get("/topics", response_model=list[CareTopic])
def list_topics() -> list[dict]:
    """Topics covered by the knowledge base, with example questions.

    Served so the client can offer browsable starting points. An empty search
    box gives an owner no sense of what the module knows about, and the
    examples double as a hint about how to phrase a question.

    No authentication: this is a static catalogue, the same as
    /illness/symptoms.
    """
    return care_service.list_topics()


@router.post("/ask", response_model=CareAnswerResponse)
def ask(
    payload: CareQuestionRequest,
    current_user: User = Depends(get_current_user),
) -> dict:
    """Answer a care question from the curated knowledge base.

    Returns 200 with matched=false when nothing is close enough, rather than
    404. The request succeeded and the honest answer is "no guidance here" —
    that is a result, not an error, and the client renders it differently from
    a failure.
    """
    try:
        return care_service.search(
            payload.question,
            level=payload.level,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    except care_service.CareIndexError as exc:
        # The index is missing or inconsistent. This is a deployment fault,
        # not the caller's, so it is a 503 rather than a 400.
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The care knowledge base is unavailable.",
        ) from exc
