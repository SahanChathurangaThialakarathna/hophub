import { apiClient } from "./client";
import type { Rabbit } from "../types";

export async function listRabbits(): Promise<Rabbit[]> {
  const { data } = await apiClient.get<Rabbit[]>("/rabbits");
  return data;
}

export async function getRabbit(id: string): Promise<Rabbit> {
  const { data } = await apiClient.get<Rabbit>(`/rabbits/${id}`);
  return data;
}

export async function createRabbit(payload: {
  name: string;
  breed?: string;
  sex?: string;
  date_of_birth?: string;
  weight_grams?: number;
  colour?: string;
  notes?: string;
}): Promise<Rabbit> {
  const { data } = await apiClient.post<Rabbit>("/rabbits", payload);
  return data;
}

/**
 * Partial update. Only the keys present in `payload` are sent, which maps
 * directly onto the backend's PATCH semantics (`exclude_unset=True`).
 * Omitting a field leaves it untouched — it does not null it.
 */
export async function updateRabbit(
  id: string,
  payload: Partial<{
    name: string;
    breed: string;
    sex: string;
    date_of_birth: string;
    weight_grams: number;
    colour: string;
    notes: string;
  }>,
): Promise<Rabbit> {
  const { data } = await apiClient.patch<Rabbit>(`/rabbits/${id}`, payload);
  return data;
}

export async function deleteRabbit(id: string): Promise<void> {
  await apiClient.delete(`/rabbits/${id}`);
}