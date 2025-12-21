/**
 * TanStack Query hooks for the Agent API.
 *
 * These hooks provide:
 * - Automatic caching and background refetching
 * - Loading and error states
 * - Optimistic updates support
 *
 * Usage:
 *   const { data, isLoading, error } = useAgentHealth()
 *   const mutation = useChatMutation()
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  agentApi,
  chatSettingsApi,
  conversationsApi,
  memoryApi,
  type ChatRequest,
  type ChatMessage,
  type ChatSettingsUpdate,
  type ConversationUpdate,
} from "./api"

export const queryKeys = {
  agent: {
    health: ["agent", "health"] as const,
    history: (conversationId: string) =>
      ["agent", "history", conversationId] as const,
  },
  conversations: {
    all: ["conversations"] as const,
    list: (teamId?: string) => ["conversations", "list", teamId] as const,
    detail: (id: string) => ["conversations", "detail", id] as const,
  },
  chatSettings: {
    org: (orgId: string) => ["chatSettings", "org", orgId] as const,
    team: (orgId: string, teamId: string) =>
      ["chatSettings", "team", orgId, teamId] as const,
    user: ["chatSettings", "user"] as const,
    effective: (orgId?: string, teamId?: string) =>
      ["chatSettings", "effective", orgId, teamId] as const,
  },
  memory: {
    user: (orgId?: string, teamId?: string) =>
      ["memory", "user", orgId, teamId] as const,
  },
}

/**
 * Hook to check agent health status.
 * Useful for showing configuration warnings.
 */
export function useAgentHealth() {
  return useQuery({
    queryKey: queryKeys.agent.health,
    queryFn: () => agentApi.health(),
    staleTime: 1000 * 60 * 5, // 5 minutes
  })
}

/**
 * Hook to fetch conversation history.
 * Only fetches when a conversationId is provided.
 */
export function useConversationHistory(conversationId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.agent.history(conversationId ?? ""),
    queryFn: () => agentApi.getHistory(conversationId!),
    enabled: !!conversationId,
  })
}

/**
 * Mutation hook for sending chat messages (non-streaming).
 * Automatically updates the conversation history cache.
 */
export function useChatMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (request: ChatRequest) => agentApi.chat(request),
    onSuccess: (response, variables) => {
      if (variables.conversation_id) {
        queryClient.setQueryData<ChatMessage[]>(
          queryKeys.agent.history(variables.conversation_id),
          (old) => [
            ...(old || []),
            { role: "user", content: variables.message },
            { role: "assistant", content: response.message },
          ]
        )
      }
    },
  })
}

/** Hook to fetch paginated conversations list, optionally filtered by team. */
export function useConversations(teamId?: string, skip = 0, limit = 100) {
  return useQuery({
    queryKey: queryKeys.conversations.list(teamId),
    queryFn: () => conversationsApi.getConversations(skip, limit, teamId),
    enabled: !!teamId,
  })
}

/** Mutation hook for updating a conversation. */
export function useUpdateConversation(teamId?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: ConversationUpdate }) =>
      conversationsApi.updateConversation(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations.list(teamId) })
    },
    onError: (error) => {
      console.error("Failed to update conversation:", error)
    },
  })
}

/** Mutation hook for deleting a conversation (soft delete). */
export function useDeleteConversation(teamId?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => conversationsApi.deleteConversation(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations.list(teamId) })
    },
    onError: (error) => {
      console.error("Failed to delete conversation:", error)
    },
  })
}

/** Mutation hook for starring/unstarring a conversation. */
export function useStarConversation(teamId?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, isStarred }: { id: string; isStarred: boolean }) =>
      conversationsApi.starConversation(id, isStarred),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations.list(teamId) })
    },
    onError: (error) => {
      console.error("Failed to update star status:", error)
    },
  })
}

/** Hook to fetch organization chat visibility settings. */
export function useOrgChatSettings(orgId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.chatSettings.org(orgId ?? ""),
    queryFn: () => chatSettingsApi.getOrgSettings(orgId!),
    enabled: !!orgId,
  })
}

/** Mutation hook for updating organization chat settings. */
export function useUpdateOrgChatSettings(orgId: string | undefined) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (settings: ChatSettingsUpdate) =>
      chatSettingsApi.updateOrgSettings(orgId!, settings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.chatSettings.org(orgId!) })
      queryClient.invalidateQueries({ queryKey: ["chatSettings", "effective"] })
    },
  })
}

/** Hook to fetch team chat visibility settings. */
export function useTeamChatSettings(orgId: string | undefined, teamId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.chatSettings.team(orgId ?? "", teamId ?? ""),
    queryFn: () => chatSettingsApi.getTeamSettings(orgId!, teamId!),
    enabled: !!orgId && !!teamId,
  })
}

/** Mutation hook for updating team chat settings. */
export function useUpdateTeamChatSettings(
  orgId: string | undefined,
  teamId: string | undefined
) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (settings: ChatSettingsUpdate) =>
      chatSettingsApi.updateTeamSettings(orgId!, teamId!, settings),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.chatSettings.team(orgId!, teamId!),
      })
      queryClient.invalidateQueries({ queryKey: ["chatSettings", "effective"] })
    },
  })
}

/** Hook to fetch user chat visibility settings. */
export function useUserChatSettings() {
  return useQuery({
    queryKey: queryKeys.chatSettings.user,
    queryFn: () => chatSettingsApi.getUserSettings(),
  })
}

/** Mutation hook for updating user chat settings. */
export function useUpdateUserChatSettings() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (settings: ChatSettingsUpdate) =>
      chatSettingsApi.updateUserSettings(settings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.chatSettings.user })
      queryClient.invalidateQueries({ queryKey: ["chatSettings", "effective"] })
    },
  })
}

/** Hook to fetch effective (computed) chat settings. */
export function useEffectiveChatSettings(
  orgId: string | undefined,
  teamId: string | undefined
) {
  return useQuery({
    queryKey: queryKeys.chatSettings.effective(orgId, teamId),
    queryFn: () => chatSettingsApi.getEffectiveSettings(orgId, teamId),
    enabled: !!orgId,
    staleTime: 1000 * 60, // 1 minute
  })
}

// =============================================================================
// Memory Hooks
// =============================================================================

/** Hook to fetch user memories. */
export function useUserMemories(orgId?: string, teamId?: string, limit = 50) {
  return useQuery({
    queryKey: queryKeys.memory.user(orgId, teamId),
    queryFn: () => memoryApi.listMemories(orgId, teamId, limit),
  })
}

/** Mutation hook for deleting a specific memory. */
export function useDeleteMemory(orgId?: string, teamId?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (memoryId: string) => memoryApi.deleteMemory(memoryId, orgId, teamId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.memory.user(orgId, teamId) })
    },
    onError: (error) => {
      console.error("Failed to delete memory:", error)
    },
  })
}

/** Mutation hook for clearing all user memories. */
export function useClearAllMemories(orgId?: string, teamId?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => memoryApi.clearAllMemories(orgId, teamId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.memory.user(orgId, teamId) })
    },
    onError: (error) => {
      console.error("Failed to clear memories:", error)
    },
  })
}
