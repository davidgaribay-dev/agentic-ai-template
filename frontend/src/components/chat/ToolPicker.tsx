import * as React from "react"
import { useState, useMemo } from "react"
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
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { MCPServerWithTools, MCPTool } from "@/lib/api"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import {
  useEffectiveMCPTools,
  useEffectiveChatSettings,
  useUpdateUserToolConfig,
} from "@/lib/queries"

interface ToolPickerProps {
  organizationId?: string
  teamId?: string
  disabled?: boolean
}

const scopeConfig = {
  org: { label: "Organization", icon: Building2 },
  team: { label: "Team", icon: Users },
  user: { label: "Personal", icon: User },
} as const

export function ToolPicker({
  organizationId,
  teamId,
  disabled = false,
}: ToolPickerProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [expandedServers, setExpandedServers] = useState<Set<string>>(new Set())

  // Fetch effective tools
  const { data: toolsData, isLoading: isLoadingTools } = useEffectiveMCPTools(
    organizationId,
    teamId
  )

  // Fetch effective settings to get disabled lists
  const { data: effectiveSettings, isLoading: isLoadingSettings } =
    useEffectiveChatSettings(organizationId, teamId)

  // Mutation for updating tool config
  const updateConfig = useUpdateUserToolConfig()

  const isLoading = isLoadingTools || isLoadingSettings

  // Get disabled sets from effective settings
  const disabledServers = useMemo(
    () => new Set(effectiveSettings?.disabled_mcp_servers ?? []),
    [effectiveSettings]
  )
  const disabledTools = useMemo(
    () => new Set(effectiveSettings?.disabled_tools ?? []),
    [effectiveSettings]
  )

  // Group servers by scope
  const serverGroups = useMemo(() => {
    if (!toolsData?.servers) return []

    const groups: Array<{
      scope: "org" | "team" | "user"
      label: string
      icon: React.ElementType
      servers: MCPServerWithTools[]
    }> = []

    const orgServers = toolsData.servers.filter((s) => s.scope === "org")
    const teamServers = toolsData.servers.filter((s) => s.scope === "team")
    const userServers = toolsData.servers.filter((s) => s.scope === "user")

    if (orgServers.length > 0) {
      groups.push({
        scope: "org",
        ...scopeConfig.org,
        servers: orgServers,
      })
    }
    if (teamServers.length > 0) {
      groups.push({
        scope: "team",
        ...scopeConfig.team,
        servers: teamServers,
      })
    }
    if (userServers.length > 0) {
      groups.push({
        scope: "user",
        ...scopeConfig.user,
        servers: userServers,
      })
    }

    return groups
  }, [toolsData])

  // Filter by search - filters both servers and tools within servers
  // Matches on tool name and description for better discoverability
  const filteredGroups = useMemo(() => {
    if (!search.trim()) return serverGroups

    const searchLower = search.toLowerCase()
    return serverGroups
      .map((group) => ({
        ...group,
        servers: group.servers
          .map((server) => {
            // Filter tools that match the search by name or description
            const matchingTools = server.tools.filter(
              (tool) =>
                tool.name.toLowerCase().includes(searchLower) ||
                tool.description?.toLowerCase().includes(searchLower)
            )

            // Only include server if it has matching tools
            if (matchingTools.length > 0) {
              return { ...server, tools: matchingTools }
            }
            return null
          })
          .filter((server): server is MCPServerWithTools => server !== null),
      }))
      .filter((group) => group.servers.length > 0)
  }, [serverGroups, search])

  const totalServers = toolsData?.total_servers ?? 0
  const totalTools = toolsData?.total_tools ?? 0

  const toggleServerExpanded = (serverId: string) => {
    setExpandedServers((prev) => {
      const next = new Set(prev)
      if (next.has(serverId)) {
        next.delete(serverId)
      } else {
        next.add(serverId)
      }
      return next
    })
  }

  const handleServerToggle = (serverId: string, enabled: boolean) => {
    const newDisabledServers = new Set(disabledServers)
    if (enabled) {
      newDisabledServers.delete(serverId)
    } else {
      newDisabledServers.add(serverId)
    }
    updateConfig.mutate({
      disabled_mcp_servers: Array.from(newDisabledServers),
    })
  }

  const handleToolToggle = (toolName: string, enabled: boolean) => {
    const newDisabledTools = new Set(disabledTools)
    if (enabled) {
      newDisabledTools.delete(toolName)
    } else {
      newDisabledTools.add(toolName)
    }
    updateConfig.mutate({
      disabled_tools: Array.from(newDisabledTools),
    })
  }

  const isServerEnabled = (serverId: string) => !disabledServers.has(serverId)
  const isToolEnabled = (toolName: string) => !disabledTools.has(toolName)

  // Check if MCP is disabled at a higher level
  const mcpDisabled = effectiveSettings?.mcp_enabled === false

  // Count total enabled tools
  const enabledToolsCount = useMemo(() => {
    if (!toolsData?.servers) return 0
    let count = 0
    for (const server of toolsData.servers) {
      if (isServerEnabled(server.server_id)) {
        for (const tool of server.tools) {
          if (isToolEnabled(tool.name)) {
            count++
          }
        }
      }
    }
    return count
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toolsData, disabledServers, disabledTools])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          disabled={disabled}
          className="h-8 w-8 rounded-md hover:bg-muted transition-colors"
          aria-label="Configure tools"
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
              Select tools that are available to chat.
            </span>
            {!mcpDisabled && totalTools > 0 && (
              <span className="text-sm font-medium">
                {enabledToolsCount} Selected
              </span>
            )}
          </div>

          {/* Search */}
          <div className="border-b p-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search tools..."
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
                  MCP tools are disabled
                </p>
                <p className="text-xs text-muted-foreground">
                  {effectiveSettings?.mcp_disabled_by === "org"
                    ? "Disabled by organization settings"
                    : effectiveSettings?.mcp_disabled_by === "team"
                      ? "Disabled by team settings"
                      : "Enable in your settings"}
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
                  No MCP servers configured
                </p>
                <p className="text-xs text-muted-foreground">
                  Add servers in settings
                </p>
              </div>
            ) : filteredGroups.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-sm text-muted-foreground">
                  No tools match "{search}"
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
                        isExpanded={expandedServers.has(server.server_id) || !!search.trim()}
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
  )
}

interface ServerRowProps {
  server: MCPServerWithTools
  isExpanded: boolean
  onToggleExpand: () => void
  isServerEnabled: boolean
  onServerToggle: (enabled: boolean) => void
  isToolEnabled: (toolName: string) => boolean
  onToolToggle: (toolName: string, enabled: boolean) => void
  isUpdating: boolean
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
  const hasError = !!server.error
  const hasTools = server.tools.length > 0

  // Calculate indeterminate state: some but not all tools enabled
  const enabledToolCount = server.tools.filter((t) => isToolEnabled(t.name)).length
  const allToolsEnabled = enabledToolCount === server.tools.length
  const someToolsEnabled = enabledToolCount > 0 && !allToolsEnabled

  // Server is "checked" if enabled AND all tools are enabled
  // Server is "indeterminate" if enabled AND some (but not all) tools are enabled
  const serverChecked = isServerEnabled && allToolsEnabled
  const serverIndeterminate = isServerEnabled && someToolsEnabled

  return (
    <div>
      {/* Server row */}
      <div
        className={cn(
          "flex items-center gap-1.5 px-3 py-1 hover:bg-accent/50 transition-colors overflow-hidden"
        )}
      >
        {/* Expand/collapse */}
        <button
          onClick={onToggleExpand}
          disabled={!hasTools}
          className={cn(
            "flex items-center justify-center h-5 w-5 shrink-0",
            hasTools ? "cursor-pointer" : "cursor-default opacity-0"
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
            if (checked === "indeterminate") return
            onServerToggle(checked)
          }}
          disabled={isUpdating}
          className="shrink-0"
          aria-label={`${isServerEnabled ? "Disable" : "Enable"} ${server.server_name}`}
        />

        {/* Server icon */}
        <Wrench className="h-4 w-4 text-muted-foreground shrink-0" />

        {/* Server name */}
        <span
          className={cn(
            "text-sm flex-1 min-w-0 truncate",
            !isServerEnabled && "text-muted-foreground"
          )}
          title={server.server_name}
        >
          MCP Server: {server.server_name}
        </span>

        {/* Tool count */}
        {hasTools && isServerEnabled && (
          <span className="text-xs text-muted-foreground shrink-0">
            {enabledToolCount}/{server.tools.length} tools
          </span>
        )}

        {/* Error indicator */}
        {hasError && (
          <AlertTriangle
            className="h-4 w-4 text-amber-500 shrink-0"
            title={`Connection error: ${server.error}`}
          />
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
  )
}

interface ToolRowProps {
  tool: MCPTool
  isEnabled: boolean
  onToggle: (enabled: boolean) => void
  isDisabledByServer: boolean
  isUpdating: boolean
}

function ToolRow({
  tool,
  isEnabled,
  onToggle,
  isDisabledByServer,
  isUpdating,
}: ToolRowProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 px-3 py-1 hover:bg-accent/30 transition-colors overflow-hidden"
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
        aria-label={`${isEnabled ? "Disable" : "Enable"} ${tool.name}`}
      />

      {/* Tool icon */}
      <Wrench className="h-4 w-4 text-muted-foreground shrink-0" />

      {/* Tool name and description */}
      <div className="flex-1 min-w-0 flex items-center gap-2 overflow-hidden">
        <span
          className={cn(
            "text-sm shrink-0 max-w-[200px] truncate",
            !isEnabled && "text-muted-foreground"
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
  )
}
