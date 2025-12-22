/**
 * MCP Servers API module.
 *
 * Handles Model Context Protocol server management at organization, team, and user levels.
 */

import { apiClient, getAuthHeader } from "./client"

export type MCPTransport = "http" | "sse" | "streamable_http"
export type MCPAuthType = "none" | "bearer" | "api_key"

export interface MCPServer {
  id: string
  organization_id: string
  team_id: string | null
  user_id: string | null
  name: string
  description: string | null
  url: string
  transport: MCPTransport
  auth_type: MCPAuthType
  auth_header_name: string | null
  has_auth_secret: boolean
  enabled: boolean
  is_builtin: boolean
  tool_prefix: boolean
  scope: "org" | "team" | "user"
  created_by_id: string
  created_at: string
  updated_at: string
}

export interface MCPServersPublic {
  data: MCPServer[]
  count: number
}

export interface MCPServerCreate {
  name: string
  description?: string | null
  url: string
  transport?: MCPTransport
  auth_type?: MCPAuthType
  auth_header_name?: string | null
  auth_secret?: string | null
  enabled?: boolean
  tool_prefix?: boolean
}

export interface MCPServerUpdate {
  name?: string | null
  description?: string | null
  url?: string | null
  transport?: MCPTransport | null
  auth_type?: MCPAuthType | null
  auth_header_name?: string | null
  auth_secret?: string | null
  enabled?: boolean | null
  tool_prefix?: boolean | null
}

export interface MCPTool {
  name: string
  description: string
}

export interface MCPTestResult {
  success: boolean
  message: string
  tools: MCPTool[]
  tool_count: number
  connection_time_ms: number | null
  error_details: string | null
}

export interface MCPServerWithTools {
  server_id: string
  server_name: string
  server_description: string | null
  scope: "org" | "team" | "user"
  enabled: boolean
  tools: MCPTool[]
  tool_count: number
  error: string | null
}

export interface MCPToolsList {
  servers: MCPServerWithTools[]
  total_tools: number
  total_servers: number
  error_count: number
}

export interface ToolConfigUpdate {
  disabled_mcp_servers?: string[]
  disabled_tools?: string[]
}

export const mcpServersApi = {
  /** List organization-level MCP servers */
  listOrgServers: (orgId: string) =>
    apiClient.get<MCPServersPublic>(
      `/v1/organizations/${orgId}/mcp-servers`,
      { headers: getAuthHeader() }
    ),

  /** Get an organization-level MCP server */
  getOrgServer: (orgId: string, serverId: string) =>
    apiClient.get<MCPServer>(
      `/v1/organizations/${orgId}/mcp-servers/${serverId}`,
      { headers: getAuthHeader() }
    ),

  /** Create an organization-level MCP server */
  createOrgServer: (orgId: string, data: MCPServerCreate) =>
    apiClient.post<MCPServer>(
      `/v1/organizations/${orgId}/mcp-servers`,
      data,
      { headers: getAuthHeader() }
    ),

  /** Update an organization-level MCP server */
  updateOrgServer: (orgId: string, serverId: string, data: MCPServerUpdate) =>
    apiClient.patch<MCPServer>(
      `/v1/organizations/${orgId}/mcp-servers/${serverId}`,
      data,
      { headers: getAuthHeader() }
    ),

  /** Delete an organization-level MCP server */
  deleteOrgServer: (orgId: string, serverId: string) =>
    apiClient.delete<void>(
      `/v1/organizations/${orgId}/mcp-servers/${serverId}`,
      { headers: getAuthHeader() }
    ),

  /** List team-level MCP servers */
  listTeamServers: (orgId: string, teamId: string) =>
    apiClient.get<MCPServersPublic>(
      `/v1/organizations/${orgId}/teams/${teamId}/mcp-servers`,
      { headers: getAuthHeader() }
    ),

  /** Get a team-level MCP server */
  getTeamServer: (orgId: string, teamId: string, serverId: string) =>
    apiClient.get<MCPServer>(
      `/v1/organizations/${orgId}/teams/${teamId}/mcp-servers/${serverId}`,
      { headers: getAuthHeader() }
    ),

  /** Create a team-level MCP server */
  createTeamServer: (orgId: string, teamId: string, data: MCPServerCreate) =>
    apiClient.post<MCPServer>(
      `/v1/organizations/${orgId}/teams/${teamId}/mcp-servers`,
      data,
      { headers: getAuthHeader() }
    ),

  /** Update a team-level MCP server */
  updateTeamServer: (orgId: string, teamId: string, serverId: string, data: MCPServerUpdate) =>
    apiClient.patch<MCPServer>(
      `/v1/organizations/${orgId}/teams/${teamId}/mcp-servers/${serverId}`,
      data,
      { headers: getAuthHeader() }
    ),

  /** Delete a team-level MCP server */
  deleteTeamServer: (orgId: string, teamId: string, serverId: string) =>
    apiClient.delete<void>(
      `/v1/organizations/${orgId}/teams/${teamId}/mcp-servers/${serverId}`,
      { headers: getAuthHeader() }
    ),

  /** List user's personal MCP servers */
  listUserServers: (orgId: string, teamId: string) =>
    apiClient.get<MCPServersPublic>(
      `/v1/mcp-servers/me?organization_id=${orgId}&team_id=${teamId}`,
      { headers: getAuthHeader() }
    ),

  /** Get a user's personal MCP server */
  getUserServer: (serverId: string) =>
    apiClient.get<MCPServer>(
      `/v1/mcp-servers/me/${serverId}`,
      { headers: getAuthHeader() }
    ),

  /** Create a user's personal MCP server */
  createUserServer: (orgId: string, teamId: string, data: MCPServerCreate) =>
    apiClient.post<MCPServer>(
      `/v1/mcp-servers/me?organization_id=${orgId}&team_id=${teamId}`,
      data,
      { headers: getAuthHeader() }
    ),

  /** Update a user's personal MCP server */
  updateUserServer: (serverId: string, data: MCPServerUpdate) =>
    apiClient.patch<MCPServer>(
      `/v1/mcp-servers/me/${serverId}`,
      data,
      { headers: getAuthHeader() }
    ),

  /** Delete a user's personal MCP server */
  deleteUserServer: (serverId: string) =>
    apiClient.delete<void>(
      `/v1/mcp-servers/me/${serverId}`,
      { headers: getAuthHeader() }
    ),

  /** Get all effective MCP servers for the current user */
  listEffectiveServers: (orgId: string, teamId?: string) => {
    const params = new URLSearchParams({ organization_id: orgId })
    if (teamId) params.append("team_id", teamId)
    return apiClient.get<MCPServersPublic>(
      `/v1/mcp-servers/effective?${params}`,
      { headers: getAuthHeader() }
    )
  },

  /** Get all tools from effective MCP servers */
  listEffectiveTools: (orgId: string, teamId?: string) => {
    const params = new URLSearchParams({ organization_id: orgId })
    if (teamId) params.append("team_id", teamId)
    return apiClient.get<MCPToolsList>(
      `/v1/mcp-servers/effective/tools?${params}`,
      { headers: getAuthHeader() }
    )
  },

  /** Test connection to an organization-level MCP server */
  testOrgServer: (orgId: string, serverId: string) =>
    apiClient.post<MCPTestResult>(
      `/v1/organizations/${orgId}/mcp-servers/${serverId}/test`,
      {},
      { headers: getAuthHeader() }
    ),

  /** Test connection to a team-level MCP server */
  testTeamServer: (orgId: string, teamId: string, serverId: string) =>
    apiClient.post<MCPTestResult>(
      `/v1/organizations/${orgId}/teams/${teamId}/mcp-servers/${serverId}/test`,
      {},
      { headers: getAuthHeader() }
    ),

  /** Test connection to a user's personal MCP server */
  testUserServer: (serverId: string) =>
    apiClient.post<MCPTestResult>(
      `/v1/mcp-servers/me/${serverId}/test`,
      {},
      { headers: getAuthHeader() }
    ),
}
