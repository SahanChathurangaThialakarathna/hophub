import { apiClient } from "./client";
import type {
  IllnessCheckResult,
  IllnessCheckSummary,
  SymptomCatalogItem,
} from "../types";

/**
 * Fetch the selectable symptoms from the server.
 *
 * The catalogue is deliberately server-owned: it is derived from the feature
 * set the model was trained on, so retraining with a different symptom list
 * updates the app without a store release.
 */
export async function listSymptoms(): Promise<SymptomCatalogItem[]> {
  const { data } = await apiClient.get<SymptomCatalogItem[]>("/illness/symptoms");
  return data;
}

export async function runCheck(
  symptoms: Record<string, boolean>,
  rabbitId?: string,
): Promise<IllnessCheckResult> {
  const { data } = await apiClient.post<IllnessCheckResult>("/illness/check", {
    symptoms,
    rabbit_id: rabbitId ?? null,
  });
  return data;
}

export async function checkHistory(rabbitId?: string): Promise<IllnessCheckSummary[]> {
  const { data } = await apiClient.get<IllnessCheckSummary[]>("/illness/history", {
    params: rabbitId ? { rabbit_id: rabbitId } : undefined,
  });
  return data;
}