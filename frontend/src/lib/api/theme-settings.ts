/**
 * Theme Settings API module.
 *
 * Handles theme configuration at organization, team, and user levels with hierarchical inheritance.
 */

import { apiClient, getAuthHeader } from "./client";

export interface ThemeColors {
  background: string;
  foreground: string;
  chat_input_bg: string;
  card: string;
  card_foreground: string;
  popover: string;
  popover_foreground: string;
  primary: string;
  primary_foreground: string;
  secondary: string;
  secondary_foreground: string;
  muted: string;
  muted_foreground: string;
  accent: string;
  accent_foreground: string;
  destructive: string;
  destructive_foreground: string;
  border: string;
  input: string;
  ring: string;
  chart_1: string;
  chart_2: string;
  chart_3: string;
  chart_4: string;
  chart_5: string;
  sidebar: string;
  sidebar_foreground: string;
  sidebar_primary: string;
  sidebar_primary_foreground: string;
  sidebar_accent: string;
  sidebar_accent_foreground: string;
  sidebar_border: string;
  sidebar_ring: string;
}

export type ThemeMode = "light" | "dark" | "system";

export interface ThemeSettingsBase {
  default_theme_mode: ThemeMode;
  default_light_theme: string;
  default_dark_theme: string;
  custom_light_theme: ThemeColors | null;
  custom_dark_theme: ThemeColors | null;
}

export interface OrganizationThemeSettings extends ThemeSettingsBase {
  id: string;
  organization_id: string;
  theme_customization_enabled: boolean;
  allow_team_customization: boolean;
  allow_user_customization: boolean;
  created_at: string;
  updated_at: string;
}

export interface TeamThemeSettings extends ThemeSettingsBase {
  id: string;
  team_id: string;
  theme_customization_enabled: boolean;
  allow_user_customization: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserThemeSettings {
  id: string;
  user_id: string;
  theme_mode: ThemeMode;
  light_theme: string;
  dark_theme: string;
  custom_light_theme: ThemeColors | null;
  custom_dark_theme: ThemeColors | null;
  created_at: string;
  updated_at: string;
}

export interface OrganizationThemeSettingsUpdate {
  theme_customization_enabled?: boolean;
  allow_team_customization?: boolean;
  allow_user_customization?: boolean;
  default_theme_mode?: ThemeMode;
  default_light_theme?: string;
  default_dark_theme?: string;
  custom_light_theme?: ThemeColors | null;
  custom_dark_theme?: ThemeColors | null;
}

export interface TeamThemeSettingsUpdate {
  theme_customization_enabled?: boolean;
  allow_user_customization?: boolean;
  default_theme_mode?: ThemeMode;
  default_light_theme?: string;
  default_dark_theme?: string;
  custom_light_theme?: ThemeColors | null;
  custom_dark_theme?: ThemeColors | null;
}

export interface UserThemeSettingsUpdate {
  theme_mode?: ThemeMode;
  light_theme?: string;
  dark_theme?: string;
  custom_light_theme?: ThemeColors | null;
  custom_dark_theme?: ThemeColors | null;
}

export type DisabledByLevel = "org" | "team" | null;

export interface EffectiveThemeSettings {
  theme_mode: ThemeMode;
  light_theme: string;
  dark_theme: string;
  custom_light_theme: ThemeColors | null;
  custom_dark_theme: ThemeColors | null;
  customization_allowed: boolean;
  customization_disabled_by: DisabledByLevel;
  active_theme_colors: ThemeColors;
}

export const themeSettingsApi = {
  /** Get organization theme settings */
  getOrgSettings: (orgId: string) =>
    apiClient.get<OrganizationThemeSettings>(
      `/v1/organizations/${orgId}/theme-settings`,
      { headers: getAuthHeader() },
    ),

  /** Update organization theme settings */
  updateOrgSettings: (
    orgId: string,
    settings: OrganizationThemeSettingsUpdate,
  ) =>
    apiClient.put<OrganizationThemeSettings>(
      `/v1/organizations/${orgId}/theme-settings`,
      settings,
      { headers: getAuthHeader() },
    ),

  /** Get team theme settings */
  getTeamSettings: (orgId: string, teamId: string) =>
    apiClient.get<TeamThemeSettings>(
      `/v1/organizations/${orgId}/teams/${teamId}/theme-settings`,
      { headers: getAuthHeader() },
    ),

  /** Update team theme settings */
  updateTeamSettings: (
    orgId: string,
    teamId: string,
    settings: TeamThemeSettingsUpdate,
  ) =>
    apiClient.put<TeamThemeSettings>(
      `/v1/organizations/${orgId}/teams/${teamId}/theme-settings`,
      settings,
      { headers: getAuthHeader() },
    ),

  /** Get user theme settings */
  getUserSettings: () =>
    apiClient.get<UserThemeSettings>("/v1/users/me/theme-settings", {
      headers: getAuthHeader(),
    }),

  /** Update user theme settings */
  updateUserSettings: (settings: UserThemeSettingsUpdate) =>
    apiClient.put<UserThemeSettings>("/v1/users/me/theme-settings", settings, {
      headers: getAuthHeader(),
    }),

  /** Get effective theme settings (computed from hierarchy) */
  getEffectiveSettings: (
    organizationId?: string,
    teamId?: string,
    systemPrefersDark?: boolean,
  ) => {
    const params = new URLSearchParams();
    if (organizationId) params.append("organization_id", organizationId);
    if (teamId) params.append("team_id", teamId);
    if (systemPrefersDark !== undefined)
      params.append("system_prefers_dark", String(systemPrefersDark));
    const queryString = params.toString();
    return apiClient.get<EffectiveThemeSettings>(
      `/v1/theme-settings/effective${queryString ? `?${queryString}` : ""}`,
      { headers: getAuthHeader() },
    );
  },

  /** Get all predefined theme color palettes */
  getPredefinedThemes: () =>
    apiClient.get<Record<string, ThemeColors>>(
      "/v1/theme-settings/predefined-themes",
      {
        headers: getAuthHeader(),
      },
    ),
};
