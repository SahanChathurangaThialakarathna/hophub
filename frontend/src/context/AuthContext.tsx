import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import * as SecureStore from "expo-secure-store";

import * as authApi from "../api/auth";
import { TOKEN_KEY } from "../api/client";
import type { LoginRequest, RegisterRequest, User } from "../types";

interface AuthState {
  user: User | null;
  isLoading: boolean;
  signIn: (payload: LoginRequest) => Promise<void>;
  signUp: (payload: RegisterRequest) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  /**
   * On launch, check for a stored token and validate it against /auth/me.
   * A token can exist but be expired, so its presence alone is not proof
   * of a valid session — the server is the authority.
   */
  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      try {
        const token = await SecureStore.getItemAsync(TOKEN_KEY);
        if (!token) return;

        const currentUser = await authApi.getCurrentUser();
        if (!cancelled) setUser(currentUser);
      } catch {
        // Token missing, expired, or unreachable server — start signed out.
        await SecureStore.deleteItemAsync(TOKEN_KEY);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    restoreSession();
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async (payload: LoginRequest) => {
    await authApi.login(payload);
    const currentUser = await authApi.getCurrentUser();
    setUser(currentUser);
  }, []);

  const signUp = useCallback(async (payload: RegisterRequest) => {
    await authApi.register(payload);
    await authApi.login({ email: payload.email, password: payload.password });
    const currentUser = await authApi.getCurrentUser();
    setUser(currentUser);
  }, []);

  const signOut = useCallback(async () => {
    await authApi.logout();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, isLoading, signIn, signUp, signOut }),
    [user, isLoading, signIn, signUp, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}