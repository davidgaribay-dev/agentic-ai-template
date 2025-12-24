/**
 * Badge components for MCP server status display.
 */

import { Globe, Power, PowerOff, User, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { MCPServer } from "@/lib/api";

export function getScopeIcon(scope: MCPServer["scope"]) {
  switch (scope) {
    case "org":
      return <Globe className="size-3" />;
    case "team":
      return <Users className="size-3" />;
    case "user":
      return <User className="size-3" />;
  }
}

export function getScopeBadge(scope: MCPServer["scope"]) {
  const variants = {
    org: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
    team: "bg-purple-500/15 text-purple-600 dark:text-purple-400",
    user: "bg-green-500/15 text-green-600 dark:text-green-400",
  };

  const labels = {
    org: "Organization",
    team: "Team",
    user: "Personal",
  };

  return (
    <Badge
      variant="secondary"
      className={`text-xs h-5 px-1.5 border-0 ${variants[scope]}`}
    >
      {getScopeIcon(scope)}
      <span className="ml-1">{labels[scope]}</span>
    </Badge>
  );
}

export function getTransportBadge(transport: string) {
  return (
    <Badge variant="outline" className="text-[10px] h-5 px-1.5 font-mono">
      {transport.toUpperCase()}
    </Badge>
  );
}

export function getAuthBadge(authType: string, hasSecret: boolean) {
  if (authType === "none") return null;

  const label = authType === "bearer" ? "Bearer" : "API Key";

  return (
    <Badge
      variant="outline"
      className={`text-[10px] h-5 px-1.5 ${hasSecret ? "border-green-500 text-green-600 dark:text-green-400" : "border-amber-500 text-amber-600 dark:text-amber-400"}`}
    >
      {label}
      {!hasSecret && " (no secret)"}
    </Badge>
  );
}

export function getStatusBadge(enabled: boolean) {
  if (enabled) {
    return (
      <Badge
        variant="secondary"
        className="text-xs h-5 px-1.5 border-0 bg-green-500/15 text-green-600 dark:text-green-400"
      >
        <Power className="size-2.5 mr-1" />
        Enabled
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="text-xs h-5 px-1.5 text-muted-foreground"
    >
      <PowerOff className="size-2.5 mr-1" />
      Disabled
    </Badge>
  );
}
