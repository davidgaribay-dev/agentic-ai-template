/**
 * Organizations API module.
 *
 * Handles organization CRUD, member management, and ownership operations.
 */

import { apiClient, getAuthHeader, API_BASE, ApiError } from "./client";
import type { Message, OrgRole } from "./types";

export interface Organization {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logo_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrganizationsPublic {
  data: Organization[];
  count: number;
}

export interface OrganizationCreate {
  name: string;
  description?: string | null;
}

export interface OrganizationUpdate {
  name?: string | null;
  description?: string | null;
}

export interface OrganizationMember {
  id: string;
  user_id: string;
  organization_id: string;
  role: OrgRole;
  created_at: string;
  updated_at: string;
  user_email: string;
  user_full_name: string | null;
  user_profile_image_url: string | null;
}

export interface OrganizationMembersPublic {
  data: OrganizationMember[];
  count: number;
}

export const organizationsApi = {
  /** Get user's organizations */
  getOrganizations: (skip = 0, limit = 100) =>
    apiClient.get<OrganizationsPublic>(
      `/v1/organizations/?skip=${skip}&limit=${limit}`,
      {
        headers: getAuthHeader(),
      },
    ),

  /** Get organization by ID */
  getOrganization: (orgId: string) =>
    apiClient.get<Organization>(`/v1/organizations/${orgId}`, {
      headers: getAuthHeader(),
    }),

  /** Create a new organization */
  createOrganization: (org: OrganizationCreate) =>
    apiClient.post<Organization>("/v1/organizations/", org, {
      headers: getAuthHeader(),
    }),

  /** Update an organization */
  updateOrganization: (orgId: string, org: OrganizationUpdate) =>
    apiClient.patch<Organization>(`/v1/organizations/${orgId}`, org, {
      headers: getAuthHeader(),
    }),

  /** Delete an organization */
  deleteOrganization: (orgId: string) =>
    apiClient.delete<Message>(`/v1/organizations/${orgId}`, {
      headers: getAuthHeader(),
    }),

  /** Get organization members */
  getMembers: (orgId: string, skip = 0, limit = 100) =>
    apiClient.get<OrganizationMembersPublic>(
      `/v1/organizations/${orgId}/members?skip=${skip}&limit=${limit}`,
      { headers: getAuthHeader() },
    ),

  /** Update member role */
  updateMemberRole: (orgId: string, memberId: string, role: OrgRole) =>
    apiClient.patch<OrganizationMember>(
      `/v1/organizations/${orgId}/members/${memberId}`,
      { role },
      { headers: getAuthHeader() },
    ),

  /** Remove member from organization */
  removeMember: (orgId: string, memberId: string) =>
    apiClient.delete<Message>(
      `/v1/organizations/${orgId}/members/${memberId}`,
      {
        headers: getAuthHeader(),
      },
    ),

  /** Transfer ownership */
  transferOwnership: (orgId: string, newOwnerId: string) =>
    apiClient.post<Message>(
      `/v1/organizations/${orgId}/transfer-ownership`,
      { new_owner_id: newOwnerId },
      { headers: getAuthHeader() },
    ),

  /** Leave organization */
  leaveOrganization: (orgId: string) =>
    apiClient.post<Message>(
      `/v1/organizations/${orgId}/leave`,
      {},
      {
        headers: getAuthHeader(),
      },
    ),

  /** Get current user's membership in an organization */
  getMyMembership: (orgId: string) =>
    apiClient.get<{
      id: string;
      organization_id: string;
      user_id: string;
      role: OrgRole;
      created_at: string;
      updated_at: string;
    }>(`/v1/organizations/${orgId}/my-membership`, {
      headers: getAuthHeader(),
    }),

  /** Upload organization logo */
  uploadLogo: async (orgId: string, file: File): Promise<Organization> => {
    const formData = new FormData();
    formData.append("file", file);

    const token = localStorage.getItem("auth_token");
    const headers: Record<string, string> = {};
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE}/v1/organizations/${orgId}/logo`, {
      method: "POST",
      headers,
      body: formData,
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => undefined);
      throw new ApiError(response.status, response.statusText, errorBody);
    }

    return response.json();
  },

  /** Delete organization logo */
  deleteLogo: (orgId: string) =>
    apiClient.delete<Organization>(`/v1/organizations/${orgId}/logo`, {
      headers: getAuthHeader(),
    }),
};
