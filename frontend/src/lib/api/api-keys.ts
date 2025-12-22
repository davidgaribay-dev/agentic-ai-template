/**
 * API Keys module.
 *
 * Handles LLM provider API key management at organization and team levels.
 */

import { apiClient, getAuthHeader } from "./client"

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
