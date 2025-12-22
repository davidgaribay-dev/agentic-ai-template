/**
 * Invitations API module.
 *
 * Handles organization and team invitation management.
 */

import { apiClient, getAuthHeader } from "./client"
import type { Message, OrgRole, TeamRole, InvitationStatus } from "./types"
import type { User } from "./auth"
import type { Organization } from "./organizations"
import type { Team } from "./teams"

export interface Invitation {
  id: string
  email: string
  organization_id: string
  team_id: string | null
  org_role: OrgRole
  team_role: TeamRole | null
  status: InvitationStatus
  expires_at: string
  created_at: string
  invited_by: User | null
  organization: Organization
  team: Team | null
}

export interface InvitationsPublic {
  data: Invitation[]
  count: number
}

export interface InvitationCreate {
  email: string
  org_role?: OrgRole
  team_id?: string | null
  team_role?: TeamRole | null
}

export interface InvitationInfo {
  email: string
  organization_name: string
  team_name: string | null
  org_role: OrgRole
  team_role: TeamRole | null
  invited_by_name: string | null
  expires_at: string
}

export interface InvitationCreatedResponse {
  id: string
  email: string
  organization_id: string
  team_id: string | null
  org_role: OrgRole
  team_role: TeamRole | null
  status: InvitationStatus
  expires_at: string
  created_at: string
  accepted_at: string | null
  token: string
}

export const invitationsApi = {
  /** Get organization invitations */
  getInvitations: (orgId: string, skip = 0, limit = 100) =>
    apiClient.get<InvitationsPublic>(
      `/v1/organizations/${orgId}/invitations?skip=${skip}&limit=${limit}`,
      { headers: getAuthHeader() }
    ),

  /** Create an invitation */
  createInvitation: (orgId: string, invitation: InvitationCreate) =>
    apiClient.post<InvitationCreatedResponse>(
      `/v1/organizations/${orgId}/invitations`,
      invitation,
      { headers: getAuthHeader() }
    ),

  /** Revoke an invitation */
  revokeInvitation: (orgId: string, invitationId: string) =>
    apiClient.delete<Message>(
      `/v1/organizations/${orgId}/invitations/${invitationId}`,
      { headers: getAuthHeader() }
    ),

  /** Resend an invitation */
  resendInvitation: (orgId: string, invitationId: string) =>
    apiClient.post<{ invitation: Invitation; token: string }>(
      `/v1/organizations/${orgId}/invitations/${invitationId}/resend`,
      {},
      { headers: getAuthHeader() }
    ),

  /** Get invitation info by token (public - no auth required) */
  getInvitationInfo: (token: string) =>
    apiClient.get<InvitationInfo>(`/v1/invitations/info?token=${encodeURIComponent(token)}`),

  /** Accept invitation (authenticated user) */
  acceptInvitation: (token: string) =>
    apiClient.post<Message>("/v1/invitations/accept", { token }, {
      headers: getAuthHeader(),
    }),
}
