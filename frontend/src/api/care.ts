import { apiClient } from "./client";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type OwnerLevel = "beginner" | "experienced";

export type CareReason = "ok" | "below_threshold" | "no_entries_for_level";

export interface CareAnswer {
  id: string;
  question: string;
  answer: string;
  topic: string;
  level: OwnerLevel;
  source_name: string;
  source_url: string;
  /** Cosine similarity with the closest stored phrasing of this entry. */
  score: number;
}

export interface CareTopic {
  topic: string;
  count: number;
  examples: string[];
}

export interface CareAnswerResponse {
  query: string;
  matched: boolean;
  reason: CareReason;
  answer: CareAnswer | null;
  related: CareAnswer[];
  /** True when the runner-up scored almost as highly as the top result. */
  ambiguous: boolean;
  /** Only present on a refusal. Distinguishes "nearly matched" from "unrelated". */
  best_score?: number | null;
  index_version: string;
  disclaimer: string;
}

/* ------------------------------------------------------------------ */
/* Errors                                                              */
/* ------------------------------------------------------------------ */

/**
 * Pull the server's message out of a failed request.
 *
 * Axios throws an Error whose message is only "Request failed with status
 * code 503", discarding the detail FastAPI returned. Same helper as kits.ts.
 */
export function careError(err: unknown, fallback: string): string {
  const detail = (err as any)?.response?.data?.detail;

  if (typeof detail === "string") return detail;

  if (Array.isArray(detail) && detail.length > 0) {
    const first = detail[0];
    if (typeof first?.msg === "string") return first.msg;
  }

  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

/* ------------------------------------------------------------------ */
/* Endpoints                                                           */
/* ------------------------------------------------------------------ */

/**
 * The topics the knowledge base covers, with example questions.
 *
 * Server-owned for the same reason as the illness symptom catalogue: adding
 * entries to the corpus updates the app without a store release.
 */
export async function listTopics(): Promise<CareTopic[]> {
  const { data } = await apiClient.get<CareTopic[]>("/care/topics");
  return data;
}

/**
 * Ask a care question.
 *
 * A question with no good match returns HTTP 200 with matched=false, not an
 * error. The request succeeded; the honest answer is that the knowledge base
 * has no guidance on it.
 */
export async function ask(
  question: string,
  level?: OwnerLevel,
): Promise<CareAnswerResponse> {
  const { data } = await apiClient.post<CareAnswerResponse>("/care/ask", {
    question,
    level: level ?? null,
  });
  return data;
}
