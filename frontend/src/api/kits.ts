import { apiClient } from "./client";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */
/* Declared here rather than in ../types so the growth module stays    */
/* self-contained. Move them across if the shared types file is the    */
/* preferred home.                                                     */

export type HousingContext = "individual" | "group" | "unknown";
export type KitSex = "unknown" | "male" | "female";
export type KitStatus = "active" | "died" | "rehomed";

export type Assessment =
  | "unknown"
  | "on_track"
  | "above_reference"
  | "below_reference"
  | "falling_behind";

export type ConfidenceState = "insufficient_data" | "provisional" | "established";

export interface Litter {
  id: string;
  user_id: string;
  doe_id: string | null;
  kindling_date: string;
  litter_size_born: number | null;
  litter_size_alive: number | null;
  housing_context: HousingContext;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface KitSummary {
  id: string;
  identifier: string;
  sex: KitSex;
  status: KitStatus;
  weight_count: number;
  latest_measured_on: string | null;
  latest_weight_g: number | null;
  latest_age_days: number | null;
  assessment: Assessment;
  confidence_state: ConfidenceState;
}

export interface LitterDetail extends Litter {
  kits: KitSummary[];
}

export interface Kit {
  id: string;
  litter_id: string;
  user_id: string;
  identifier: string;
  sex: KitSex;
  status: KitStatus;
  status_changed_on: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface KitWeight {
  id: string;
  kit_id: string;
  measured_on: string;
  weight_g: number;
  entry_source: "owner" | "seed";
  notes: string | null;
  created_at: string;
}

export interface GrowthPoint {
  measured_on: string;
  age_days: number;
  age_weeks: number;
  weight_g: number;
  reference_g: number;
  deviation_g: number;
  deviation_pct: number;
}

export interface GrowthTrend {
  n_points: number;
  slope_g_per_week: number;
  intercept_g: number;
  r_squared: number;
}

export interface GrowthAnalysis {
  kit_id: string;
  identifier: string;
  kindling_date: string;
  latest_age_days: number | null;
  reference_group: "battery" | "box";
  reference_label: string;
  model_version: string;
  points: GrowthPoint[];
  trend: GrowthTrend | null;
  confidence_state: ConfidenceState;
  assessment: Assessment;
  message: string;
  disclaimer: string;
}

export interface ReferenceCurvePoint {
  age_weeks: number;
  reference_g: number;
}

export interface ReferenceCurve {
  group: "battery" | "box";
  label: string;
  model_version: string;
  asymptote_g: number;
  b: number;
  k_per_week: number;
  source_citation: string;
  points: ReferenceCurvePoint[];
}

/* ------------------------------------------------------------------ */
/* Error messages                                                      */
/* ------------------------------------------------------------------ */

/**
 * Pull the server's message out of a failed request.
 *
 * FastAPI returns a useful `detail` string on 409 and 422 — for example
 * naming the date that already has a weight recorded. Axios throws an Error
 * whose message is only "Request failed with status code 409", so showing
 * err.message directly would discard the part the owner actually needs.
 */
export function kitError(err: unknown, fallback: string): string {
  const detail = (err as any)?.response?.data?.detail;

  if (typeof detail === "string") return detail;

  // 422 from Pydantic returns an array of field errors.
  if (Array.isArray(detail) && detail.length > 0) {
    const first = detail[0];
    if (typeof first?.msg === "string") return first.msg;
  }

  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

/* ------------------------------------------------------------------ */
/* Litters                                                             */
/* ------------------------------------------------------------------ */

export async function listLitters(): Promise<Litter[]> {
  const { data } = await apiClient.get<Litter[]>("/kits/litters");
  return data;
}

export async function createLitter(payload: {
  kindling_date: string;
  doe_id?: string | null;
  litter_size_born?: number | null;
  litter_size_alive?: number | null;
  housing_context?: HousingContext;
  notes?: string | null;
}): Promise<Litter> {
  const { data } = await apiClient.post<Litter>("/kits/litters", payload);
  return data;
}

/** A litter with a growth summary for each kit, in a single request. */
export async function getLitter(litterId: string): Promise<LitterDetail> {
  const { data } = await apiClient.get<LitterDetail>(`/kits/litters/${litterId}`);
  return data;
}

export async function updateLitter(
  litterId: string,
  payload: Partial<{
    kindling_date: string;
    doe_id: string | null;
    litter_size_born: number | null;
    litter_size_alive: number | null;
    housing_context: HousingContext;
    notes: string | null;
  }>,
): Promise<Litter> {
  const { data } = await apiClient.patch<Litter>(`/kits/litters/${litterId}`, payload);
  return data;
}

export async function deleteLitter(litterId: string): Promise<void> {
  await apiClient.delete(`/kits/litters/${litterId}`);
}

/* ------------------------------------------------------------------ */
/* Kits                                                                */
/* ------------------------------------------------------------------ */

export async function createKit(
  litterId: string,
  payload: { identifier: string; sex?: KitSex; notes?: string | null },
): Promise<Kit> {
  const { data } = await apiClient.post<Kit>(`/kits/litters/${litterId}/kits`, payload);
  return data;
}

export async function getKit(kitId: string): Promise<Kit> {
  const { data } = await apiClient.get<Kit>(`/kits/${kitId}`);
  return data;
}

export async function updateKit(
  kitId: string,
  payload: Partial<{
    identifier: string;
    sex: KitSex;
    status: KitStatus;
    status_changed_on: string | null;
    notes: string | null;
  }>,
): Promise<Kit> {
  const { data } = await apiClient.patch<Kit>(`/kits/${kitId}`, payload);
  return data;
}

export async function deleteKit(kitId: string): Promise<void> {
  await apiClient.delete(`/kits/${kitId}`);
}

/* ------------------------------------------------------------------ */
/* Weights                                                             */
/* ------------------------------------------------------------------ */

/**
 * Record a weighing.
 *
 * measured_on is supplied rather than defaulting to today, because owners
 * routinely backfill a history for a litter that is already several weeks
 * old. The server rejects a second weight for the same kit on the same date.
 */
export async function recordWeight(
  kitId: string,
  payload: { measured_on: string; weight_g: number; notes?: string | null },
): Promise<KitWeight> {
  const { data } = await apiClient.post<KitWeight>(`/kits/${kitId}/weights`, payload);
  return data;
}

export async function listWeights(kitId: string): Promise<KitWeight[]> {
  const { data } = await apiClient.get<KitWeight[]>(`/kits/${kitId}/weights`);
  return data;
}

export async function deleteWeight(weightId: string): Promise<void> {
  await apiClient.delete(`/kits/weights/${weightId}`);
}

/* ------------------------------------------------------------------ */
/* Growth                                                              */
/* ------------------------------------------------------------------ */

export async function kitGrowth(kitId: string): Promise<GrowthAnalysis> {
  const { data } = await apiClient.get<GrowthAnalysis>(`/kits/${kitId}/growth`);
  return data;
}

/**
 * The published reference curve, for plotting.
 *
 * Server-owned for the same reason as the symptom catalogue: refitting the
 * curve updates the chart on every device without a store release.
 */
export async function referenceCurve(
  group: "battery" | "box" = "battery",
  maxWeeks = 12,
): Promise<ReferenceCurve> {
  const { data } = await apiClient.get<ReferenceCurve>("/kits/reference-curve", {
    params: { group, max_weeks: maxWeeks },
  });
  return data;
}
