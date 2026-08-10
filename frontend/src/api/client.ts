import axios from "axios";
import * as SecureStore from "expo-secure-store";

import { API_BASE_URL, API_TIMEOUT_MS } from "../config";

export const TOKEN_KEY = "hophub_access_token";

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: API_TIMEOUT_MS,
  headers: { "Content-Type": "application/json" },
});

/**
 * Request interceptor: attach the stored JWT to every outgoing request.
 * This is why individual screens never handle the Authorization header.
 */
apiClient.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync(TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/**
 * Response interceptor: normalise backend errors into readable messages.
 * FastAPI returns {"detail": "..."} for HTTPException and a list of
 * objects for 422 validation errors, so both shapes need handling.
 */
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const detail = error.response?.data?.detail;

    if (typeof detail === "string") {
      return Promise.reject(new Error(detail));
    }
    if (Array.isArray(detail) && detail.length > 0) {
      const first = detail[0];
      const field = Array.isArray(first.loc) ? first.loc.at(-1) : "field";
      return Promise.reject(new Error(`${field}: ${first.msg}`));
    }
    if (error.code === "ECONNABORTED") {
      return Promise.reject(new Error("Request timed out. Is the server running?"));
    }
    if (!error.response) {
      return Promise.reject(
        new Error("Cannot reach the server. Check the API URL and network."),
      );
    }
    return Promise.reject(new Error("Something went wrong. Please try again."));
  },
);