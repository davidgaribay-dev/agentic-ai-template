import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, AlertTriangle } from "lucide-react";

type SettingsLevel = "org" | "team" | "user";

interface MCPSettingsProps {
  mcpEnabled: boolean;
  mcpAllowCustomServers?: boolean;
  onMCPEnabledChange: (enabled: boolean) => void;
  onMCPAllowCustomServersChange?: (allowed: boolean) => void;
  isLoading?: boolean;
  level: SettingsLevel;
  disabledBy?: "org" | "team" | null;
  customServersDisabledBy?: "org" | "team" | null;
}

export function MCPSettings({
  mcpEnabled,
  mcpAllowCustomServers,
  onMCPEnabledChange,
  onMCPAllowCustomServersChange,
  isLoading = false,
  level,
  disabledBy,
  customServersDisabledBy,
}: MCPSettingsProps) {
  const isDisabledByHigherLevel = !!disabledBy;
  const customServersDisabledByHigher = !!customServersDisabledBy;

  const getDisabledByText = (disabledByLevel: "org" | "team" | null) => {
    if (!disabledByLevel) return null;
    return disabledByLevel === "org" ? "organization" : "team";
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label htmlFor="mcp-enabled" className="text-sm font-medium">
            MCP Tools
          </Label>
          <p className="text-xs text-muted-foreground">
            Enable Model Context Protocol tool integrations
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isDisabledByHigherLevel && (
            <Badge
              variant="secondary"
              className="text-xs bg-amber-500/15 text-amber-600 dark:text-amber-400 border-0"
            >
              <AlertTriangle className="mr-1 size-3" />
              Disabled by {getDisabledByText(disabledBy)}
            </Badge>
          )}
          {isLoading ? (
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          ) : (
            <Switch
              id="mcp-enabled"
              checked={mcpEnabled && !isDisabledByHigherLevel}
              onCheckedChange={onMCPEnabledChange}
              disabled={isDisabledByHigherLevel}
            />
          )}
        </div>
      </div>

      {level !== "user" && onMCPAllowCustomServersChange && (
        <div className="flex items-center justify-between pl-4 border-l-2 border-muted">
          <div className="space-y-0.5">
            <Label htmlFor="mcp-custom-servers" className="text-sm font-medium">
              Allow Custom Servers
            </Label>
            <p className="text-xs text-muted-foreground">
              {level === "org"
                ? "Allow teams and users to add their own MCP servers"
                : "Allow users to add their own MCP servers"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {customServersDisabledByHigher && (
              <Badge
                variant="secondary"
                className="text-xs bg-amber-500/15 text-amber-600 dark:text-amber-400 border-0"
              >
                <AlertTriangle className="mr-1 size-3" />
                Disabled by {getDisabledByText(customServersDisabledBy)}
              </Badge>
            )}
            {isLoading ? (
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            ) : (
              <Switch
                id="mcp-custom-servers"
                checked={
                  (mcpAllowCustomServers ?? true) &&
                  !customServersDisabledByHigher
                }
                onCheckedChange={onMCPAllowCustomServersChange}
                disabled={
                  !mcpEnabled ||
                  isDisabledByHigherLevel ||
                  customServersDisabledByHigher
                }
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
