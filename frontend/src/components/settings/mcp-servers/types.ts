/**
 * Shared types for MCP servers components.
 */

/** Scope for MCP server operations - determines which level the server belongs to */
export type Scope =
  | { type: "org"; orgId: string }
  | { type: "team"; orgId: string; teamId: string }
  | { type: "user"; orgId: string; teamId: string };
