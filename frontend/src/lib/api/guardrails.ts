/**
 * Guardrails API client for AI content filtering.
 *
 * Provides methods for managing guardrails at org, team, and user levels.
 */

import { apiClient, getAuthHeader } from "./client";

/** Action to take when a guardrail matches */
export type GuardrailAction = "block" | "warn" | "redact";

/** Available PII types for detection */
export const PII_TYPES = [
  "email",
  "phone",
  "ssn",
  "credit_card",
  "ip_address",
] as const;

export type PIIType = (typeof PII_TYPES)[number];

/** PII type display labels */
export const PII_TYPE_LABELS: Record<PIIType, string> = {
  email: "Email Addresses",
  phone: "Phone Numbers",
  ssn: "Social Security Numbers",
  credit_card: "Credit Card Numbers",
  ip_address: "IP Addresses",
};

/** Base guardrail settings shared across all levels */
export interface GuardrailSettingsBase {
  guardrails_enabled: boolean;
  input_blocked_keywords: string[];
  input_blocked_patterns: string[];
  input_action: GuardrailAction;
  output_blocked_keywords: string[];
  output_blocked_patterns: string[];
  output_action: GuardrailAction;
  pii_detection_enabled: boolean;
  pii_types: PIIType[];
  pii_action: GuardrailAction;
}

/** Organization guardrails with additional controls */
export interface OrganizationGuardrails extends GuardrailSettingsBase {
  id: string;
  organization_id: string;
  allow_team_override: boolean;
  allow_user_override: boolean;
  created_at: string;
  updated_at: string;
}

/** Team guardrails */
export interface TeamGuardrails extends GuardrailSettingsBase {
  id: string;
  team_id: string;
  created_at: string;
  updated_at: string;
}

/** User guardrails */
export interface UserGuardrails extends GuardrailSettingsBase {
  id: string;
  user_id: string;
  created_at: string;
  updated_at: string;
}

/** Update schema for organization guardrails */
export interface OrganizationGuardrailsUpdate {
  guardrails_enabled?: boolean;
  input_blocked_keywords?: string[];
  input_blocked_patterns?: string[];
  input_action?: GuardrailAction;
  output_blocked_keywords?: string[];
  output_blocked_patterns?: string[];
  output_action?: GuardrailAction;
  pii_detection_enabled?: boolean;
  pii_types?: PIIType[];
  pii_action?: GuardrailAction;
  allow_team_override?: boolean;
  allow_user_override?: boolean;
}

/** Update schema for team guardrails */
export interface TeamGuardrailsUpdate {
  guardrails_enabled?: boolean;
  input_blocked_keywords?: string[];
  input_blocked_patterns?: string[];
  input_action?: GuardrailAction;
  output_blocked_keywords?: string[];
  output_blocked_patterns?: string[];
  output_action?: GuardrailAction;
  pii_detection_enabled?: boolean;
  pii_types?: PIIType[];
  pii_action?: GuardrailAction;
}

/** Update schema for user guardrails */
export interface UserGuardrailsUpdate {
  guardrails_enabled?: boolean;
  input_blocked_keywords?: string[];
  input_blocked_patterns?: string[];
  input_action?: GuardrailAction;
  output_blocked_keywords?: string[];
  output_blocked_patterns?: string[];
  output_action?: GuardrailAction;
  pii_detection_enabled?: boolean;
  pii_types?: PIIType[];
  pii_action?: GuardrailAction;
}

/** Effective guardrails after applying hierarchy */
export interface EffectiveGuardrails {
  guardrails_enabled: boolean;
  guardrails_disabled_by: "org" | "team" | null;
  input_blocked_keywords: string[];
  input_blocked_patterns: string[];
  input_action: GuardrailAction;
  output_blocked_keywords: string[];
  output_blocked_patterns: string[];
  output_action: GuardrailAction;
  pii_detection_enabled: boolean;
  pii_types: PIIType[];
  pii_action: GuardrailAction;
  can_user_modify: boolean;
}

/** Match information from guardrail test */
export interface GuardrailMatch {
  pattern: string;
  pattern_type: "keyword" | "regex" | "pii";
  matched_text: string;
  start: number;
  end: number;
}

/** Result of testing content against guardrails */
export interface GuardrailTestResult {
  passed: boolean;
  action: GuardrailAction | null;
  matches: GuardrailMatch[];
  redacted_content: string | null;
}

/** Request for testing guardrails */
export interface GuardrailTestRequest {
  content: string;
  direction: "input" | "output";
}

export const guardrailsApi = {
  /**
   * Get organization guardrails
   */
  async getOrgGuardrails(orgId: string): Promise<OrganizationGuardrails> {
    return apiClient.get<OrganizationGuardrails>(
      `/v1/guardrails/organizations/${orgId}`,
      { headers: getAuthHeader() },
    );
  },

  /**
   * Update organization guardrails
   */
  async updateOrgGuardrails(
    orgId: string,
    data: OrganizationGuardrailsUpdate,
  ): Promise<OrganizationGuardrails> {
    return apiClient.put<OrganizationGuardrails>(
      `/v1/guardrails/organizations/${orgId}`,
      data,
      { headers: getAuthHeader() },
    );
  },

  /**
   * Get team guardrails
   */
  async getTeamGuardrails(
    orgId: string,
    teamId: string,
  ): Promise<TeamGuardrails> {
    return apiClient.get<TeamGuardrails>(
      `/v1/guardrails/organizations/${orgId}/teams/${teamId}`,
      { headers: getAuthHeader() },
    );
  },

  /**
   * Update team guardrails
   */
  async updateTeamGuardrails(
    orgId: string,
    teamId: string,
    data: TeamGuardrailsUpdate,
  ): Promise<TeamGuardrails> {
    return apiClient.put<TeamGuardrails>(
      `/v1/guardrails/organizations/${orgId}/teams/${teamId}`,
      data,
      { headers: getAuthHeader() },
    );
  },

  /**
   * Get user guardrails
   */
  async getUserGuardrails(): Promise<UserGuardrails> {
    return apiClient.get<UserGuardrails>("/v1/guardrails/me", {
      headers: getAuthHeader(),
    });
  },

  /**
   * Update user guardrails
   */
  async updateUserGuardrails(
    data: UserGuardrailsUpdate,
  ): Promise<UserGuardrails> {
    return apiClient.put<UserGuardrails>("/v1/guardrails/me", data, {
      headers: getAuthHeader(),
    });
  },

  /**
   * Get effective guardrails (computed from hierarchy)
   */
  async getEffectiveGuardrails(
    orgId?: string,
    teamId?: string,
  ): Promise<EffectiveGuardrails> {
    const params = new URLSearchParams();
    if (orgId) params.set("org_id", orgId);
    if (teamId) params.set("team_id", teamId);

    return apiClient.get<EffectiveGuardrails>(
      `/v1/guardrails/effective?${params.toString()}`,
      { headers: getAuthHeader() },
    );
  },

  /**
   * Test content against guardrails (dry run)
   */
  async testGuardrails(
    request: GuardrailTestRequest,
    orgId?: string,
    teamId?: string,
  ): Promise<GuardrailTestResult> {
    const params = new URLSearchParams();
    if (orgId) params.set("org_id", orgId);
    if (teamId) params.set("team_id", teamId);

    return apiClient.post<GuardrailTestResult>(
      `/v1/guardrails/test?${params.toString()}`,
      request,
      { headers: getAuthHeader() },
    );
  },

  /**
   * Get available PII types
   */
  async getPIITypes(): Promise<PIIType[]> {
    return apiClient.get<PIIType[]>("/v1/guardrails/pii-types", {
      headers: getAuthHeader(),
    });
  },
};
