/**
 * Conversations API module.
 *
 * Handles chat conversation management (list, create, update, delete, star).
 */

import { apiClient, getAuthHeader } from "./client"
import type { Message } from "./types"

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

export const conversationsApi = {
  /** Get all conversations (paginated), optionally filtered by team and/or search query */
  getConversations: (skip = 0, limit = 100, teamId?: string, searchQuery?: string) => {
    const params = new URLSearchParams({ skip: String(skip), limit: String(limit) })
    if (teamId) params.append("team_id", teamId)
    if (searchQuery && searchQuery.trim()) params.append("search", searchQuery.trim())
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
