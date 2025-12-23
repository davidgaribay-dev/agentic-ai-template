/**
 * Memory API module.
 *
 * Handles user memory management for AI context.
 */

import { apiClient, getAuthHeader } from "./client";

export type MemoryType =
  | "preference"
  | "fact"
  | "entity"
  | "relationship"
  | "summary";

export interface Memory {
  id: string;
  content: string;
  type: MemoryType;
  created_at: string;
  conversation_id?: string;
  source?: string;
}

export interface MemoriesListResponse {
  data: Memory[];
  count: number;
}

export interface DeleteMemoryResponse {
  success: boolean;
}

export interface ClearMemoriesResponse {
  success: boolean;
  deleted_count: number;
}

export const memoryApi = {
  /** List current user's memories */
  listMemories: (orgId?: string, teamId?: string, limit = 50) => {
    const params = new URLSearchParams();
    if (orgId) params.append("org_id", orgId);
    if (teamId) params.append("team_id", teamId);
    params.append("limit", String(limit));
    return apiClient.get<MemoriesListResponse>(
      `/v1/memory/users/me/memories?${params}`,
      { headers: getAuthHeader() },
    );
  },

  /** Delete a specific memory */
  deleteMemory: (memoryId: string, orgId?: string, teamId?: string) => {
    const params = new URLSearchParams();
    if (orgId) params.append("org_id", orgId);
    if (teamId) params.append("team_id", teamId);
    const queryString = params.toString();
    return apiClient.delete<DeleteMemoryResponse>(
      `/v1/memory/users/me/memories/${memoryId}${queryString ? `?${queryString}` : ""}`,
      { headers: getAuthHeader() },
    );
  },

  /** Clear all user memories */
  clearAllMemories: (orgId?: string, teamId?: string) => {
    const params = new URLSearchParams();
    if (orgId) params.append("org_id", orgId);
    if (teamId) params.append("team_id", teamId);
    const queryString = params.toString();
    return apiClient.delete<ClearMemoriesResponse>(
      `/v1/memory/users/me/memories${queryString ? `?${queryString}` : ""}`,
      { headers: getAuthHeader() },
    );
  },
};
