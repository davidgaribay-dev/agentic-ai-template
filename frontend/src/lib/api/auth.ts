/**
 * Authentication API module.
 *
 * Handles user authentication, profile management, and password operations.
 */

import { apiClient, getAuthHeader, API_BASE, ApiError } from "./client"
import type { Message } from "./types"

export interface User {
  id: string
  email: string
  full_name: string | null
  is_active: boolean
  is_platform_admin: boolean
  profile_image_url: string | null
}

export interface UsersPublic {
  data: User[]
  count: number
}

export interface Token {
  access_token: string
  refresh_token: string
  token_type: string
  expires_in: number // Access token expiry in seconds
}

export interface UpdatePassword {
  current_password: string
  new_password: string
}

export interface NewPassword {
  token: string
  new_password: string
}

export interface UserUpdateMe {
  full_name?: string | null
  email?: string | null
}

export const authApi = {
  /** Request password recovery email */
  recoverPassword: (email: string) =>
    apiClient.post<Message>(`/v1/auth/password-recovery/${email}`, {}),

  /** Reset password with token */
  resetPassword: (data: NewPassword) =>
    apiClient.post<Message>("/v1/auth/reset-password", data),

  /** Update current user's password */
  updatePassword: (data: UpdatePassword) =>
    apiClient.patch<Message>("/v1/auth/me/password", data, {
      headers: getAuthHeader(),
    }),

  /** Update current user's profile */
  updateMe: (data: UserUpdateMe) =>
    apiClient.patch<User>("/v1/auth/me", data, {
      headers: getAuthHeader(),
    }),

  /** Delete current user's account */
  deleteMe: () =>
    apiClient.delete<Message>("/v1/auth/me", {
      headers: getAuthHeader(),
    }),

  /** Upload profile image */
  uploadProfileImage: async (file: File): Promise<User> => {
    const formData = new FormData()
    formData.append("file", file)

    const token = localStorage.getItem("auth_token")
    const headers: Record<string, string> = {}
    if (token) {
      headers["Authorization"] = `Bearer ${token}`
    }

    const response = await fetch(`${API_BASE}/v1/auth/me/profile-image`, {
      method: "POST",
      headers,
      body: formData,
    })

    if (!response.ok) {
      const errorBody = await response.json().catch(() => undefined)
      throw new ApiError(response.status, response.statusText, errorBody)
    }

    return response.json()
  },

  /** Delete profile image */
  deleteProfileImage: () =>
    apiClient.delete<User>("/v1/auth/me/profile-image", {
      headers: getAuthHeader(),
    }),
}
