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

export async function deleteRabbit(id: string): Promise<void> {
  await apiClient.delete(`/rabbits/${id}`);
}