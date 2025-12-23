/**
 * Chat Settings API module.
 *
 * Handles chat visibility and feature settings at organization, team, and user levels.
 */

import { apiClient, getAuthHeader } from "./client";

export interface ChatSettings {
  chat_enabled: boolean;
  chat_panel_enabled: boolean;
  memory_enabled: boolean;
  mcp_enabled: boolean;
  disabled_mcp_servers: string[];
  disabled_tools: string[];
}

export interface OrganizationChatSettings extends ChatSettings {
  id: string;
  organization_id: string;
  mcp_allow_custom_servers: boolean;
  mcp_max_servers_per_team: number;
  mcp_max_servers_per_user: number;
  created_at: string;
  updated_at: string;
}

export interface TeamChatSettings extends ChatSettings {
  id: string;
  team_id: string;
  mcp_allow_custom_servers: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserChatSettings extends ChatSettings {
  id: string;
  user_id: string;
  created_at: string;
  updated_at: string;
}

export interface ChatSettingsUpdate {
  chat_enabled?: boolean;
  chat_panel_enabled?: boolean;
  memory_enabled?: boolean;
  mcp_enabled?: boolean;
  disabled_mcp_servers?: string[];
  disabled_tools?: string[];
}

export interface OrgSettingsUpdate extends ChatSettingsUpdate {
  mcp_allow_custom_servers?: boolean;
  mcp_max_servers_per_team?: number;
  mcp_max_servers_per_user?: number;
}

export interface TeamSettingsUpdate extends ChatSettingsUpdate {
  mcp_allow_custom_servers?: boolean;
}

export type DisabledByLevel = "org" | "team" | null;

export interface EffectiveChatSettings {
  chat_enabled: boolean;
  chat_disabled_by: DisabledByLevel;
  chat_panel_enabled: boolean;
  chat_panel_disabled_by: DisabledByLevel;
  memory_enabled: boolean;
  memory_disabled_by: DisabledByLevel;
  mcp_enabled: boolean;
  mcp_disabled_by: DisabledByLevel;
  mcp_allow_custom_servers: boolean;
  mcp_custom_servers_disabled_by: DisabledByLevel;
  disabled_mcp_servers: string[];
  disabled_tools: string[];
}

export const chatSettingsApi = {
  /** Get organization chat visibility settings */
  getOrgSettings: (orgId: string) =>
    apiClient.get<OrganizationChatSettings>(
      `/v1/organizations/${orgId}/chat-settings`,
      { headers: getAuthHeader() },
    ),

  /** Update organization chat visibility settings */
  updateOrgSettings: (orgId: string, settings: OrgSettingsUpdate) =>
    apiClient.put<OrganizationChatSettings>(
      `/v1/organizations/${orgId}/chat-settings`,
      settings,
      { headers: getAuthHeader() },
    ),

  /** Get team chat visibility settings */
  getTeamSettings: (orgId: string, teamId: string) =>
    apiClient.get<TeamChatSettings>(
      `/v1/organizations/${orgId}/teams/${teamId}/chat-settings`,
      { headers: getAuthHeader() },
    ),

  /** Update team chat visibility settings */
  updateTeamSettings: (
    orgId: string,
    teamId: string,
    settings: TeamSettingsUpdate,
  ) =>
    apiClient.put<TeamChatSettings>(
      `/v1/organizations/${orgId}/teams/${teamId}/chat-settings`,
      settings,
      { headers: getAuthHeader() },
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
    const params = new URLSearchParams();
    if (organizationId) params.append("organization_id", organizationId);
    if (teamId) params.append("team_id", teamId);
    const queryString = params.toString();
    return apiClient.get<EffectiveChatSettings>(
      `/v1/settings/effective${queryString ? `?${queryString}` : ""}`,
      { headers: getAuthHeader() },
    );
  },
};
