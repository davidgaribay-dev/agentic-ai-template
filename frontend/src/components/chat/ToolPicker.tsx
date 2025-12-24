import * as React from "react";
import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Wrench,
  Building2,
  Users,
  User,
  Search,
  Loader2,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  ServerOff,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { MCPServerWithTools, MCPTool } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  useEffectiveMCPTools,
  useEffectiveChatSettings,
  useUpdateUserToolConfig,
} from "@/lib/queries";

interface ToolPickerProps {
  organizationId?: string;
  teamId?: string;
  disabled?: boolean;
}

export function ToolPicker({
  organizationId,
  teamId,
  disabled = false,
}: ToolPickerProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const scopeConfig = useMemo(
    () => ({
      org: { label: t("com_organization"), icon: Building2 },
      team: { label: t("com_team"), icon: Users },
      user: { label: t("prompts_personal_info"), icon: User },
    }),
    [t],
  );
  const [expandedServers, setExpandedServers] = useState<Set<string>>(
    new Set(),
  );

  // Fetch effective tools
  const { data: toolsData, isLoading: isLoadingTools } = useEffectiveMCPTools(
    organizationId,
    teamId,
  );

  // Fetch effective settings to get disabled lists
  const { data: effectiveSettings, isLoading: isLoadingSettings } =
    useEffectiveChatSettings(organizationId, teamId);

  // Mutation for updating tool config
  const updateConfig = useUpdateUserToolConfig();

  const isLoading = isLoadingTools || isLoadingSettings;

  // Get disabled sets from effective settings
  const disabledServers = useMemo(
    () => new Set(effectiveSettings?.disabled_mcp_servers ?? []),
    [effectiveSettings],
  );
  const disabledTools = useMemo(
    () => new Set(effectiveSettings?.disabled_tools ?? []),
    [effectiveSettings],
  );

  // Group servers by scope
  const serverGroups = useMemo(() => {
    if (!toolsData?.servers) return [];

    const groups: Array<{
      scope: "org" | "team" | "user";
      label: string;
      icon: React.ElementType;
      servers: MCPServerWithTools[];
    }> = [];

    const orgServers = toolsData.servers.filter((s) => s.scope === "org");
    const teamServers = toolsData.servers.filter((s) => s.scope === "team");
    const userServers = toolsData.servers.filter((s) => s.scope === "user");

    if (orgServers.length > 0) {
      groups.push({
        scope: "org",
        ...scopeConfig.org,
        servers: orgServers,
      });
    }
    if (teamServers.length > 0) {
      groups.push({
        scope: "team",
        ...scopeConfig.team,
        servers: teamServers,
      });
    }
    if (userServers.length > 0) {
      groups.push({
        scope: "user",
        ...scopeConfig.user,
        servers: userServers,
      });
    }

    return groups;
  }, [toolsData, scopeConfig]);

  // Filter by search - filters both servers and tools within servers
  // Matches on tool name and description for better discoverability
  const filteredGroups = useMemo(() => {
    if (!search.trim()) return serverGroups;

    const searchLower = search.toLowerCase();
    return serverGroups
      .map((group) => ({
        ...group,
        servers: group.servers
          .map((server) => {
            // Filter tools that match the search by name or description
            const matchingTools = server.tools.filter(
              (tool) =>
                tool.name.toLowerCase().includes(searchLower) ||
                tool.description?.toLowerCase().includes(searchLower),
            );

            // Only include server if it has matching tools
            if (matchingTools.length > 0) {
              return { ...server, tools: matchingTools };
            }
            return null;
          })
          .filter((server): server is MCPServerWithTools => server !== null),
      }))
      .filter((group) => group.servers.length > 0);
  }, [serverGroups, search]);

  const totalServers = toolsData?.total_servers ?? 0;
  const totalTools = toolsData?.total_tools ?? 0;

  const toggleServerExpanded = (serverId: string) => {
    setExpandedServers((prev) => {
      const next = new Set(prev);
      if (next.has(serverId)) {
        next.delete(serverId);
      } else {
        next.add(serverId);
      }
      return next;
    });
  };

  const handleServerToggle = (serverId: string, enabled: boolean) => {
    const newDisabledServers = new Set(disabledServers);
    if (enabled) {
      newDisabledServers.delete(serverId);
    } else {
      newDisabledServers.add(serverId);
    }
    updateConfig.mutate({
      disabled_mcp_servers: Array.from(newDisabledServers),
    });
  };

  const handleToolToggle = (toolName: string, enabled: boolean) => {
    const newDisabledTools = new Set(disabledTools);
    if (enabled) {
      newDisabledTools.delete(toolName);
    } else {
      newDisabledTools.add(toolName);
    }
    updateConfig.mutate({
      disabled_tools: Array.from(newDisabledTools),
    });
  };

  const isServerEnabled = (serverId: string) => !disabledServers.has(serverId);
  const isToolEnabled = (toolName: string) => !disabledTools.has(toolName);

  // Check if MCP is disabled at a higher level
  const mcpDisabled = effectiveSettings?.mcp_enabled === false;

  // Count total enabled tools
  const enabledToolsCount = useMemo(() => {
    if (!toolsData?.servers) return 0;
    let count = 0;
    for (const server of toolsData.servers) {
      if (isServerEnabled(server.server_id)) {
        for (const tool of server.tools) {
          if (isToolEnabled(tool.name)) {
            count++;
          }
        }
      }
    }
    return count;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toolsData, disabledServers, disabledTools]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          disabled={disabled}
          className="h-8 w-8 rounded-md hover:bg-muted transition-colors"
          aria-label={t("aria_configure_tools")}
        >
          <Wrench className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[600px] max-w-[calc(100vw-2rem)] p-0 overflow-hidden"
        align="start"
        side="top"
        sideOffset={8}
      >
        <div className="flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between border-b px-3 py-2">
            <span className="text-sm text-muted-foreground">
              {t("tools_header_desc")}
            </span>
            {!mcpDisabled && totalTools > 0 && (
              <span className="text-sm font-medium">
                {t("tools_selected", { count: enabledToolsCount })}
              </span>
            )}
          </div>

          {/* Search */}
          <div className="border-b p-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t("mcp_search_tools")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 pl-8 text-sm"
              />
            </div>
          </div>

          {/* Content */}
          <div className="max-h-[400px] overflow-y-auto">
            {mcpDisabled ? (
              <div className="py-8 text-center">
                <ServerOff className="mx-auto h-8 w-8 text-muted-foreground/50" />
                <p className="mt-2 text-sm text-muted-foreground">
                  {t("tools_disabled")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {effectiveSettings?.mcp_disabled_by === "org"
                    ? t("tools_disabled_by_org")
                    : effectiveSettings?.mcp_disabled_by === "team"
                      ? t("tools_disabled_by_team")
                      : t("tools_enable_in_settings")}
                </p>
              </div>
            ) : isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : totalServers === 0 ? (
              <div className="py-8 text-center">
                <Wrench className="mx-auto h-8 w-8 text-muted-foreground/50" />
                <p className="mt-2 text-sm text-muted-foreground">
                  {t("tools_no_servers")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("tools_add_in_settings")}
                </p>
              </div>
            ) : filteredGroups.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-sm text-muted-foreground">
                  {t("tools_no_match", { search })}
                </p>
              </div>
            ) : (
              <div className="py-1">
                {filteredGroups.map((group) => (
                  <div key={group.scope}>
                    {/* Scope header */}
                    <div className="flex items-center gap-2 px-3 py-1.5">
                      <group.icon className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs font-medium text-muted-foreground">
                        {group.label}
                      </span>
                    </div>
                    {/* Servers */}
                    {group.servers.map((server) => (
                      <ServerRow
                        key={server.server_id}
                        server={server}
                        isExpanded={
                          expandedServers.has(server.server_id) ||
                          !!search.trim()
                        }
                        onToggleExpand={() =>
                          toggleServerExpanded(server.server_id)
                        }
                        isServerEnabled={isServerEnabled(server.server_id)}
                        onServerToggle={(enabled) =>
                          handleServerToggle(server.server_id, enabled)
                        }
                        isToolEnabled={isToolEnabled}
                        onToolToggle={handleToolToggle}
                        isUpdating={updateConfig.isPending}
                      />
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

interface ServerRowProps {
  server: MCPServerWithTools;
  isExpanded: boolean;
  onToggleExpand: () => void;
  isServerEnabled: boolean;
  onServerToggle: (enabled: boolean) => void;
  isToolEnabled: (toolName: string) => boolean;
  onToolToggle: (toolName: string, enabled: boolean) => void;
  isUpdating: boolean;
}

function ServerRow({
  server,
  isExpanded,
  onToggleExpand,
  isServerEnabled,
  onServerToggle,
  isToolEnabled,
  onToolToggle,
  isUpdating,
}: ServerRowProps) {
  const { t } = useTranslation();
  const hasError = !!server.error;
  const hasTools = server.tools.length > 0;

  // Calculate indeterminate state: some but not all tools enabled
  const enabledToolCount = server.tools.filter((t) =>
    isToolEnabled(t.name),
  ).length;
  const allToolsEnabled = enabledToolCount === server.tools.length;
  const someToolsEnabled = enabledToolCount > 0 && !allToolsEnabled;

  // Server is "checked" if enabled AND all tools are enabled
  // Server is "indeterminate" if enabled AND some (but not all) tools are enabled
  const serverChecked = isServerEnabled && allToolsEnabled;
  const serverIndeterminate = isServerEnabled && someToolsEnabled;

  return (
    <div>
      {/* Server row */}
      <div
        className={cn(
          "flex items-center gap-1.5 px-3 py-1 hover:bg-accent/50 transition-colors overflow-hidden",
        )}
      >
        {/* Expand/collapse */}
        <button
          onClick={onToggleExpand}
          disabled={!hasTools}
          className={cn(
            "flex items-center justify-center h-5 w-5 shrink-0",
            hasTools ? "cursor-pointer" : "cursor-default opacity-0",
          )}
        >
          {hasTools &&
            (isExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            ))}
        </button>

        {/* Checkbox */}
        <Checkbox
          checked={serverIndeterminate ? "indeterminate" : serverChecked}
          onCheckedChange={(checked) => {
            if (checked === "indeterminate") return;
            onServerToggle(checked);
          }}
          disabled={isUpdating}
          className="shrink-0"
          aria-label={t(
            isServerEnabled ? "tools_action_disable" : "tools_action_enable",
            { name: server.server_name },
          )}
        />

        {/* Server icon */}
        <Wrench className="h-4 w-4 text-muted-foreground shrink-0" />

        {/* Server name */}
        <span
          className={cn(
            "text-sm flex-1 min-w-0 truncate",
            !isServerEnabled && "text-muted-foreground",
          )}
          title={server.server_name}
        >
          {t("tools_server_prefix")} {server.server_name}
        </span>

        {/* Tool count */}
        {hasTools && isServerEnabled && (
          <span className="text-xs text-muted-foreground shrink-0">
            {t("tools_count", {
              enabled: enabledToolCount,
              total: server.tools.length,
            })}
          </span>
        )}

        {/* Error indicator */}
        {hasError && (
          <span title={t("tools_connection_error", { error: server.error })}>
            <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
          </span>
        )}
      </div>

      {/* Tools list (tree children) */}
      {isExpanded && hasTools && (
        <div className="ml-6">
          {server.tools.map((tool) => (
            <ToolRow
              key={tool.name}
              tool={tool}
              isEnabled={isServerEnabled && isToolEnabled(tool.name)}
              onToggle={(enabled) => onToolToggle(tool.name, enabled)}
              isDisabledByServer={!isServerEnabled}
              isUpdating={isUpdating}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface ToolRowProps {
  tool: MCPTool;
  isEnabled: boolean;
  onToggle: (enabled: boolean) => void;
  isDisabledByServer: boolean;
  isUpdating: boolean;
}

function ToolRow({
  tool,
  isEnabled,
  onToggle,
  isDisabledByServer,
  isUpdating,
}: ToolRowProps) {
  const { t } = useTranslation();
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 px-3 py-1 hover:bg-accent/30 transition-colors overflow-hidden",
      )}
    >
      {/* Tree connector space (aligned with parent chevron) */}
      <div className="w-5 shrink-0" />

      {/* Checkbox */}
      <Checkbox
        checked={isEnabled}
        onCheckedChange={onToggle}
        disabled={isUpdating || isDisabledByServer}
        className="shrink-0"
        aria-label={t(
          isEnabled ? "tools_action_disable" : "tools_action_enable",
          { name: tool.name },
        )}
      />

      {/* Tool icon */}
      <Wrench className="h-4 w-4 text-muted-foreground shrink-0" />

      {/* Tool name and description */}
      <div className="flex-1 min-w-0 flex items-center gap-2 overflow-hidden">
        <span
          className={cn(
            "text-sm shrink-0 max-w-[200px] truncate",
            !isEnabled && "text-muted-foreground",
          )}
          title={tool.name}
        >
          {tool.name}
        </span>
        {tool.description && (
          <span
            className="text-sm text-muted-foreground truncate min-w-0 flex-1"
            title={tool.description}
          >
            {tool.description}
          </span>
        )}
      </div>
    </div>
  );
}
