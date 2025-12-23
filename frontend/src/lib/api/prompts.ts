/**
 * Prompts API module.
 *
 * Handles system and template prompts at organization, team, and user levels.
 */

import { apiClient, getAuthHeader } from "./client";

export type PromptType = "template" | "system";

export interface Prompt {
  id: string;
  name: string;
  description: string | null;
  content: string;
  prompt_type: PromptType;
  organization_id: string | null;
  team_id: string | null;
  user_id: string | null;
  is_active: boolean;
  created_by_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface PromptsPublic {
  data: Prompt[];
  count: number;
}

export interface PromptCreate {
  name: string;
  description?: string | null;
  content: string;
  prompt_type?: PromptType;
}

export interface PromptUpdate {
  name?: string | null;
  description?: string | null;
  content?: string | null;
}

export interface PromptsAvailable {
  org_prompts: Prompt[];
  team_prompts: Prompt[];
  user_prompts: Prompt[];
}

export interface ActiveSystemPrompt {
  content: string;
  org_prompt: Prompt | null;
  team_prompt: Prompt | null;
  user_prompt: Prompt | null;
}

export const promptsApi = {
  /** List organization-level prompts */
  listOrgPrompts: (
    orgId: string,
    promptType?: PromptType,
    skip = 0,
    limit = 100,
  ) => {
    const params = new URLSearchParams({
      skip: String(skip),
      limit: String(limit),
    });
    if (promptType) params.append("prompt_type", promptType);
    return apiClient.get<PromptsPublic>(
      `/v1/organizations/${orgId}/prompts?${params}`,
      { headers: getAuthHeader() },
    );
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
    apiClient.patch<Prompt>(
      `/v1/organizations/${orgId}/prompts/${promptId}`,
      prompt,
      {
        headers: getAuthHeader(),
      },
    ),

  /** Delete an organization-level prompt */
  deleteOrgPrompt: (orgId: string, promptId: string) =>
    apiClient.delete<void>(`/v1/organizations/${orgId}/prompts/${promptId}`, {
      headers: getAuthHeader(),
    }),

  /** Activate an organization-level system prompt */
  activateOrgPrompt: (orgId: string, promptId: string) =>
    apiClient.post<Prompt>(
      `/v1/organizations/${orgId}/prompts/${promptId}/activate`,
      {},
      {
        headers: getAuthHeader(),
      },
    ),

  /** List team-level prompts */
  listTeamPrompts: (
    orgId: string,
    teamId: string,
    promptType?: PromptType,
    skip = 0,
    limit = 100,
  ) => {
    const params = new URLSearchParams({
      skip: String(skip),
      limit: String(limit),
    });
    if (promptType) params.append("prompt_type", promptType);
    return apiClient.get<PromptsPublic>(
      `/v1/organizations/${orgId}/teams/${teamId}/prompts?${params}`,
      { headers: getAuthHeader() },
    );
  },

  /** Get a team-level prompt by ID */
  getTeamPrompt: (orgId: string, teamId: string, promptId: string) =>
    apiClient.get<Prompt>(
      `/v1/organizations/${orgId}/teams/${teamId}/prompts/${promptId}`,
      { headers: getAuthHeader() },
    ),

  /** Create a team-level prompt */
  createTeamPrompt: (orgId: string, teamId: string, prompt: PromptCreate) =>
    apiClient.post<Prompt>(
      `/v1/organizations/${orgId}/teams/${teamId}/prompts`,
      prompt,
      { headers: getAuthHeader() },
    ),

  /** Update a team-level prompt */
  updateTeamPrompt: (
    orgId: string,
    teamId: string,
    promptId: string,
    prompt: PromptUpdate,
  ) =>
    apiClient.patch<Prompt>(
      `/v1/organizations/${orgId}/teams/${teamId}/prompts/${promptId}`,
      prompt,
      { headers: getAuthHeader() },
    ),

  /** Delete a team-level prompt */
  deleteTeamPrompt: (orgId: string, teamId: string, promptId: string) =>
    apiClient.delete<void>(
      `/v1/organizations/${orgId}/teams/${teamId}/prompts/${promptId}`,
      { headers: getAuthHeader() },
    ),

  /** Activate a team-level system prompt */
  activateTeamPrompt: (orgId: string, teamId: string, promptId: string) =>
    apiClient.post<Prompt>(
      `/v1/organizations/${orgId}/teams/${teamId}/prompts/${promptId}/activate`,
      {},
      { headers: getAuthHeader() },
    ),

  /** Get all prompts available in the current context */
  getAvailablePrompts: (
    orgId: string,
    teamId: string,
    promptType?: PromptType,
  ) => {
    const params = promptType ? `?prompt_type=${promptType}` : "";
    return apiClient.get<PromptsAvailable>(
      `/v1/organizations/${orgId}/teams/${teamId}/prompts/available${params}`,
      { headers: getAuthHeader() },
    );
  },

  /** Get the effective system prompt (concatenated from all levels) */
  getActiveSystemPrompt: (orgId: string, teamId: string) =>
    apiClient.get<ActiveSystemPrompt>(
      `/v1/organizations/${orgId}/teams/${teamId}/prompts/active-system`,
      { headers: getAuthHeader() },
    ),

  /** List user's personal prompts */
  listUserPrompts: (promptType?: PromptType, skip = 0, limit = 100) => {
    const params = new URLSearchParams({
      skip: String(skip),
      limit: String(limit),
    });
    if (promptType) params.append("prompt_type", promptType);
    return apiClient.get<PromptsPublic>(`/v1/users/me/prompts?${params}`, {
      headers: getAuthHeader(),
    });
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
    apiClient.post<Prompt>(
      `/v1/users/me/prompts/${promptId}/activate`,
      {},
      {
        headers: getAuthHeader(),
      },
    ),
};
