/**
 * Shared hooks and utilities for MCP servers components.
 */

import { queryKeys } from "@/lib/queries";
import type { Scope } from "./types";

/** Get the TanStack Query key for a given MCP server scope */
export function getQueryKeyForScope(scope: Scope) {
  if (scope.type === "org") {
    return queryKeys.mcpServers.org(scope.orgId);
  } else if (scope.type === "team") {
    return queryKeys.mcpServers.team(scope.orgId, scope.teamId);
  }
  return queryKeys.mcpServers.user(scope.orgId, scope.teamId);
}
