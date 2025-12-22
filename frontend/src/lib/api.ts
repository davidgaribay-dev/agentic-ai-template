/**
 * API client for frontend-backend communication.
 *
 * This module provides:
 * 1. A base fetch wrapper with error handling
 * 2. Type-safe API client methods
 * 3. SSE streaming support for chat
 *
 * For auto-generated typed client, run: npm run generate-client
 * This generates types from the backend OpenAPI spec.
 */

const API_BASE = import.meta.env.VITE_API_URL || "/api"

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

export interface User {
  id: string
  email: string
  full_name: string | null
  is_active: boolean
  is_platform_admin: boolean
  profile_image_url: string | null
}

export type OrgRole = "owner" | "admin" | "member"
export type TeamRole = "admin" | "member" | "viewer"
export type InvitationStatus = "pending" | "accepted" | "expired" | "revoked"

export interface Organization {
  id: string
  name: string
  slug: string
  description: string | null
  logo_url: string | null
  created_at: string
  updated_at: string
}

export interface OrganizationsPublic {
  data: Organization[]
  count: number
}

export interface OrganizationCreate {
  name: string
  description?: string | null
}

export interface OrganizationUpdate {
  name?: string | null
  description?: string | null
}

export interface OrganizationMember {
  id: string
  user_id: string
  organization_id: string
  role: OrgRole
  created_at: string
  updated_at: string
  user_email: string
  user_full_name: string | null
  user_profile_image_url: string | null
}

export interface OrganizationMembersPublic {
  data: OrganizationMember[]
  count: number
}

export interface Team {
  id: string
  name: string
  slug: string
  description: string | null
  logo_url: string | null
  organization_id: string
  created_by_id: string | null
  created_at: string
  updated_at: string
}

export interface TeamsPublic {
  data: Team[]
  count: number
}

export interface TeamCreate {
  name: string
  description?: string | null
}

export interface TeamUpdate {
  name?: string | null
  description?: string | null
}

export interface TeamMember {
  id: string
  team_id: string
  org_member_id: string
  role: TeamRole
  created_at: string
  updated_at: string
  user_id: string
  user_email: string
  user_full_name: string | null
  user_profile_image_url: string | null
  org_role: OrgRole
}

export interface TeamMembersPublic {
  data: TeamMember[]
  count: number
}

export interface Invitation {
  id: string
  email: string
  organization_id: string
  team_id: string | null
  org_role: OrgRole
  team_role: TeamRole | null
  status: InvitationStatus
  expires_at: string
  created_at: string
  invited_by: User | null
  organization: Organization
  team: Team | null
}

export interface InvitationsPublic {
  data: Invitation[]
  count: number
}

export interface InvitationCreate {
  email: string
  org_role?: OrgRole
  team_id?: string | null
  team_role?: TeamRole | null
}

export interface InvitationInfo {
  email: string
  organization_name: string
  team_name: string | null
  org_role: OrgRole
  team_role: TeamRole | null
  invited_by_name: string | null
  expires_at: string
}

export interface InvitationCreatedResponse {
  id: string
  email: string
  organization_id: string
  team_id: string | null
  org_role: OrgRole
  team_role: TeamRole | null
  status: InvitationStatus
  expires_at: string
  created_at: string
  accepted_at: string | null
  token: string
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

export interface Message {
  message: string
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

export interface Item {
  id: string
  title: string
  description: string | null
  owner_id: string
}

export interface ItemsPublic {
  data: Item[]
  count: number
}

export interface ItemCreate {
  title: string
  description?: string | null
}

export interface ItemUpdate {
  title?: string | null
  description?: string | null
}

export interface ChatRequest {
  message: string
  conversation_id?: string
  organization_id?: string
  team_id?: string
  stream?: boolean
}

export interface ChatResponse {
  message: string
  conversation_id: string
}

export interface HealthResponse {
  status: string
  llm_configured: boolean
}

export interface ChatMessage {
  role: "user" | "assistant"
  content: string
}

export interface Conversation {
  id: string
  title: string
  user_id: string | null
  organization_id: string | null
  team_id: string | null
  created_by_id: string | null
  created_at: string
  updated_at: string
  is_starred: boolean
  deleted_at: string | null
}

export interface ConversationsPublic {
  data: Conversation[]
  count: number
}

export interface ConversationCreate {
  title: string
}

export interface ConversationUpdate {
  title?: string | null
}

/** SSE Stream Event Types - Discriminated Union for type-safe event handling */
export type StreamTokenEvent = {
  type: "token"
  data: string
}

export type StreamTitleEvent = {
  type: "title"
  data: {
    title: string
    conversation_id: string
  }
}

export type StreamDoneEvent = {
  type: "done"
  data: {
    conversation_id: string
  }
}

export type StreamErrorEvent = {
  type: "error"
  data: string
}

export type StreamToolApprovalEvent = {
  type: "tool_approval"
  data: {
    conversation_id: string
    tool_name: string
    tool_args: Record<string, unknown>
    tool_call_id: string | null
    tool_description: string
  }
}

/** Union of all possible stream events */
export type StreamEvent =
  | StreamTokenEvent
  | StreamTitleEvent
  | StreamDoneEvent
  | StreamErrorEvent
  | StreamToolApprovalEvent

export interface ToolApprovalRequest {
  conversation_id: string
  organization_id: string
  team_id?: string | null
  approved: boolean
  stream?: boolean
}

export interface ToolApprovalInfo {
  conversation_id: string
  tool_name: string
  tool_args: Record<string, unknown>
  tool_call_id: string | null
  tool_description: string
}

/** Helper to get auth header */
function getAuthHeader(): Record<string, string> {
  const token = localStorage.getItem("auth_token")
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export const itemsApi = {
  /** Get all items (paginated) */
  getItems: (skip = 0, limit = 100) =>
    apiClient.get<ItemsPublic>(`/v1/items/?skip=${skip}&limit=${limit}`, {
      headers: getAuthHeader(),
    }),

  /** Get a single item by ID */
  getItem: (itemId: string) =>
    apiClient.get<Item>(`/v1/items/${itemId}`, {
      headers: getAuthHeader(),
    }),

  /** Create a new item */
  createItem: (item: ItemCreate) =>
    apiClient.post<Item>("/v1/items/", item, {
      headers: getAuthHeader(),
    }),

  /** Update an item */
  updateItem: (itemId: string, item: ItemUpdate) =>
    apiClient.patch<Item>(`/v1/items/${itemId}`, item, {
      headers: getAuthHeader(),
    }),

  /** Delete an item */
  deleteItem: (itemId: string) =>
    apiClient.delete<Message>(`/v1/items/${itemId}`, {
      headers: getAuthHeader(),
    }),
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

export const conversationsApi = {
  /** Get all conversations (paginated), optionally filtered by team */
  getConversations: (skip = 0, limit = 100, teamId?: string) => {
    const params = new URLSearchParams({ skip: String(skip), limit: String(limit) })
    if (teamId) params.append("team_id", teamId)
    return apiClient.get<ConversationsPublic>(`/v1/conversations/?${params}`, {
      headers: getAuthHeader(),
    })
  },

  /** Get a single conversation by ID */
  getConversation: (conversationId: string) =>
    apiClient.get<Conversation>(`/v1/conversations/${conversationId}`, {
      headers: getAuthHeader(),
    }),

  /** Create a new conversation */
  createConversation: (conversation: ConversationCreate, organizationId?: string, teamId?: string) => {
    const params = new URLSearchParams()
    if (organizationId) params.append("organization_id", organizationId)
    if (teamId) params.append("team_id", teamId)
    const queryString = params.toString()
    return apiClient.post<Conversation>(
      `/v1/conversations/${queryString ? `?${queryString}` : ""}`,
      conversation,
      { headers: getAuthHeader() }
    )
  },

  /** Update a conversation (rename) */
  updateConversation: (conversationId: string, conversation: ConversationUpdate) =>
    apiClient.patch<Conversation>(`/v1/conversations/${conversationId}`, conversation, {
      headers: getAuthHeader(),
    }),

  /** Soft delete a conversation */
  deleteConversation: (conversationId: string) =>
    apiClient.delete<Message>(`/v1/conversations/${conversationId}`, {
      headers: getAuthHeader(),
    }),

  /** Star or unstar a conversation */
  starConversation: (conversationId: string, isStarred: boolean) =>
    apiClient.post<Conversation>(
      `/v1/conversations/${conversationId}/star?is_starred=${isStarred}`,
      {},
      { headers: getAuthHeader() }
    ),
}

export const agentApi = {
  /** Check agent health status */
  health: () => apiClient.get<HealthResponse>("/v1/agent/health"),

  /** Send a chat message (non-streaming) */
  chat: (request: ChatRequest) =>
    apiClient.post<ChatResponse>("/v1/agent/chat", { ...request, stream: false }, {
      headers: getAuthHeader(),
    }),

  /** Get conversation history */
  getHistory: (conversationId: string) =>
    apiClient.get<ChatMessage[]>(`/v1/agent/conversations/${conversationId}/history`, {
      headers: getAuthHeader(),
    }),

  /** Update conversation title */
  updateTitle: (conversationId: string, title: string) =>
    apiClient.patch<{ success: boolean; title: string }>(
      `/v1/agent/conversations/${conversationId}/title?title=${encodeURIComponent(title)}`,
      {},
      { headers: getAuthHeader() }
    ),

  /**
   * Stream a chat response using Server-Sent Events.
   * Returns an async generator that yields typed stream events.
   */
  chatStream: async function* (
    request: Omit<ChatRequest, "stream">,
    signal?: AbortSignal
  ): AsyncGenerator<StreamEvent> {
    const token = localStorage.getItem("auth_token")
    const headers: Record<string, string> = { "Content-Type": "application/json" }
    if (token) {
      headers["Authorization"] = `Bearer ${token}`
    }

    const response = await fetch(`${API_BASE}/v1/agent/chat`, {
      method: "POST",
      headers,
      body: JSON.stringify({ ...request, stream: true }),
      signal,
    })

    if (!response.ok) {
      throw new ApiError(response.status, response.statusText)
    }

    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error("No response body")
    }

    const decoder = new TextDecoder()
    let buffer = ""
    let currentEvent = "message"

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split("\n")
      buffer = lines.pop() || ""

      for (const line of lines) {
        if (line.startsWith("event:")) {
          currentEvent = line.slice(6).trim()
          continue
        }

        if (line.startsWith("data:")) {
          const data = line.slice(5).trim()
          if (data) {
            try {
              const parsed = JSON.parse(data)

              if (currentEvent === "title" && parsed.title) {
                yield {
                  type: "title",
                  data: { title: parsed.title, conversation_id: parsed.conversation_id }
                } satisfies StreamTitleEvent
              } else if (currentEvent === "error" || parsed.error) {
                yield {
                  type: "error",
                  data: String(parsed.error || parsed.message || "Unknown error")
                } satisfies StreamErrorEvent
              } else if (currentEvent === "done") {
                yield {
                  type: "done",
                  data: { conversation_id: parsed.conversation_id }
                } satisfies StreamDoneEvent
              } else if (currentEvent === "tool_approval") {
                yield {
                  type: "tool_approval",
                  data: {
                    conversation_id: parsed.conversation_id,
                    tool_name: parsed.tool_name,
                    tool_args: parsed.tool_args || {},
                    tool_call_id: parsed.tool_call_id || null,
                    tool_description: parsed.tool_description || "",
                  }
                } satisfies StreamToolApprovalEvent
              } else if (parsed.token) {
                yield {
                  type: "token",
                  data: String(parsed.token)
                } satisfies StreamTokenEvent
              } else if (parsed.conversation_id && !parsed.token && !parsed.title) {
                yield {
                  type: "done",
                  data: { conversation_id: parsed.conversation_id }
                } satisfies StreamDoneEvent
              }
            } catch {
              // Non-JSON lines are ignored (SSE keepalive, etc.)
            }
          }
          currentEvent = "message"
        }
      }
    }
  },

  /** Get pending tool approval for a conversation */
  getPendingApproval: (conversationId: string, organizationId: string, teamId?: string) => {
    const params = new URLSearchParams({ organization_id: organizationId })
    if (teamId) params.append("team_id", teamId)
    return apiClient.get<ToolApprovalInfo | null>(
      `/v1/agent/conversations/${conversationId}/pending-approval?${params}`,
      { headers: getAuthHeader() }
    )
  },

  /** Resume a conversation after tool approval decision (non-streaming) */
  resume: (request: ToolApprovalRequest) =>
    apiClient.post<ChatResponse>("/v1/agent/resume", { ...request, stream: false }, {
      headers: getAuthHeader(),
    }),

  /**
   * Resume a conversation with streaming response.
   * Returns an async generator that yields typed stream events.
   */
  resumeStream: async function* (
    request: Omit<ToolApprovalRequest, "stream">,
    signal?: AbortSignal
  ): AsyncGenerator<StreamEvent> {
    const token = localStorage.getItem("auth_token")
    const headers: Record<string, string> = { "Content-Type": "application/json" }
    if (token) {
      headers["Authorization"] = `Bearer ${token}`
    }

    const response = await fetch(`${API_BASE}/v1/agent/resume`, {
      method: "POST",
      headers,
      body: JSON.stringify({ ...request, stream: true }),
      signal,
    })

    if (!response.ok) {
      throw new ApiError(response.status, response.statusText)
    }

    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error("No response body")
    }

    const decoder = new TextDecoder()
    let buffer = ""
    let currentEvent = "message"

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split("\n")
      buffer = lines.pop() || ""

      for (const line of lines) {
        if (line.startsWith("event:")) {
          currentEvent = line.slice(6).trim()
          continue
        }

        if (line.startsWith("data:")) {
          const data = line.slice(5).trim()
          if (data) {
            try {
              const parsed = JSON.parse(data)

              if (currentEvent === "error" || parsed.error) {
                yield {
                  type: "error",
                  data: String(parsed.error || parsed.message || "Unknown error")
                } satisfies StreamErrorEvent
              } else if (currentEvent === "done") {
                yield {
                  type: "done",
                  data: { conversation_id: parsed.conversation_id }
                } satisfies StreamDoneEvent
              } else if (currentEvent === "tool_approval") {
                yield {
                  type: "tool_approval",
                  data: {
                    conversation_id: parsed.conversation_id,
                    tool_name: parsed.tool_name,
                    tool_args: parsed.tool_args || {},
                    tool_call_id: parsed.tool_call_id || null,
                    tool_description: parsed.tool_description || "",
                  }
                } satisfies StreamToolApprovalEvent
              } else if (parsed.token) {
                yield {
                  type: "token",
                  data: String(parsed.token)
                } satisfies StreamTokenEvent
              } else if (parsed.conversation_id && !parsed.token) {
                yield {
                  type: "done",
                  data: { conversation_id: parsed.conversation_id }
                } satisfies StreamDoneEvent
              }
            } catch {
              // Non-JSON lines are ignored (SSE keepalive, etc.)
            }
          }
          currentEvent = "message"
        }
      }
    }
  },
}

export const organizationsApi = {
  /** Get user's organizations */
  getOrganizations: (skip = 0, limit = 100) =>
    apiClient.get<OrganizationsPublic>(`/v1/organizations/?skip=${skip}&limit=${limit}`, {
      headers: getAuthHeader(),
    }),

  /** Get organization by ID */
  getOrganization: (orgId: string) =>
    apiClient.get<Organization>(`/v1/organizations/${orgId}`, {
      headers: getAuthHeader(),
    }),

  /** Create a new organization */
  createOrganization: (org: OrganizationCreate) =>
    apiClient.post<Organization>("/v1/organizations/", org, {
      headers: getAuthHeader(),
    }),

  /** Update an organization */
  updateOrganization: (orgId: string, org: OrganizationUpdate) =>
    apiClient.patch<Organization>(`/v1/organizations/${orgId}`, org, {
      headers: getAuthHeader(),
    }),

  /** Delete an organization */
  deleteOrganization: (orgId: string) =>
    apiClient.delete<Message>(`/v1/organizations/${orgId}`, {
      headers: getAuthHeader(),
    }),

  /** Get organization members */
  getMembers: (orgId: string, skip = 0, limit = 100) =>
    apiClient.get<OrganizationMembersPublic>(
      `/v1/organizations/${orgId}/members?skip=${skip}&limit=${limit}`,
      { headers: getAuthHeader() }
    ),

  /** Update member role */
  updateMemberRole: (orgId: string, memberId: string, role: OrgRole) =>
    apiClient.patch<OrganizationMember>(
      `/v1/organizations/${orgId}/members/${memberId}`,
      { role },
      { headers: getAuthHeader() }
    ),

  /** Remove member from organization */
  removeMember: (orgId: string, memberId: string) =>
    apiClient.delete<Message>(`/v1/organizations/${orgId}/members/${memberId}`, {
      headers: getAuthHeader(),
    }),

  /** Transfer ownership */
  transferOwnership: (orgId: string, newOwnerId: string) =>
    apiClient.post<Message>(
      `/v1/organizations/${orgId}/transfer-ownership`,
      { new_owner_id: newOwnerId },
      { headers: getAuthHeader() }
    ),

  /** Leave organization */
  leaveOrganization: (orgId: string) =>
    apiClient.post<Message>(`/v1/organizations/${orgId}/leave`, {}, {
      headers: getAuthHeader(),
    }),

  /** Get current user's membership in an organization */
  getMyMembership: (orgId: string) =>
    apiClient.get<{ id: string; organization_id: string; user_id: string; role: OrgRole; created_at: string; updated_at: string }>(
      `/v1/organizations/${orgId}/my-membership`,
      { headers: getAuthHeader() }
    ),

  /** Upload organization logo */
  uploadLogo: async (orgId: string, file: File): Promise<Organization> => {
    const formData = new FormData()
    formData.append("file", file)

    const token = localStorage.getItem("auth_token")
    const headers: Record<string, string> = {}
    if (token) {
      headers["Authorization"] = `Bearer ${token}`
    }

    const response = await fetch(`${API_BASE}/v1/organizations/${orgId}/logo`, {
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

  /** Delete organization logo */
  deleteLogo: (orgId: string) =>
    apiClient.delete<Organization>(`/v1/organizations/${orgId}/logo`, {
      headers: getAuthHeader(),
    }),
}

export const teamsApi = {
  /** Get all teams in an organization (requires teams:read permission) */
  getTeams: (orgId: string, skip = 0, limit = 100) =>
    apiClient.get<TeamsPublic>(
      `/v1/organizations/${orgId}/teams?skip=${skip}&limit=${limit}`,
      { headers: getAuthHeader() }
    ),

  /** Get teams the current user is a member of in an organization */
  getMyTeams: (orgId: string, skip = 0, limit = 100) =>
    apiClient.get<TeamsPublic>(
      `/v1/organizations/${orgId}/teams/my-teams?skip=${skip}&limit=${limit}`,
      { headers: getAuthHeader() }
    ),

  /** Get team by ID */
  getTeam: (orgId: string, teamId: string) =>
    apiClient.get<Team>(`/v1/organizations/${orgId}/teams/${teamId}`, {
      headers: getAuthHeader(),
    }),

  /** Create a new team */
  createTeam: (orgId: string, team: TeamCreate) =>
    apiClient.post<Team>(`/v1/organizations/${orgId}/teams`, team, {
      headers: getAuthHeader(),
    }),

  /** Update a team */
  updateTeam: (orgId: string, teamId: string, team: TeamUpdate) =>
    apiClient.patch<Team>(`/v1/organizations/${orgId}/teams/${teamId}`, team, {
      headers: getAuthHeader(),
    }),

  /** Delete a team */
  deleteTeam: (orgId: string, teamId: string) =>
    apiClient.delete<Message>(`/v1/organizations/${orgId}/teams/${teamId}`, {
      headers: getAuthHeader(),
    }),

  /** Get team members */
  getMembers: (orgId: string, teamId: string, skip = 0, limit = 100) =>
    apiClient.get<TeamMembersPublic>(
      `/v1/organizations/${orgId}/teams/${teamId}/members?skip=${skip}&limit=${limit}`,
      { headers: getAuthHeader() }
    ),

  /** Add member to team (user must be org member) */
  addMember: (orgId: string, teamId: string, userId: string, role: TeamRole = "member") =>
    apiClient.post<TeamMember>(
      `/v1/organizations/${orgId}/teams/${teamId}/members?user_id=${userId}&role=${role}`,
      {},
      { headers: getAuthHeader() }
    ),

  /** Update team member role */
  updateMemberRole: (orgId: string, teamId: string, memberId: string, role: TeamRole) =>
    apiClient.patch<TeamMember>(
      `/v1/organizations/${orgId}/teams/${teamId}/members/${memberId}`,
      { role },
      { headers: getAuthHeader() }
    ),

  /** Remove member from team */
  removeMember: (orgId: string, teamId: string, memberId: string) =>
    apiClient.delete<Message>(
      `/v1/organizations/${orgId}/teams/${teamId}/members/${memberId}`,
      { headers: getAuthHeader() }
    ),

  /** Leave team */
  leaveTeam: (orgId: string, teamId: string) =>
    apiClient.post<Message>(`/v1/organizations/${orgId}/teams/${teamId}/leave`, {}, {
      headers: getAuthHeader(),
    }),

  /** Upload team logo */
  uploadLogo: async (orgId: string, teamId: string, file: File): Promise<Team> => {
    const formData = new FormData()
    formData.append("file", file)

    const token = localStorage.getItem("auth_token")
    const headers: Record<string, string> = {}
    if (token) {
      headers["Authorization"] = `Bearer ${token}`
    }

    const response = await fetch(`${API_BASE}/v1/organizations/${orgId}/teams/${teamId}/logo`, {
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

  /** Delete team logo */
  deleteLogo: (orgId: string, teamId: string) =>
    apiClient.delete<Team>(`/v1/organizations/${orgId}/teams/${teamId}/logo`, {
      headers: getAuthHeader(),
    }),
}

export const invitationsApi = {
  /** Get organization invitations */
  getInvitations: (orgId: string, skip = 0, limit = 100) =>
    apiClient.get<InvitationsPublic>(
      `/v1/organizations/${orgId}/invitations?skip=${skip}&limit=${limit}`,
      { headers: getAuthHeader() }
    ),

  /** Create an invitation */
  createInvitation: (orgId: string, invitation: InvitationCreate) =>
    apiClient.post<InvitationCreatedResponse>(
      `/v1/organizations/${orgId}/invitations`,
      invitation,
      { headers: getAuthHeader() }
    ),

  /** Revoke an invitation */
  revokeInvitation: (orgId: string, invitationId: string) =>
    apiClient.delete<Message>(
      `/v1/organizations/${orgId}/invitations/${invitationId}`,
      { headers: getAuthHeader() }
    ),

  /** Resend an invitation */
  resendInvitation: (orgId: string, invitationId: string) =>
    apiClient.post<{ invitation: Invitation; token: string }>(
      `/v1/organizations/${orgId}/invitations/${invitationId}/resend`,
      {},
      { headers: getAuthHeader() }
    ),

  /** Get invitation info by token (public - no auth required) */
  getInvitationInfo: (token: string) =>
    apiClient.get<InvitationInfo>(`/v1/invitations/info?token=${encodeURIComponent(token)}`),

  /** Accept invitation (authenticated user) */
  acceptInvitation: (token: string) =>
    apiClient.post<Message>("/v1/invitations/accept", { token }, {
      headers: getAuthHeader(),
    }),
}

export type LLMProvider = "openai" | "anthropic" | "google"

export interface APIKeyStatus {
  provider: string
  is_configured: boolean
  level: "team" | "org" | "environment" | null
  has_team_override: boolean
  has_org_key: boolean
  has_env_fallback: boolean
}

export interface APIKeyCreate {
  provider: LLMProvider
  api_key: string
}

export interface APIKeyDeleteResponse {
  message: string
  provider: string
  level: string
}

export interface DefaultProviderResponse {
  provider: string
  level: string
}

export interface DefaultProviderUpdate {
  provider: LLMProvider
}

export const apiKeysApi = {
  // ==========================================================================
  // Organization-level API Keys
  // ==========================================================================

  /** List API key status for all providers at the organization level */
  listOrgKeys: (orgId: string) =>
    apiClient.get<APIKeyStatus[]>(`/v1/organizations/${orgId}/api-keys`, {
      headers: getAuthHeader(),
    }),

  /** Set an organization-level API key */
  setOrgKey: (orgId: string, data: APIKeyCreate) =>
    apiClient.post<APIKeyStatus>(`/v1/organizations/${orgId}/api-keys`, data, {
      headers: getAuthHeader(),
    }),

  /** Delete an organization-level API key */
  deleteOrgKey: (orgId: string, provider: LLMProvider) =>
    apiClient.delete<APIKeyDeleteResponse>(
      `/v1/organizations/${orgId}/api-keys/${provider}`,
      { headers: getAuthHeader() }
    ),

  /** Get the default LLM provider for the organization */
  getOrgDefaultProvider: (orgId: string) =>
    apiClient.get<DefaultProviderResponse>(
      `/v1/organizations/${orgId}/default-provider`,
      { headers: getAuthHeader() }
    ),

  /** Set the default LLM provider for the organization */
  setOrgDefaultProvider: (orgId: string, data: DefaultProviderUpdate) =>
    apiClient.put<DefaultProviderResponse>(
      `/v1/organizations/${orgId}/default-provider`,
      data,
      { headers: getAuthHeader() }
    ),

  // ==========================================================================
  // Team-level API Keys
  // ==========================================================================

  /** List API key status for all providers at the team level */
  listTeamKeys: (orgId: string, teamId: string) =>
    apiClient.get<APIKeyStatus[]>(
      `/v1/organizations/${orgId}/teams/${teamId}/api-keys`,
      { headers: getAuthHeader() }
    ),

  /** Set a team-level API key */
  setTeamKey: (orgId: string, teamId: string, data: APIKeyCreate) =>
    apiClient.post<APIKeyStatus>(
      `/v1/organizations/${orgId}/teams/${teamId}/api-keys`,
      data,
      { headers: getAuthHeader() }
    ),

  /** Delete a team-level API key */
  deleteTeamKey: (orgId: string, teamId: string, provider: LLMProvider) =>
    apiClient.delete<APIKeyDeleteResponse>(
      `/v1/organizations/${orgId}/teams/${teamId}/api-keys/${provider}`,
      { headers: getAuthHeader() }
    ),

  /** Get the default LLM provider for the team */
  getTeamDefaultProvider: (orgId: string, teamId: string) =>
    apiClient.get<DefaultProviderResponse>(
      `/v1/organizations/${orgId}/teams/${teamId}/default-provider`,
      { headers: getAuthHeader() }
    ),

  /** Set the default LLM provider for the team */
  setTeamDefaultProvider: (orgId: string, teamId: string, data: DefaultProviderUpdate) =>
    apiClient.put<DefaultProviderResponse>(
      `/v1/organizations/${orgId}/teams/${teamId}/default-provider`,
      data,
      { headers: getAuthHeader() }
    ),
}

// =============================================================================
// Prompts API Types
// =============================================================================

export type PromptType = "template" | "system"

export interface Prompt {
  id: string
  name: string
  description: string | null
  content: string
  prompt_type: PromptType
  organization_id: string | null
  team_id: string | null
  user_id: string | null
  is_active: boolean
  created_by_id: string | null
  created_at: string
  updated_at: string
}

export interface PromptsPublic {
  data: Prompt[]
  count: number
}

export interface PromptCreate {
  name: string
  description?: string | null
  content: string
  prompt_type?: PromptType
}

export interface PromptUpdate {
  name?: string | null
  description?: string | null
  content?: string | null
}

export interface PromptsAvailable {
  org_prompts: Prompt[]
  team_prompts: Prompt[]
  user_prompts: Prompt[]
}

export interface ActiveSystemPrompt {
  content: string
  org_prompt: Prompt | null
  team_prompt: Prompt | null
  user_prompt: Prompt | null
}

export const promptsApi = {
  // ==========================================================================
  // Organization-level Prompts
  // ==========================================================================

  /** List organization-level prompts */
  listOrgPrompts: (orgId: string, promptType?: PromptType, skip = 0, limit = 100) => {
    const params = new URLSearchParams({ skip: String(skip), limit: String(limit) })
    if (promptType) params.append("prompt_type", promptType)
    return apiClient.get<PromptsPublic>(
      `/v1/organizations/${orgId}/prompts?${params}`,
      { headers: getAuthHeader() }
    )
  },

  /** Get an organization-level prompt by ID */
  getOrgPrompt: (orgId: string, promptId: string) =>
    apiClient.get<Prompt>(`/v1/organizations/${orgId}/prompts/${promptId}`, {
      headers: getAuthHeader(),
    }),

  /** Create an organization-level prompt */
  createOrgPrompt: (orgId: string, prompt: PromptCreate) =>
    apiClient.post<Prompt>(`/v1/organizations/${orgId}/prompts`, prompt, {
      headers: getAuthHeader(),
    }),

  /** Update an organization-level prompt */
  updateOrgPrompt: (orgId: string, promptId: string, prompt: PromptUpdate) =>
    apiClient.patch<Prompt>(`/v1/organizations/${orgId}/prompts/${promptId}`, prompt, {
      headers: getAuthHeader(),
    }),

  /** Delete an organization-level prompt */
  deleteOrgPrompt: (orgId: string, promptId: string) =>
    apiClient.delete<void>(`/v1/organizations/${orgId}/prompts/${promptId}`, {
      headers: getAuthHeader(),
    }),

  /** Activate an organization-level system prompt */
  activateOrgPrompt: (orgId: string, promptId: string) =>
    apiClient.post<Prompt>(`/v1/organizations/${orgId}/prompts/${promptId}/activate`, {}, {
      headers: getAuthHeader(),
    }),

  // ==========================================================================
  // Team-level Prompts
  // ==========================================================================

  /** List team-level prompts */
  listTeamPrompts: (orgId: string, teamId: string, promptType?: PromptType, skip = 0, limit = 100) => {
    const params = new URLSearchParams({ skip: String(skip), limit: String(limit) })
    if (promptType) params.append("prompt_type", promptType)
    return apiClient.get<PromptsPublic>(
      `/v1/organizations/${orgId}/teams/${teamId}/prompts?${params}`,
      { headers: getAuthHeader() }
    )
  },

  /** Get a team-level prompt by ID */
  getTeamPrompt: (orgId: string, teamId: string, promptId: string) =>
    apiClient.get<Prompt>(
      `/v1/organizations/${orgId}/teams/${teamId}/prompts/${promptId}`,
      { headers: getAuthHeader() }
    ),

  /** Create a team-level prompt */
  createTeamPrompt: (orgId: string, teamId: string, prompt: PromptCreate) =>
    apiClient.post<Prompt>(
      `/v1/organizations/${orgId}/teams/${teamId}/prompts`,
      prompt,
      { headers: getAuthHeader() }
    ),

  /** Update a team-level prompt */
  updateTeamPrompt: (orgId: string, teamId: string, promptId: string, prompt: PromptUpdate) =>
    apiClient.patch<Prompt>(
      `/v1/organizations/${orgId}/teams/${teamId}/prompts/${promptId}`,
      prompt,
      { headers: getAuthHeader() }
    ),

  /** Delete a team-level prompt */
  deleteTeamPrompt: (orgId: string, teamId: string, promptId: string) =>
    apiClient.delete<void>(
      `/v1/organizations/${orgId}/teams/${teamId}/prompts/${promptId}`,
      { headers: getAuthHeader() }
    ),

  /** Activate a team-level system prompt */
  activateTeamPrompt: (orgId: string, teamId: string, promptId: string) =>
    apiClient.post<Prompt>(
      `/v1/organizations/${orgId}/teams/${teamId}/prompts/${promptId}/activate`,
      {},
      { headers: getAuthHeader() }
    ),

  /** Get all prompts available in the current context */
  getAvailablePrompts: (orgId: string, teamId: string, promptType?: PromptType) => {
    const params = promptType ? `?prompt_type=${promptType}` : ""
    return apiClient.get<PromptsAvailable>(
      `/v1/organizations/${orgId}/teams/${teamId}/prompts/available${params}`,
      { headers: getAuthHeader() }
    )
  },

  /** Get the effective system prompt (concatenated from all levels) */
  getActiveSystemPrompt: (orgId: string, teamId: string) =>
    apiClient.get<ActiveSystemPrompt>(
      `/v1/organizations/${orgId}/teams/${teamId}/prompts/active-system`,
      { headers: getAuthHeader() }
    ),

  // ==========================================================================
  // User-level Prompts (Global)
  // ==========================================================================

  /** List user's personal prompts */
  listUserPrompts: (promptType?: PromptType, skip = 0, limit = 100) => {
    const params = new URLSearchParams({ skip: String(skip), limit: String(limit) })
    if (promptType) params.append("prompt_type", promptType)
    return apiClient.get<PromptsPublic>(
      `/v1/users/me/prompts?${params}`,
      { headers: getAuthHeader() }
    )
  },

  /** Get a user's personal prompt by ID */
  getUserPrompt: (promptId: string) =>
    apiClient.get<Prompt>(`/v1/users/me/prompts/${promptId}`, {
      headers: getAuthHeader(),
    }),

  /** Create a personal prompt */
  createUserPrompt: (prompt: PromptCreate) =>
    apiClient.post<Prompt>("/v1/users/me/prompts", prompt, {
      headers: getAuthHeader(),
    }),

  /** Update a personal prompt */
  updateUserPrompt: (promptId: string, prompt: PromptUpdate) =>
    apiClient.patch<Prompt>(`/v1/users/me/prompts/${promptId}`, prompt, {
      headers: getAuthHeader(),
    }),

  /** Delete a personal prompt */
  deleteUserPrompt: (promptId: string) =>
    apiClient.delete<void>(`/v1/users/me/prompts/${promptId}`, {
      headers: getAuthHeader(),
    }),

  /** Activate a personal system prompt */
  activateUserPrompt: (promptId: string) =>
    apiClient.post<Prompt>(`/v1/users/me/prompts/${promptId}/activate`, {}, {
      headers: getAuthHeader(),
    }),
}

// =============================================================================
// Chat Visibility Settings API Types
// =============================================================================

export interface ChatSettings {
  chat_enabled: boolean
  chat_panel_enabled: boolean
  memory_enabled: boolean
  mcp_enabled: boolean
  disabled_mcp_servers: string[]
  disabled_tools: string[]
}

export interface OrganizationChatSettings extends ChatSettings {
  id: string
  organization_id: string
  mcp_allow_custom_servers: boolean
  mcp_max_servers_per_team: number
  mcp_max_servers_per_user: number
  created_at: string
  updated_at: string
}

export interface TeamChatSettings extends ChatSettings {
  id: string
  team_id: string
  mcp_allow_custom_servers: boolean
  created_at: string
  updated_at: string
}

export interface UserChatSettings extends ChatSettings {
  id: string
  user_id: string
  created_at: string
  updated_at: string
}

export interface ChatSettingsUpdate {
  chat_enabled?: boolean
  chat_panel_enabled?: boolean
  memory_enabled?: boolean
  mcp_enabled?: boolean
  disabled_mcp_servers?: string[]
  disabled_tools?: string[]
}

export interface OrgSettingsUpdate extends ChatSettingsUpdate {
  mcp_allow_custom_servers?: boolean
  mcp_max_servers_per_team?: number
  mcp_max_servers_per_user?: number
}

export interface TeamSettingsUpdate extends ChatSettingsUpdate {
  mcp_allow_custom_servers?: boolean
}

export type DisabledByLevel = "org" | "team" | null

export interface EffectiveChatSettings {
  chat_enabled: boolean
  chat_disabled_by: DisabledByLevel
  chat_panel_enabled: boolean
  chat_panel_disabled_by: DisabledByLevel
  memory_enabled: boolean
  memory_disabled_by: DisabledByLevel
  mcp_enabled: boolean
  mcp_disabled_by: DisabledByLevel
  mcp_allow_custom_servers: boolean
  mcp_custom_servers_disabled_by: DisabledByLevel
  disabled_mcp_servers: string[]
  disabled_tools: string[]
}

export const chatSettingsApi = {
  /** Get organization chat visibility settings */
  getOrgSettings: (orgId: string) =>
    apiClient.get<OrganizationChatSettings>(
      `/v1/organizations/${orgId}/chat-settings`,
      { headers: getAuthHeader() }
    ),

  /** Update organization chat visibility settings */
  updateOrgSettings: (orgId: string, settings: OrgSettingsUpdate) =>
    apiClient.put<OrganizationChatSettings>(
      `/v1/organizations/${orgId}/chat-settings`,
      settings,
      { headers: getAuthHeader() }
    ),

  /** Get team chat visibility settings */
  getTeamSettings: (orgId: string, teamId: string) =>
    apiClient.get<TeamChatSettings>(
      `/v1/organizations/${orgId}/teams/${teamId}/chat-settings`,
      { headers: getAuthHeader() }
    ),

  /** Update team chat visibility settings */
  updateTeamSettings: (orgId: string, teamId: string, settings: TeamSettingsUpdate) =>
    apiClient.put<TeamChatSettings>(
      `/v1/organizations/${orgId}/teams/${teamId}/chat-settings`,
      settings,
      { headers: getAuthHeader() }
    ),

  /** Get user chat visibility settings */
  getUserSettings: () =>
    apiClient.get<UserChatSettings>("/v1/users/me/chat-settings", {
      headers: getAuthHeader(),
    }),

  /** Update user chat visibility settings */
  updateUserSettings: (settings: ChatSettingsUpdate) =>
    apiClient.put<UserChatSettings>("/v1/users/me/chat-settings", settings, {
      headers: getAuthHeader(),
    }),

  /** Get effective chat settings (computed from hierarchy) */
  getEffectiveSettings: (organizationId?: string, teamId?: string) => {
    const params = new URLSearchParams()
    if (organizationId) params.append("organization_id", organizationId)
    if (teamId) params.append("team_id", teamId)
    const queryString = params.toString()
    return apiClient.get<EffectiveChatSettings>(
      `/v1/settings/effective${queryString ? `?${queryString}` : ""}`,
      { headers: getAuthHeader() }
    )
  },
}

// =============================================================================
// Memory API Types
// =============================================================================

export type MemoryType = "preference" | "fact" | "entity" | "relationship" | "summary"

export interface Memory {
  id: string
  content: string
  type: MemoryType
  created_at: string
  conversation_id?: string
  source?: string
}

export interface MemoriesListResponse {
  data: Memory[]
  count: number
}

export interface DeleteMemoryResponse {
  success: boolean
}

export interface ClearMemoriesResponse {
  success: boolean
  deleted_count: number
}

export const memoryApi = {
  /** List current user's memories */
  listMemories: (orgId?: string, teamId?: string, limit = 50) => {
    const params = new URLSearchParams()
    if (orgId) params.append("org_id", orgId)
    if (teamId) params.append("team_id", teamId)
    params.append("limit", String(limit))
    return apiClient.get<MemoriesListResponse>(
      `/v1/memory/users/me/memories?${params}`,
      { headers: getAuthHeader() }
    )
  },

  /** Delete a specific memory */
  deleteMemory: (memoryId: string, orgId?: string, teamId?: string) => {
    const params = new URLSearchParams()
    if (orgId) params.append("org_id", orgId)
    if (teamId) params.append("team_id", teamId)
    const queryString = params.toString()
    return apiClient.delete<DeleteMemoryResponse>(
      `/v1/memory/users/me/memories/${memoryId}${queryString ? `?${queryString}` : ""}`,
      { headers: getAuthHeader() }
    )
  },

  /** Clear all user memories */
  clearAllMemories: (orgId?: string, teamId?: string) => {
    const params = new URLSearchParams()
    if (orgId) params.append("org_id", orgId)
    if (teamId) params.append("team_id", teamId)
    const queryString = params.toString()
    return apiClient.delete<ClearMemoriesResponse>(
      `/v1/memory/users/me/memories${queryString ? `?${queryString}` : ""}`,
      { headers: getAuthHeader() }
    )
  },
}

// =============================================================================
// MCP Server API Types
// =============================================================================

export type MCPTransport = "http" | "sse" | "streamable_http"
export type MCPAuthType = "none" | "bearer" | "api_key"

export interface MCPServer {
  id: string
  organization_id: string
  team_id: string | null
  user_id: string | null
  name: string
  description: string | null
  url: string
  transport: MCPTransport
  auth_type: MCPAuthType
  auth_header_name: string | null
  has_auth_secret: boolean
  enabled: boolean
  is_builtin: boolean
  tool_prefix: boolean
  scope: "org" | "team" | "user"
  created_by_id: string
  created_at: string
  updated_at: string
}

export interface MCPServersPublic {
  data: MCPServer[]
  count: number
}

export interface MCPServerCreate {
  name: string
  description?: string | null
  url: string
  transport?: MCPTransport
  auth_type?: MCPAuthType
  auth_header_name?: string | null
  auth_secret?: string | null
  enabled?: boolean
  tool_prefix?: boolean
}

export interface MCPServerUpdate {
  name?: string | null
  description?: string | null
  url?: string | null
  transport?: MCPTransport | null
  auth_type?: MCPAuthType | null
  auth_header_name?: string | null
  auth_secret?: string | null
  enabled?: boolean | null
  tool_prefix?: boolean | null
}

export const mcpServersApi = {
  // ==========================================================================
  // Organization-level MCP Servers
  // ==========================================================================

  /** List organization-level MCP servers */
  listOrgServers: (orgId: string) =>
    apiClient.get<MCPServersPublic>(
      `/v1/organizations/${orgId}/mcp-servers`,
      { headers: getAuthHeader() }
    ),

  /** Get an organization-level MCP server */
  getOrgServer: (orgId: string, serverId: string) =>
    apiClient.get<MCPServer>(
      `/v1/organizations/${orgId}/mcp-servers/${serverId}`,
      { headers: getAuthHeader() }
    ),

  /** Create an organization-level MCP server */
  createOrgServer: (orgId: string, data: MCPServerCreate) =>
    apiClient.post<MCPServer>(
      `/v1/organizations/${orgId}/mcp-servers`,
      data,
      { headers: getAuthHeader() }
    ),

  /** Update an organization-level MCP server */
  updateOrgServer: (orgId: string, serverId: string, data: MCPServerUpdate) =>
    apiClient.patch<MCPServer>(
      `/v1/organizations/${orgId}/mcp-servers/${serverId}`,
      data,
      { headers: getAuthHeader() }
    ),

  /** Delete an organization-level MCP server */
  deleteOrgServer: (orgId: string, serverId: string) =>
    apiClient.delete<void>(
      `/v1/organizations/${orgId}/mcp-servers/${serverId}`,
      { headers: getAuthHeader() }
    ),

  // ==========================================================================
  // Team-level MCP Servers
  // ==========================================================================

  /** List team-level MCP servers */
  listTeamServers: (orgId: string, teamId: string) =>
    apiClient.get<MCPServersPublic>(
      `/v1/organizations/${orgId}/teams/${teamId}/mcp-servers`,
      { headers: getAuthHeader() }
    ),

  /** Get a team-level MCP server */
  getTeamServer: (orgId: string, teamId: string, serverId: string) =>
    apiClient.get<MCPServer>(
      `/v1/organizations/${orgId}/teams/${teamId}/mcp-servers/${serverId}`,
      { headers: getAuthHeader() }
    ),

  /** Create a team-level MCP server */
  createTeamServer: (orgId: string, teamId: string, data: MCPServerCreate) =>
    apiClient.post<MCPServer>(
      `/v1/organizations/${orgId}/teams/${teamId}/mcp-servers`,
      data,
      { headers: getAuthHeader() }
    ),

  /** Update a team-level MCP server */
  updateTeamServer: (orgId: string, teamId: string, serverId: string, data: MCPServerUpdate) =>
    apiClient.patch<MCPServer>(
      `/v1/organizations/${orgId}/teams/${teamId}/mcp-servers/${serverId}`,
      data,
      { headers: getAuthHeader() }
    ),

  /** Delete a team-level MCP server */
  deleteTeamServer: (orgId: string, teamId: string, serverId: string) =>
    apiClient.delete<void>(
      `/v1/organizations/${orgId}/teams/${teamId}/mcp-servers/${serverId}`,
      { headers: getAuthHeader() }
    ),

  // ==========================================================================
  // User-level MCP Servers
  // ==========================================================================

  /** List user's personal MCP servers */
  listUserServers: (orgId: string, teamId: string) =>
    apiClient.get<MCPServersPublic>(
      `/v1/mcp-servers/me?organization_id=${orgId}&team_id=${teamId}`,
      { headers: getAuthHeader() }
    ),

  /** Get a user's personal MCP server */
  getUserServer: (serverId: string) =>
    apiClient.get<MCPServer>(
      `/v1/mcp-servers/me/${serverId}`,
      { headers: getAuthHeader() }
    ),

  /** Create a user's personal MCP server */
  createUserServer: (orgId: string, teamId: string, data: MCPServerCreate) =>
    apiClient.post<MCPServer>(
      `/v1/mcp-servers/me?organization_id=${orgId}&team_id=${teamId}`,
      data,
      { headers: getAuthHeader() }
    ),

  /** Update a user's personal MCP server */
  updateUserServer: (serverId: string, data: MCPServerUpdate) =>
    apiClient.patch<MCPServer>(
      `/v1/mcp-servers/me/${serverId}`,
      data,
      { headers: getAuthHeader() }
    ),

  /** Delete a user's personal MCP server */
  deleteUserServer: (serverId: string) =>
    apiClient.delete<void>(
      `/v1/mcp-servers/me/${serverId}`,
      { headers: getAuthHeader() }
    ),

  // ==========================================================================
  // Effective Servers (combined)
  // ==========================================================================

  /** Get all effective MCP servers for the current user */
  listEffectiveServers: (orgId: string, teamId?: string) => {
    const params = new URLSearchParams({ organization_id: orgId })
    if (teamId) params.append("team_id", teamId)
    return apiClient.get<MCPServersPublic>(
      `/v1/mcp-servers/effective?${params}`,
      { headers: getAuthHeader() }
    )
  },

  /** Get all tools from effective MCP servers */
  listEffectiveTools: (orgId: string, teamId?: string) => {
    const params = new URLSearchParams({ organization_id: orgId })
    if (teamId) params.append("team_id", teamId)
    return apiClient.get<MCPToolsList>(
      `/v1/mcp-servers/effective/tools?${params}`,
      { headers: getAuthHeader() }
    )
  },

  // ==========================================================================
  // Test Connection
  // ==========================================================================

  /** Test connection to an organization-level MCP server */
  testOrgServer: (orgId: string, serverId: string) =>
    apiClient.post<MCPTestResult>(
      `/v1/organizations/${orgId}/mcp-servers/${serverId}/test`,
      {},
      { headers: getAuthHeader() }
    ),

  /** Test connection to a team-level MCP server */
  testTeamServer: (orgId: string, teamId: string, serverId: string) =>
    apiClient.post<MCPTestResult>(
      `/v1/organizations/${orgId}/teams/${teamId}/mcp-servers/${serverId}/test`,
      {},
      { headers: getAuthHeader() }
    ),

  /** Test connection to a user's personal MCP server */
  testUserServer: (serverId: string) =>
    apiClient.post<MCPTestResult>(
      `/v1/mcp-servers/me/${serverId}/test`,
      {},
      { headers: getAuthHeader() }
    ),
}

// =============================================================================
// MCP Tool Configuration Types
// =============================================================================

export interface MCPTool {
  name: string
  description: string
}

export interface MCPTestResult {
  success: boolean
  message: string
  tools: MCPTool[]
  tool_count: number
  connection_time_ms: number | null
  error_details: string | null
}

export interface MCPServerWithTools {
  server_id: string
  server_name: string
  server_description: string | null
  scope: "org" | "team" | "user"
  enabled: boolean
  tools: MCPTool[]
  tool_count: number
  error: string | null
}

export interface MCPToolsList {
  servers: MCPServerWithTools[]
  total_tools: number
  total_servers: number
  error_count: number
}

export interface ToolConfigUpdate {
  disabled_mcp_servers?: string[]
  disabled_tools?: string[]
}
