import * as SecureStore from "expo-secure-store";

import { apiClient, TOKEN_KEY } from "./client";
import type { LoginRequest, RegisterRequest, TokenResponse, User } from "../types";

export async function register(payload: RegisterRequest): Promise<User> {
  const { data } = await apiClient.post<User>("/auth/register", payload);
  return data;
}

export async function login(payload: LoginRequest): Promise<string> {
  const { data } = await apiClient.post<TokenResponse>("/auth/login", payload);
  await SecureStore.setItemAsync(TOKEN_KEY, data.access_token);
  return data.access_token;
}

export async function getCurrentUser(): Promise<User> {
  const { data } = await apiClient.get<User>("/auth/me");
  return data;
}

export async function logout(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}