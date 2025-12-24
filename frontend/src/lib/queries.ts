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

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  agentApi,
  chatSettingsApi,
  conversationsApi,
  memoryApi,
  mcpServersApi,
  themeSettingsApi,
  type ChatRequest,
  type ChatMessage,
  type OrgSettingsUpdate,
  type TeamSettingsUpdate,
  type ChatSettingsUpdate,
  type ConversationUpdate,
  type MCPServerCreate,
  type MCPServerUpdate,
  type OrganizationThemeSettingsUpdate,
  type TeamThemeSettingsUpdate,
  type UserThemeSettingsUpdate,
} from "./api";
import { ragSettingsApi, documentsApi } from "./api";
import type {
  OrganizationRAGSettingsUpdate,
  TeamRAGSettingsUpdate,
  UserRAGSettingsUpdate,
  UploadDocumentParams,
  ListDocumentsParams,
} from "./api";

export const queryKeys = {
  agent: {
    health: ["agent", "health"] as const,
    history: (conversationId: string) =>
      ["agent", "history", conversationId] as const,
  },
  conversations: {
    all: ["conversations"] as const,
    list: (teamId?: string, searchQuery?: string) =>
      ["conversations", "list", teamId, searchQuery] as const,
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
  themeSettings: {
    org: (orgId: string) => ["themeSettings", "org", orgId] as const,
    team: (orgId: string, teamId: string) =>
      ["themeSettings", "team", orgId, teamId] as const,
    user: ["themeSettings", "user"] as const,
    effective: (orgId?: string, teamId?: string, systemPrefersDark?: boolean) =>
      ["themeSettings", "effective", orgId, teamId, systemPrefersDark] as const,
    predefined: ["themeSettings", "predefined"] as const,
  },
  memory: {
    user: (orgId?: string, teamId?: string) =>
      ["memory", "user", orgId, teamId] as const,
  },
  mcpServers: {
    org: (orgId: string) => ["mcpServers", "org", orgId] as const,
    team: (orgId: string, teamId: string) =>
      ["mcpServers", "team", orgId, teamId] as const,
    user: (orgId: string, teamId?: string) =>
      ["mcpServers", "user", orgId, teamId] as const,
    effective: (orgId: string, teamId?: string) =>
      ["mcpServers", "effective", orgId, teamId] as const,
  },
  ragSettings: {
    org: (orgId: string) => ["ragSettings", "org", orgId] as const,
    team: (orgId: string, teamId: string) =>
      ["ragSettings", "team", orgId, teamId] as const,
    user: ["ragSettings", "user"] as const,
    effective: (orgId?: string, teamId?: string) =>
      ["ragSettings", "effective", orgId, teamId] as const,
  },
  documents: {
    all: ["documents"] as const,
    list: (orgId?: string, teamId?: string, status?: string) =>
      ["documents", "list", orgId, teamId, status] as const,
    detail: (id: string) => ["documents", "detail", id] as const,
  },
};

/**
 * Hook to check agent health status.
 * Useful for showing configuration warnings.
 */
export function useAgentHealth() {
  return useQuery({
    queryKey: queryKeys.agent.health,
    queryFn: () => agentApi.health(),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
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
  });
}

/**
 * Mutation hook for sending chat messages (non-streaming).
 * Automatically updates the conversation history cache.
 */
export function useChatMutation() {
  const queryClient = useQueryClient();

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
          ],
        );
      }
    },
  });
}

/** Hook to fetch paginated conversations list, optionally filtered by team and/or search query. */
export function useConversations(
  teamId?: string,
  searchQuery?: string,
  skip = 0,
  limit = 100,
) {
  return useQuery({
    queryKey: queryKeys.conversations.list(teamId, searchQuery),
    queryFn: () =>
      conversationsApi.getConversations(skip, limit, teamId, searchQuery),
    enabled: !!teamId,
  });
}

/** Mutation hook for updating a conversation with optimistic update. */
export function useUpdateConversation(teamId?: string) {
  const queryClient = useQueryClient();
  const queryKey = queryKeys.conversations.list(teamId);

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: ConversationUpdate }) =>
      conversationsApi.updateConversation(id, data),
    onMutate: async ({ id, data }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey });

      // Snapshot the previous value
      const previousData = queryClient.getQueryData<{
        data: { id: string; title: string }[];
        count: number;
      }>(queryKey);

      // Optimistically update the conversation
      if (previousData && data.title) {
        queryClient.setQueryData(queryKey, {
          ...previousData,
          data: previousData.data.map((c) =>
            c.id === id ? { ...c, title: data.title } : c,
          ),
        });
      }

      return { previousData };
    },
    onError: (error, _variables, context) => {
      // Rollback to the previous value on error
      if (context?.previousData) {
        queryClient.setQueryData(queryKey, context.previousData);
      }
      console.error("Failed to update conversation:", error);
    },
    onSettled: () => {
      // Always refetch after error or success
      queryClient.invalidateQueries({ queryKey });
    },
  });
}

/** Mutation hook for deleting a conversation (soft delete) with optimistic update. */
export function useDeleteConversation(teamId?: string) {
  const queryClient = useQueryClient();
  const queryKey = queryKeys.conversations.list(teamId);

  return useMutation({
    mutationFn: (id: string) => conversationsApi.deleteConversation(id),
    onMutate: async (id) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey });

      // Snapshot the previous value
      const previousData = queryClient.getQueryData<{
        data: { id: string }[];
        count: number;
      }>(queryKey);

      // Optimistically remove the conversation
      if (previousData) {
        queryClient.setQueryData(queryKey, {
          ...previousData,
          data: previousData.data.filter((c) => c.id !== id),
          count: previousData.count - 1,
        });
      }

      return { previousData };
    },
    onError: (error, _id, context) => {
      // Rollback to the previous value on error
      if (context?.previousData) {
        queryClient.setQueryData(queryKey, context.previousData);
      }
      console.error("Failed to delete conversation:", error);
    },
    onSettled: () => {
      // Always refetch after error or success
      queryClient.invalidateQueries({ queryKey });
    },
  });
}

/** Mutation hook for starring/unstarring a conversation with optimistic update. */
export function useStarConversation(teamId?: string) {
  const queryClient = useQueryClient();
  const queryKey = queryKeys.conversations.list(teamId);

  return useMutation({
    mutationFn: ({ id, isStarred }: { id: string; isStarred: boolean }) =>
      conversationsApi.starConversation(id, isStarred),
    onMutate: async ({ id, isStarred }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey });

      // Snapshot the previous value
      const previousData = queryClient.getQueryData<{
        data: { id: string; is_starred: boolean }[];
        count: number;
      }>(queryKey);

      // Optimistically update the star status
      if (previousData) {
        queryClient.setQueryData(queryKey, {
          ...previousData,
          data: previousData.data.map((c) =>
            c.id === id ? { ...c, is_starred: isStarred } : c,
          ),
        });
      }

      return { previousData };
    },
    onError: (error, _variables, context) => {
      // Rollback to the previous value on error
      if (context?.previousData) {
        queryClient.setQueryData(queryKey, context.previousData);
      }
      console.error("Failed to update star status:", error);
    },
    onSettled: () => {
      // Always refetch after error or success
      queryClient.invalidateQueries({ queryKey });
    },
  });
}

/** Hook to fetch organization chat visibility settings. */
export function useOrgChatSettings(orgId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.chatSettings.org(orgId ?? ""),
    queryFn: () => chatSettingsApi.getOrgSettings(orgId!),
    enabled: !!orgId,
  });
}

/** Mutation hook for updating organization chat settings. */
export function useUpdateOrgChatSettings(orgId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (settings: OrgSettingsUpdate) =>
      chatSettingsApi.updateOrgSettings(orgId!, settings),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.chatSettings.org(orgId!),
      });
      queryClient.invalidateQueries({
        queryKey: ["chatSettings", "effective"],
      });
    },
  });
}

/** Hook to fetch team chat visibility settings. */
export function useTeamChatSettings(
  orgId: string | undefined,
  teamId: string | undefined,
) {
  return useQuery({
    queryKey: queryKeys.chatSettings.team(orgId ?? "", teamId ?? ""),
    queryFn: () => chatSettingsApi.getTeamSettings(orgId!, teamId!),
    enabled: !!orgId && !!teamId,
  });
}

/** Mutation hook for updating team chat settings. */
export function useUpdateTeamChatSettings(
  orgId: string | undefined,
  teamId: string | undefined,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (settings: TeamSettingsUpdate) =>
      chatSettingsApi.updateTeamSettings(orgId!, teamId!, settings),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.chatSettings.team(orgId!, teamId!),
      });
      queryClient.invalidateQueries({
        queryKey: ["chatSettings", "effective"],
      });
    },
  });
}

/** Hook to fetch user chat visibility settings. */
export function useUserChatSettings() {
  return useQuery({
    queryKey: queryKeys.chatSettings.user,
    queryFn: () => chatSettingsApi.getUserSettings(),
  });
}

/** Mutation hook for updating user chat settings. */
export function useUpdateUserChatSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (settings: ChatSettingsUpdate) =>
      chatSettingsApi.updateUserSettings(settings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.chatSettings.user });
      queryClient.invalidateQueries({
        queryKey: ["chatSettings", "effective"],
      });
    },
  });
}

/** Hook to fetch effective (computed) chat settings. */
export function useEffectiveChatSettings(
  orgId: string | undefined,
  teamId: string | undefined,
) {
  return useQuery({
    queryKey: queryKeys.chatSettings.effective(orgId, teamId),
    queryFn: () => chatSettingsApi.getEffectiveSettings(orgId, teamId),
    enabled: !!orgId,
    staleTime: 1000 * 60, // 1 minute
  });
}

// =============================================================================
// Memory Hooks
// =============================================================================

/** Hook to fetch user memories. */
export function useUserMemories(orgId?: string, teamId?: string, limit = 50) {
  return useQuery({
    queryKey: queryKeys.memory.user(orgId, teamId),
    queryFn: () => memoryApi.listMemories(orgId, teamId, limit),
  });
}

/** Mutation hook for deleting a specific memory. */
export function useDeleteMemory(orgId?: string, teamId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (memoryId: string) =>
      memoryApi.deleteMemory(memoryId, orgId, teamId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.memory.user(orgId, teamId),
      });
    },
    onError: (error) => {
      console.error("Failed to delete memory:", error);
    },
  });
}

/** Mutation hook for clearing all user memories. */
export function useClearAllMemories(orgId?: string, teamId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => memoryApi.clearAllMemories(orgId, teamId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.memory.user(orgId, teamId),
      });
    },
    onError: (error) => {
      console.error("Failed to clear memories:", error);
    },
  });
}

// =============================================================================
// MCP Server Hooks
// =============================================================================

/** Hook to fetch organization-level MCP servers. */
export function useOrgMCPServers(orgId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.mcpServers.org(orgId ?? ""),
    queryFn: () => mcpServersApi.listOrgServers(orgId!),
    enabled: !!orgId,
  });
}

/** Hook to fetch team-level MCP servers. */
export function useTeamMCPServers(
  orgId: string | undefined,
  teamId: string | undefined,
) {
  return useQuery({
    queryKey: queryKeys.mcpServers.team(orgId ?? "", teamId ?? ""),
    queryFn: () => mcpServersApi.listTeamServers(orgId!, teamId!),
    enabled: !!orgId && !!teamId,
  });
}

/** Hook to fetch user-level MCP servers. */
export function useUserMCPServers(
  orgId: string | undefined,
  teamId: string | undefined,
) {
  return useQuery({
    queryKey: queryKeys.mcpServers.user(orgId ?? "", teamId),
    queryFn: () => mcpServersApi.listUserServers(orgId!, teamId!),
    enabled: !!orgId && !!teamId,
  });
}

/** Hook to fetch effective (combined) MCP servers for a user. */
export function useEffectiveMCPServers(
  orgId: string | undefined,
  teamId: string | undefined,
) {
  return useQuery({
    queryKey: queryKeys.mcpServers.effective(orgId ?? "", teamId),
    queryFn: () => mcpServersApi.listEffectiveServers(orgId!, teamId),
    enabled: !!orgId,
  });
}

/** Mutation hook for creating an org-level MCP server. */
export function useCreateOrgMCPServer(orgId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: MCPServerCreate) =>
      mcpServersApi.createOrgServer(orgId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.mcpServers.org(orgId!),
      });
    },
  });
}

/** Mutation hook for updating an org-level MCP server. */
export function useUpdateOrgMCPServer(orgId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      serverId,
      data,
    }: {
      serverId: string;
      data: MCPServerUpdate;
    }) => mcpServersApi.updateOrgServer(orgId!, serverId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.mcpServers.org(orgId!),
      });
    },
  });
}

/** Mutation hook for deleting an org-level MCP server. */
export function useDeleteOrgMCPServer(orgId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (serverId: string) =>
      mcpServersApi.deleteOrgServer(orgId!, serverId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.mcpServers.org(orgId!),
      });
    },
  });
}

/** Mutation hook for creating a team-level MCP server. */
export function useCreateTeamMCPServer(
  orgId: string | undefined,
  teamId: string | undefined,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: MCPServerCreate) =>
      mcpServersApi.createTeamServer(orgId!, teamId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.mcpServers.team(orgId!, teamId!),
      });
    },
  });
}

/** Mutation hook for updating a team-level MCP server. */
export function useUpdateTeamMCPServer(
  orgId: string | undefined,
  teamId: string | undefined,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      serverId,
      data,
    }: {
      serverId: string;
      data: MCPServerUpdate;
    }) => mcpServersApi.updateTeamServer(orgId!, teamId!, serverId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.mcpServers.team(orgId!, teamId!),
      });
    },
  });
}

/** Mutation hook for deleting a team-level MCP server. */
export function useDeleteTeamMCPServer(
  orgId: string | undefined,
  teamId: string | undefined,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (serverId: string) =>
      mcpServersApi.deleteTeamServer(orgId!, teamId!, serverId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.mcpServers.team(orgId!, teamId!),
      });
    },
  });
}

/** Mutation hook for creating a user-level MCP server. */
export function useCreateUserMCPServer(
  orgId: string | undefined,
  teamId: string | undefined,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: MCPServerCreate) =>
      mcpServersApi.createUserServer(orgId!, teamId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.mcpServers.user(orgId!, teamId),
      });
    },
  });
}

/** Mutation hook for updating a user-level MCP server. */
export function useUpdateUserMCPServer(
  orgId: string | undefined,
  teamId: string | undefined,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      serverId,
      data,
    }: {
      serverId: string;
      data: MCPServerUpdate;
    }) => mcpServersApi.updateUserServer(serverId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.mcpServers.user(orgId!, teamId),
      });
    },
  });
}

/** Mutation hook for deleting a user-level MCP server. */
export function useDeleteUserMCPServer(
  orgId: string | undefined,
  teamId: string | undefined,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (serverId: string) => mcpServersApi.deleteUserServer(serverId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.mcpServers.user(orgId!, teamId),
      });
    },
  });
}

/** Hook to fetch all tools from effective MCP servers. */
export function useEffectiveMCPTools(
  orgId: string | undefined,
  teamId: string | undefined,
) {
  return useQuery({
    queryKey: ["mcpTools", "effective", orgId, teamId],
    queryFn: () => mcpServersApi.listEffectiveTools(orgId!, teamId),
    enabled: !!orgId,
    staleTime: 5 * 60 * 1000, // 5 minutes - tools don't change often
  });
}

/** Mutation hook for updating user tool configuration. */
export function useUpdateUserToolConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (settings: ChatSettingsUpdate) =>
      chatSettingsApi.updateUserSettings(settings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.chatSettings.user });
      queryClient.invalidateQueries({
        queryKey: ["chatSettings", "effective"],
      });
    },
  });
}

// ============================================================================
// Theme Settings Hooks
// ============================================================================

/** Hook to fetch organization theme settings. */
export function useOrgThemeSettings(orgId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.themeSettings.org(orgId ?? ""),
    queryFn: () => themeSettingsApi.getOrgSettings(orgId!),
    enabled: !!orgId,
  });
}

/** Mutation hook for updating organization theme settings. */
export function useUpdateOrgThemeSettings(orgId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (settings: OrganizationThemeSettingsUpdate) =>
      themeSettingsApi.updateOrgSettings(orgId!, settings),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.themeSettings.org(orgId!),
      });
      queryClient.invalidateQueries({
        queryKey: ["themeSettings", "effective"],
      });
    },
  });
}

/** Hook to fetch team theme settings. */
export function useTeamThemeSettings(
  orgId: string | undefined,
  teamId: string | undefined,
) {
  return useQuery({
    queryKey: queryKeys.themeSettings.team(orgId ?? "", teamId ?? ""),
    queryFn: () => themeSettingsApi.getTeamSettings(orgId!, teamId!),
    enabled: !!orgId && !!teamId,
  });
}

/** Mutation hook for updating team theme settings. */
export function useUpdateTeamThemeSettings(
  orgId: string | undefined,
  teamId: string | undefined,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (settings: TeamThemeSettingsUpdate) =>
      themeSettingsApi.updateTeamSettings(orgId!, teamId!, settings),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.themeSettings.team(orgId!, teamId!),
      });
      queryClient.invalidateQueries({
        queryKey: ["themeSettings", "effective"],
      });
    },
  });
}

/** Hook to fetch user theme settings. */
export function useUserThemeSettings() {
  return useQuery({
    queryKey: queryKeys.themeSettings.user,
    queryFn: () => themeSettingsApi.getUserSettings(),
  });
}

/** Mutation hook for updating user theme settings. */
export function useUpdateUserThemeSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (settings: UserThemeSettingsUpdate) =>
      themeSettingsApi.updateUserSettings(settings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.themeSettings.user });
      queryClient.invalidateQueries({
        queryKey: ["themeSettings", "effective"],
      });
    },
  });
}

/** Hook to fetch effective (computed) theme settings. */
export function useEffectiveThemeSettings(
  orgId: string | undefined,
  teamId: string | undefined,
  systemPrefersDark?: boolean,
) {
  return useQuery({
    queryKey: queryKeys.themeSettings.effective(
      orgId,
      teamId,
      systemPrefersDark,
    ),
    queryFn: () =>
      themeSettingsApi.getEffectiveSettings(orgId, teamId, systemPrefersDark),
    enabled: !!orgId,
  });
}

/** Hook to fetch all predefined theme color palettes. */
export function usePredefinedThemes() {
  return useQuery({
    queryKey: queryKeys.themeSettings.predefined,
    queryFn: () => themeSettingsApi.getPredefinedThemes(),
    staleTime: Infinity, // Predefined themes never change
  });
}

// ============================================================================
// RAG Settings Hooks
// ============================================================================

/** Hook to fetch organization RAG settings. */
export function useOrgRAGSettings(orgId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.ragSettings.org(orgId ?? ""),
    queryFn: () => ragSettingsApi.getOrgSettings(orgId!),
    enabled: !!orgId,
  });
}

/** Mutation hook for updating organization RAG settings. */
export function useUpdateOrgRAGSettings(orgId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (settings: OrganizationRAGSettingsUpdate) =>
      ragSettingsApi.updateOrgSettings(orgId!, settings),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.ragSettings.org(orgId!),
      });
      queryClient.invalidateQueries({ queryKey: ["ragSettings", "effective"] });
    },
  });
}

/** Hook to fetch team RAG settings. */
export function useTeamRAGSettings(
  orgId: string | undefined,
  teamId: string | undefined,
) {
  return useQuery({
    queryKey: queryKeys.ragSettings.team(orgId ?? "", teamId ?? ""),
    queryFn: () => ragSettingsApi.getTeamSettings(orgId!, teamId!),
    enabled: !!orgId && !!teamId,
  });
}

/** Mutation hook for updating team RAG settings. */
export function useUpdateTeamRAGSettings(
  orgId: string | undefined,
  teamId: string | undefined,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (settings: TeamRAGSettingsUpdate) =>
      ragSettingsApi.updateTeamSettings(orgId!, teamId!, settings),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.ragSettings.team(orgId!, teamId!),
      });
      queryClient.invalidateQueries({ queryKey: ["ragSettings", "effective"] });
    },
  });
}

/** Hook to fetch user RAG settings. */
export function useUserRAGSettings() {
  return useQuery({
    queryKey: queryKeys.ragSettings.user,
    queryFn: () => ragSettingsApi.getUserSettings(),
  });
}

/** Mutation hook for updating user RAG settings. */
export function useUpdateUserRAGSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (settings: UserRAGSettingsUpdate) =>
      ragSettingsApi.updateUserSettings(settings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.ragSettings.user });
      queryClient.invalidateQueries({ queryKey: ["ragSettings", "effective"] });
    },
  });
}

/** Hook to fetch effective (computed) RAG settings. */
export function useEffectiveRAGSettings(
  orgId: string | undefined,
  teamId: string | undefined,
) {
  return useQuery({
    queryKey: queryKeys.ragSettings.effective(orgId, teamId),
    queryFn: () => ragSettingsApi.getEffectiveSettings(orgId, teamId),
    enabled: !!orgId,
    staleTime: 1000 * 60, // 1 minute
  });
}

// ============================================================================
// Documents Hooks
// ============================================================================

/** Hook to fetch paginated documents list with optional filters. */
export function useDocuments(params: ListDocumentsParams) {
  return useQuery({
    queryKey: queryKeys.documents.list(
      params.organization_id,
      params.team_id,
      params.status,
    ),
    queryFn: () => documentsApi.list(params),
    enabled: !!params.organization_id,
  });
}

/** Hook to fetch a single document by ID. */
export function useDocument(documentId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.documents.detail(documentId ?? ""),
    queryFn: () => documentsApi.get(documentId!),
    enabled: !!documentId,
  });
}

/** Mutation hook for uploading a document. */
export function useUploadDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: UploadDocumentParams) => documentsApi.upload(params),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.documents.list(
          variables.organization_id,
          variables.team_id,
        ),
      });
    },
  });
}

/** Mutation hook for deleting a document. */
export function useDeleteDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (documentId: string) => documentsApi.delete(documentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.documents.all });
    },
  });
}

/** Mutation hook for reprocessing a failed document. */
export function useReprocessDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (documentId: string) => documentsApi.reprocess(documentId),
    onSuccess: (_, documentId) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.documents.detail(documentId),
      });
    },
  });
}
