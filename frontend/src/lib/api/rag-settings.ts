/**
 * RAG Settings API module.
 *
 * Handles RAG (Retrieval Augmented Generation) configuration at organization, team, and user levels.
 */

import { apiClient, getAuthHeader } from "./client"

export interface RAGSettingsBase {
  rag_enabled: boolean
  chunk_size: number
  chunk_overlap: number
  chunks_per_query: number
  similarity_threshold: number
  use_hybrid_search: boolean
  reranking_enabled: boolean
  query_rewriting_enabled: boolean
}

export interface OrganizationRAGSettings extends RAGSettingsBase {
  id: string
  organization_id: string
  rag_customization_enabled: boolean
  allow_team_customization: boolean
  allow_user_customization: boolean
  max_documents_per_user: number
  max_document_size_mb: number
  max_total_storage_gb: number
  allowed_file_types: string[]
  created_at: string
  updated_at: string
}

export interface TeamRAGSettings extends RAGSettingsBase {
  id: string
  team_id: string
  rag_customization_enabled: boolean
  allow_user_customization: boolean
  created_at: string
  updated_at: string
}

export interface UserRAGSettings {
  id: string
  user_id: string
  rag_enabled: boolean
  chunks_per_query: number
  similarity_threshold: number
  created_at: string
  updated_at: string
}

export interface OrganizationRAGSettingsUpdate {
  rag_enabled?: boolean
  rag_customization_enabled?: boolean
  allow_team_customization?: boolean
  allow_user_customization?: boolean
  chunk_size?: number
  chunk_overlap?: number
  chunks_per_query?: number
  similarity_threshold?: number
  use_hybrid_search?: boolean
  reranking_enabled?: boolean
  query_rewriting_enabled?: boolean
  max_documents_per_user?: number
  max_document_size_mb?: number
  max_total_storage_gb?: number
  allowed_file_types?: string[]
}

export interface TeamRAGSettingsUpdate {
  rag_enabled?: boolean
  rag_customization_enabled?: boolean
  allow_user_customization?: boolean
  chunk_size?: number
  chunk_overlap?: number
  chunks_per_query?: number
  similarity_threshold?: number
  use_hybrid_search?: boolean
  reranking_enabled?: boolean
  query_rewriting_enabled?: boolean
}

export interface UserRAGSettingsUpdate {
  rag_enabled?: boolean
  chunks_per_query?: number
  similarity_threshold?: number
}

export type DisabledByLevel = "org" | "team" | null

export interface EffectiveRAGSettings {
  rag_enabled: boolean
  rag_disabled_by: DisabledByLevel
  chunk_size: number
  chunk_overlap: number
  chunks_per_query: number
  similarity_threshold: number
  use_hybrid_search: boolean
  reranking_enabled: boolean
  query_rewriting_enabled: boolean
  customization_allowed: boolean
  customization_disabled_by: DisabledByLevel
  max_documents_per_user: number
  max_document_size_mb: number
  allowed_file_types: string[]
}

export const ragSettingsApi = {
  /** Get organization RAG settings */
  getOrgSettings: (orgId: string) =>
    apiClient.get<OrganizationRAGSettings>(
      `/v1/organizations/${orgId}/rag-settings`,
      { headers: getAuthHeader() }
    ),

  /** Update organization RAG settings */
  updateOrgSettings: (orgId: string, settings: OrganizationRAGSettingsUpdate) =>
    apiClient.put<OrganizationRAGSettings>(
      `/v1/organizations/${orgId}/rag-settings`,
      settings,
      { headers: getAuthHeader() }
    ),

  /** Get team RAG settings */
  getTeamSettings: (orgId: string, teamId: string) =>
    apiClient.get<TeamRAGSettings>(
      `/v1/organizations/${orgId}/teams/${teamId}/rag-settings`,
      { headers: getAuthHeader() }
    ),

  /** Update team RAG settings */
  updateTeamSettings: (orgId: string, teamId: string, settings: TeamRAGSettingsUpdate) =>
    apiClient.put<TeamRAGSettings>(
      `/v1/organizations/${orgId}/teams/${teamId}/rag-settings`,
      settings,
      { headers: getAuthHeader() }
    ),

  /** Get user RAG settings */
  getUserSettings: () =>
    apiClient.get<UserRAGSettings>("/v1/users/me/rag-settings", {
      headers: getAuthHeader(),
    }),

  /** Update user RAG settings */
  updateUserSettings: (settings: UserRAGSettingsUpdate) =>
    apiClient.put<UserRAGSettings>("/v1/users/me/rag-settings", settings, {
      headers: getAuthHeader(),
    }),

  /** Get effective RAG settings (computed from hierarchy) */
  getEffectiveSettings: (organizationId?: string, teamId?: string) => {
    const params = new URLSearchParams()
    if (organizationId) params.append("organization_id", organizationId)
    if (teamId) params.append("team_id", teamId)
    const queryString = params.toString()
    return apiClient.get<EffectiveRAGSettings>(
      `/v1/rag-settings/effective${queryString ? `?${queryString}` : ""}`,
      { headers: getAuthHeader() }
    )
  },
}
