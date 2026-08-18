/** Mirrors app/schemas/user.py -> UserPublic */
export interface User {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  location_city: string | null;
  is_active: boolean;
  created_at: string;
}

/** Mirrors app/schemas/rabbit.py -> RabbitPublic */
export interface Rabbit {
  id: string;
  owner_id: string;
  name: string;
  breed: string | null;
  sex: string;
  date_of_birth: string | null;
  weight_grams: number | null;
  colour: string | null;
  notes: string | null;
  photo_url: string | null;
  predicted_breed: string | null;
  breed_confidence: number | null;
  created_at: string;
  updated_at: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  full_name: string;
  password: string;
  phone?: string;
  location_city?: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
}

/** Mirrors app/schemas/illness.py -> SymptomCatalogItem */
export interface SymptomCatalogItem {
  key: string;
  label: string;
  group: string;
}

export type TriageTier = "normal" | "monitor" | "see_vet_now";

/** Mirrors app/schemas/illness.py -> IllnessCheckResult */
export interface IllnessCheckResult {
  id: string;
  rabbit_id: string | null;
  tier: TriageTier;
  title: string;
  summary: string;
  actions: string[];
  urgency_hours: number | null;
  confidence: number;
  reported_symptoms: string[];
  symptom_count: number;
  created_at: string;
  disclaimer: string;
}

/** Mirrors app/schemas/illness.py -> IllnessCheckSummary */
export interface IllnessCheckSummary {
  id: string;
  rabbit_id: string | null;
  tier: TriageTier;
  symptom_count: number;
  created_at: string;
}