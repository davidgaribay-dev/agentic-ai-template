/**
 * Teams API module.
 *
 * Handles team CRUD, member management within organizations.
 */

import { apiClient, getAuthHeader, API_BASE, ApiError } from "./client"
import type { Message, OrgRole, TeamRole } from "./types"

export interface Team {
  id: string
  name: string
  slug: string
  description: string | null
  logo_url: string | null
  organization_id: string
  created_by_id: string | null
  created_at: string
  updated_at: string
}

export interface TeamsPublic {
  data: Team[]
  count: number
}

export interface TeamCreate {
  name: string
  description?: string | null
}

export interface TeamUpdate {
  name?: string | null
  description?: string | null
}

export interface TeamMember {
  id: string
  team_id: string
  org_member_id: string
  role: TeamRole
  created_at: string
  updated_at: string
  user_id: string
  user_email: string
  user_full_name: string | null
  user_profile_image_url: string | null
  org_role: OrgRole
}

export interface TeamMembersPublic {
  data: TeamMember[]
  count: number
}

export const teamsApi = {
  /** Get all teams in an organization (requires teams:read permission) */
  getTeams: (orgId: string, skip = 0, limit = 100) =>
    apiClient.get<TeamsPublic>(
      `/v1/organizations/${orgId}/teams?skip=${skip}&limit=${limit}`,
      { headers: getAuthHeader() }
    ),

  /** Get teams the current user is a member of in an organization */
  getMyTeams: (orgId: string, skip = 0, limit = 100) =>
    apiClient.get<TeamsPublic>(
      `/v1/organizations/${orgId}/teams/my-teams?skip=${skip}&limit=${limit}`,
      { headers: getAuthHeader() }
    ),

  /** Get team by ID */
  getTeam: (orgId: string, teamId: string) =>
    apiClient.get<Team>(`/v1/organizations/${orgId}/teams/${teamId}`, {
      headers: getAuthHeader(),
    }),

  /** Create a new team */
  createTeam: (orgId: string, team: TeamCreate) =>
    apiClient.post<Team>(`/v1/organizations/${orgId}/teams`, team, {
      headers: getAuthHeader(),
    }),

  /** Update a team */
  updateTeam: (orgId: string, teamId: string, team: TeamUpdate) =>
    apiClient.patch<Team>(`/v1/organizations/${orgId}/teams/${teamId}`, team, {
      headers: getAuthHeader(),
    }),

  /** Delete a team */
  deleteTeam: (orgId: string, teamId: string) =>
    apiClient.delete<Message>(`/v1/organizations/${orgId}/teams/${teamId}`, {
      headers: getAuthHeader(),
    }),

  /** Get team members */
  getMembers: (orgId: string, teamId: string, skip = 0, limit = 100) =>
    apiClient.get<TeamMembersPublic>(
      `/v1/organizations/${orgId}/teams/${teamId}/members?skip=${skip}&limit=${limit}`,
      { headers: getAuthHeader() }
    ),

  /** Add member to team (user must be org member) */
  addMember: (orgId: string, teamId: string, userId: string, role: TeamRole = "member") =>
    apiClient.post<TeamMember>(
      `/v1/organizations/${orgId}/teams/${teamId}/members?user_id=${userId}&role=${role}`,
      {},
      { headers: getAuthHeader() }
    ),

  /** Update team member role */
  updateMemberRole: (orgId: string, teamId: string, memberId: string, role: TeamRole) =>
    apiClient.patch<TeamMember>(
      `/v1/organizations/${orgId}/teams/${teamId}/members/${memberId}`,
      { role },
      { headers: getAuthHeader() }
    ),

  /** Remove member from team */
  removeMember: (orgId: string, teamId: string, memberId: string) =>
    apiClient.delete<Message>(
      `/v1/organizations/${orgId}/teams/${teamId}/members/${memberId}`,
      { headers: getAuthHeader() }
    ),

  /** Leave team */
  leaveTeam: (orgId: string, teamId: string) =>
    apiClient.post<Message>(`/v1/organizations/${orgId}/teams/${teamId}/leave`, {}, {
      headers: getAuthHeader(),
    }),

  /** Upload team logo */
  uploadLogo: async (orgId: string, teamId: string, file: File): Promise<Team> => {
    const formData = new FormData()
    formData.append("file", file)

    const token = localStorage.getItem("auth_token")
    const headers: Record<string, string> = {}
    if (token) {
      headers["Authorization"] = `Bearer ${token}`
    }

    const response = await fetch(`${API_BASE}/v1/organizations/${orgId}/teams/${teamId}/logo`, {
      method: "POST",
      headers,
      body: formData,
    })

    if (!response.ok) {
      const errorBody = await response.json().catch(() => undefined)
      throw new ApiError(response.status, response.statusText, errorBody)
    }

    return response.json()
  },

  /** Delete team logo */
  deleteLogo: (orgId: string, teamId: string) =>
    apiClient.delete<Team>(`/v1/organizations/${orgId}/teams/${teamId}/logo`, {
      headers: getAuthHeader(),
    }),
}
