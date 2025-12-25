/**
 * Authentication utilities using TanStack Query.
 *
 * Features:
 * - Access token stored in localStorage (short-lived, 30 min default)
 * - Refresh token stored in localStorage (long-lived, 7 days default)
 * - Automatic token refresh before expiry
 * - TanStack Query for API calls and caching
 */

import { useSyncExternalStore, useEffect, useRef } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
  type UseMutationResult,
} from "@tanstack/react-query";
import type { User, Token } from "./api";
import i18n from "@/locales/i18n";
import { supportedLanguages } from "@/locales/i18n";

export type { User };

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  email: string;
  password: string;
  full_name?: string;
  organization_name?: string;
}

export interface RegisterWithInvitationData {
  token: string;
  password: string;
  full_name?: string;
}

// Storage keys
const ACCESS_TOKEN_KEY = "auth_token";
const REFRESH_TOKEN_KEY = "auth_refresh_token";
const TOKEN_EXPIRY_KEY = "auth_token_expiry";

// Refresh token 1 minute before expiry
const REFRESH_BUFFER_MS = 60 * 1000;

const API_URL = import.meta.env.VITE_API_URL || "";

// Auth state change listeners for reactive updates
type AuthListener = () => void;
const authListeners = new Set<AuthListener>();

function notifyAuthChange() {
  authListeners.forEach((listener) => listener());
}

export function subscribeToAuth(listener: AuthListener): () => void {
  authListeners.add(listener);
  return () => authListeners.delete(listener);
}

export function getToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

function getTokenExpiry(): number | null {
  const expiry = localStorage.getItem(TOKEN_EXPIRY_KEY);
  return expiry ? parseInt(expiry, 10) : null;
}

export function setTokens(tokenData: Token): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, tokenData.access_token);
  localStorage.setItem(REFRESH_TOKEN_KEY, tokenData.refresh_token);
  // Store expiry time in milliseconds
  const expiryTime = Date.now() + tokenData.expires_in * 1000;
  localStorage.setItem(TOKEN_EXPIRY_KEY, expiryTime.toString());
  notifyAuthChange();
}

/** @deprecated Use setTokens() instead. Kept for backwards compatibility. */
export function setToken(token: string): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, token);
  notifyAuthChange();
}

export function removeToken(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(TOKEN_EXPIRY_KEY);
  notifyAuthChange();
}

export function isLoggedIn(): boolean {
  return !!getToken();
}

/**
 * React hook that reactively tracks whether user has a token.
 * Uses useSyncExternalStore for proper React 18 concurrent mode support.
 */
export function useHasToken(): boolean {
  return useSyncExternalStore(subscribeToAuth, isLoggedIn, isLoggedIn);
}

/**
 * Check if the access token is expired or will expire soon.
 */
export function isTokenExpired(): boolean {
  const expiry = getTokenExpiry();
  if (!expiry) return true;
  // Consider expired if within buffer time
  return Date.now() >= expiry - REFRESH_BUFFER_MS;
}

async function fetchWithAuth<T>(
  url: string,
  options: RequestInit = {},
): Promise<T> {
  // Try to refresh token if expired before making request
  if (isLoggedIn() && isTokenExpired()) {
    await tryRefreshToken();
  }

  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${url}`, {
    ...options,
    headers,
  });

  // If we get 401, try to refresh and retry once
  if (response.status === 401 && getRefreshToken()) {
    const refreshed = await tryRefreshToken();
    if (refreshed) {
      // Retry the request with new token
      headers.Authorization = `Bearer ${getToken()}`;
      const retryResponse = await fetch(`${API_URL}${url}`, {
        ...options,
        headers,
      });
      if (!retryResponse.ok) {
        const error = await retryResponse
          .json()
          .catch(() => ({ detail: i18n.t("error_request_failed") }));
        throw new Error(error.detail || `HTTP ${retryResponse.status}`);
      }
      return retryResponse.json();
    }
  }

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ detail: i18n.t("error_request_failed") }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }

  return response.json();
}

async function loginApi(credentials: LoginCredentials): Promise<Token> {
  const formData = new URLSearchParams();
  formData.append("username", credentials.email);
  formData.append("password", credentials.password);

  const response = await fetch(`${API_URL}/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formData,
  });

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ detail: i18n.t("error_login_failed") }));
    throw new Error(error.detail || i18n.t("error_invalid_credentials"));
  }

  return response.json();
}

async function registerApi(data: RegisterData): Promise<User> {
  return fetchWithAuth<User>("/v1/auth/signup", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

async function registerWithInvitationApi(
  data: RegisterWithInvitationData,
): Promise<User> {
  return fetchWithAuth<User>("/v1/auth/signup-with-invitation", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

async function fetchCurrentUser(): Promise<User> {
  return fetchWithAuth<User>("/v1/auth/me");
}

/**
 * Refresh the access token using the refresh token.
 * Returns new token data or null if refresh failed.
 */
async function refreshTokenApi(): Promise<Token | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;

  try {
    const response = await fetch(`${API_URL}/v1/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!response.ok) {
      // Refresh token is invalid/expired - clear all tokens
      removeToken();
      return null;
    }

    return response.json();
  } catch {
    return null;
  }
}

// Track if we're currently refreshing to avoid multiple simultaneous refreshes
let refreshPromise: Promise<boolean> | null = null;

/**
 * Try to refresh the access token.
 * Returns true if successful, false otherwise.
 * Handles concurrent refresh attempts by deduplicating.
 */
async function tryRefreshToken(): Promise<boolean> {
  // If already refreshing, wait for that to complete
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    const tokenData = await refreshTokenApi();
    if (tokenData) {
      setTokens(tokenData);
      return true;
    }
    return false;
  })();

  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

export const authKeys = {
  user: ["auth", "user"] as const,
};

export const authQueryOptions = {
  user: {
    queryKey: authKeys.user,
    queryFn: fetchCurrentUser,
  },
};

/**
 * Sync frontend i18n language with user's backend preference.
 * Only changes language if it differs and is supported.
 */
function syncLanguageFromUser(user: User | undefined | null): void {
  if (!user?.language) return;

  const userLang = user.language;
  const currentLang = i18n.language;

  // Only change if different and the language is supported
  if (
    userLang !== currentLang &&
    supportedLanguages.some((lang) => lang.code === userLang)
  ) {
    i18n.changeLanguage(userLang);
  }
}

export function useCurrentUser(): UseQueryResult<User, Error> {
  const query = useQuery({
    queryKey: authKeys.user,
    queryFn: fetchCurrentUser,
    enabled: isLoggedIn(),
    retry: false,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  // Track if we've already synced for this user session to avoid repeated syncs
  const hasSyncedRef = useRef<string | null>(null);

  // Sync language when user data is loaded
  useEffect(() => {
    if (query.data && hasSyncedRef.current !== query.data.id) {
      syncLanguageFromUser(query.data);
      hasSyncedRef.current = query.data.id;
    }
  }, [query.data]);

  return query;
}

export function useLogin(): UseMutationResult<Token, Error, LoginCredentials> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: loginApi,
    onSuccess: (data) => {
      setTokens(data);
      // Invalidate and refetch user
      queryClient.invalidateQueries({ queryKey: authKeys.user });
    },
  });
}

/**
 * Hook for token refresh.
 * Useful for manual refresh or when implementing background refresh.
 */
export function useRefreshToken(): UseMutationResult<
  Token | null,
  Error,
  void
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const tokenData = await refreshTokenApi();
      if (tokenData) {
        setTokens(tokenData);
      }
      return tokenData;
    },
    onSuccess: (data) => {
      if (data) {
        queryClient.invalidateQueries({ queryKey: authKeys.user });
      }
    },
  });
}

/**
 * Hook for registration mutation.
 * Automatically logs in after successful registration.
 */
export function useRegister(): UseMutationResult<User, Error, RegisterData> {
  const login = useLogin();

  return useMutation({
    mutationFn: registerApi,
    onSuccess: async (_, variables) => {
      // Auto-login after registration
      await login.mutateAsync({
        email: variables.email,
        password: variables.password,
      });
    },
  });
}

/**
 * Hook for registration with invitation mutation.
 * Used when a user signs up via an invitation link.
 */
export function useRegisterWithInvitation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      data: RegisterWithInvitationData & { email: string },
    ) => {
      const user = await registerWithInvitationApi(data);
      // Login after registration
      const formData = new URLSearchParams();
      formData.append("username", data.email);
      formData.append("password", data.password);

      const response = await fetch(
        `${import.meta.env.VITE_API_URL || ""}/v1/auth/login`,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: formData,
        },
      );

      if (!response.ok) {
        throw new Error(i18n.t("error_login_after_register"));
      }

      const tokenData: Token = await response.json();
      setTokens(tokenData);
      return user;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: authKeys.user });
    },
  });
}

/**
 * Logout function that clears auth state and redirects to login.
 * Uses router.invalidate() to force re-evaluation of route guards.
 */
export async function logout() {
  // Import dynamically to avoid circular dependency
  const { router, queryClient } = await import("@/main");

  // Clear tokens first
  removeToken();

  // Cancel any in-flight queries to prevent 401s
  await queryClient.cancelQueries();

  // Clear all cached data
  queryClient.clear();

  // Invalidate router to force beforeLoad re-evaluation
  await router.invalidate();

  // Navigate to login
  await router.navigate({ to: "/login" });
}

/**
 * Hook for logout.
 * Returns the logout function for use in components.
 */
export function useLogout() {
  return logout;
}

/**
 * Combined auth hook for convenience.
 */
export function useAuth() {
  const { data: user, isLoading, error } = useCurrentUser();
  const loginMutation = useLogin();
  const registerMutation = useRegister();
  const refreshMutation = useRefreshToken();

  // Use reactive token state - this will trigger re-render when token changes
  const hasToken = useHasToken();

  // User is authenticated only if we have BOTH a token AND user data
  const isAuthenticated = hasToken && !!user;

  return {
    user: hasToken ? user : null,
    isLoading: hasToken && isLoading,
    isAuthenticated,
    error,
    login: loginMutation.mutateAsync,
    loginError: loginMutation.error,
    isLoggingIn: loginMutation.isPending,
    register: registerMutation.mutateAsync,
    registerError: registerMutation.error,
    isRegistering: registerMutation.isPending,
    refreshToken: refreshMutation.mutateAsync,
    isRefreshing: refreshMutation.isPending,
    logout,
  };
}

let refreshInterval: ReturnType<typeof setInterval> | null = null;

export function startTokenRefresh(): void {
  if (refreshInterval) return;

  refreshInterval = setInterval(async () => {
    if (isLoggedIn() && isTokenExpired()) {
      await tryRefreshToken();
    }
  }, 60 * 1000); // Check every minute
}

export function stopTokenRefresh(): void {
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
  }
}
