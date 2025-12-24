/**
 * Badge components for MCP server status display.
 */

import { useTranslation } from "react-i18next";
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

export function ScopeBadge({ scope }: { scope: MCPServer["scope"] }) {
  const { t } = useTranslation();
  const variants = {
    org: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
    team: "bg-purple-500/15 text-purple-600 dark:text-purple-400",
    user: "bg-green-500/15 text-green-600 dark:text-green-400",
  };

  const labelKeys = {
    org: "mcp_scope_organization",
    team: "mcp_scope_team",
    user: "mcp_scope_personal",
  } as const;

  return (
    <Badge
      variant="secondary"
      className={`text-xs h-5 px-1.5 border-0 ${variants[scope]}`}
    >
      {getScopeIcon(scope)}
      <span className="ml-1">{t(labelKeys[scope])}</span>
    </Badge>
  );
}

// Legacy function for backwards compatibility
export function getScopeBadge(scope: MCPServer["scope"]) {
  return <ScopeBadge scope={scope} />;
}

export function getTransportBadge(transport: string) {
  return (
    <Badge variant="outline" className="text-[10px] h-5 px-1.5 font-mono">
      {transport.toUpperCase()}
    </Badge>
  );
}

export function AuthBadge({
  authType,
  hasSecret,
}: {
  authType: string;
  hasSecret: boolean;
}) {
  const { t } = useTranslation();
  if (authType === "none") return null;

  const label =
    authType === "bearer" ? t("mcp_auth_bearer") : t("mcp_auth_api_key");

  return (
    <Badge
      variant="outline"
      className={`text-[10px] h-5 px-1.5 ${hasSecret ? "border-green-500 text-green-600 dark:text-green-400" : "border-amber-500 text-amber-600 dark:text-amber-400"}`}
    >
      {label}
      {!hasSecret && ` ${t("mcp_auth_no_secret")}`}
    </Badge>
  );
}

// Legacy function for backwards compatibility
export function getAuthBadge(authType: string, hasSecret: boolean) {
  return <AuthBadge authType={authType} hasSecret={hasSecret} />;
}

export function StatusBadge({ enabled }: { enabled: boolean }) {
  const { t } = useTranslation();
  if (enabled) {
    return (
      <Badge
        variant="secondary"
        className="text-xs h-5 px-1.5 border-0 bg-green-500/15 text-green-600 dark:text-green-400"
      >
        <Power className="size-2.5 mr-1" />
        {t("mcp_status_enabled")}
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="text-xs h-5 px-1.5 text-muted-foreground"
    >
      <PowerOff className="size-2.5 mr-1" />
      {t("mcp_status_disabled")}
    </Badge>
  );
}

// Legacy function for backwards compatibility
export function getStatusBadge(enabled: boolean) {
  return <StatusBadge enabled={enabled} />;
}
