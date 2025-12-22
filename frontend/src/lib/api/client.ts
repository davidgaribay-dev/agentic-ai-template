/**
 * Core API client for frontend-backend communication.
 *
 * Provides base fetch wrapper with error handling and type-safe methods.
 */

export const API_BASE = import.meta.env.VITE_API_URL || "/api"

/** Pydantic validation error item */
interface ValidationErrorItem {
  type: string
  loc: (string | number)[]
  msg: string
  input?: unknown
  ctx?: Record<string, unknown>
}

/** Standard error response body from the API */
export interface ApiErrorBody {
  detail?: string | ValidationErrorItem[]
  message?: string
}

export class ApiError extends Error {
  status: number
  statusText: string
  body?: unknown

  constructor(status: number, statusText: string, body?: unknown) {
    super(`API error: ${status} ${statusText}`)
    this.name = "ApiError"
    this.status = status
    this.statusText = statusText
    this.body = body
  }
}

/**
 * Type guard to check if an error body has the expected API error structure
 */
function isApiErrorBody(body: unknown): body is ApiErrorBody {
  return (
    typeof body === "object" &&
    body !== null &&
    ("detail" in body || "message" in body)
  )
}

/**
 * Format a detail field that could be a string or an array of validation errors.
 */
function formatDetailMessage(detail: string | ValidationErrorItem[]): string {
  if (typeof detail === "string") {
    return detail
  }
  // Handle Pydantic validation error array - extract messages
  if (Array.isArray(detail) && detail.length > 0) {
    return detail.map((err) => {
      const field = err.loc.slice(1).join(".")  // Skip "body" prefix
      return field ? `${field}: ${err.msg}` : err.msg
    }).join("; ")
  }
  return ""
}

/**
 * Extract a user-friendly error message from an API error.
 * Safely handles unknown error types and provides fallback messages.
 */
export function getApiErrorMessage(error: unknown, fallback = "An error occurred"): string {
  if (error instanceof ApiError) {
    if (isApiErrorBody(error.body)) {
      if (error.body.detail) {
        return formatDetailMessage(error.body.detail)
      }
      return error.body.message || fallback
    }
    return `${error.status}: ${error.statusText}`
  }
  if (error instanceof Error) {
    return error.message
  }
  return fallback
}

/**
 * Extract the detail field from an API error body.
 * Returns undefined if the error doesn't have the expected structure.
 */
export function getApiErrorDetail(error: unknown): string | undefined {
  if (error instanceof ApiError && isApiErrorBody(error.body)) {
    if (error.body.detail) {
      return formatDetailMessage(error.body.detail)
    }
  }
  return undefined
}

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
  body?: unknown
  headers?: Record<string, string>
  signal?: AbortSignal
}

export async function api<T>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<T> {
  const { method = "GET", body, headers = {}, signal } = options

  const config: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    signal,
  }

  if (body) {
    config.body = JSON.stringify(body)
  }

  const response = await fetch(`${API_BASE}${endpoint}`, config)

  if (!response.ok) {
    const errorBody = await response.json().catch(() => undefined)
    throw new ApiError(response.status, response.statusText, errorBody)
  }

  return response.json()
}

export const apiClient = {
  get: <T>(endpoint: string, options?: Omit<RequestOptions, "method" | "body">) =>
    api<T>(endpoint, { ...options, method: "GET" }),

  post: <T>(endpoint: string, body: unknown, options?: Omit<RequestOptions, "method" | "body">) =>
    api<T>(endpoint, { ...options, method: "POST", body }),

  put: <T>(endpoint: string, body: unknown, options?: Omit<RequestOptions, "method" | "body">) =>
    api<T>(endpoint, { ...options, method: "PUT", body }),

  patch: <T>(endpoint: string, body: unknown, options?: Omit<RequestOptions, "method" | "body">) =>
    api<T>(endpoint, { ...options, method: "PATCH", body }),

  delete: <T>(endpoint: string, options?: Omit<RequestOptions, "method" | "body">) =>
    api<T>(endpoint, { ...options, method: "DELETE" }),
}

/** Helper to get auth header */
export function getAuthHeader(): Record<string, string> {
  const token = localStorage.getItem("auth_token")
  return token ? { Authorization: `Bearer ${token}` } : {}
}
