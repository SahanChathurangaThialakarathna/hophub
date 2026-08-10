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