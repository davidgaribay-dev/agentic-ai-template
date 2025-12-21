import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Server,
  Plus,
  Trash2,
  Loader2,
  ExternalLink,
  MoreHorizontal,
  Power,
  PowerOff,
  Pencil,
  Globe,
  Users,
  User,
} from "lucide-react"

import {
  mcpServersApi,
  type MCPServer,
  type MCPServerCreate,
  type MCPServerUpdate,
  type MCPTransport,
  type MCPAuthType,
  ApiError,
} from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

type Scope = { type: "org"; orgId: string } | { type: "team"; orgId: string; teamId: string } | { type: "user"; orgId: string; teamId: string }

interface MCPServersListProps {
  scope: Scope
  allowCreate?: boolean
  compact?: boolean
}

function getScopeIcon(scope: MCPServer["scope"]) {
  switch (scope) {
    case "org":
      return <Globe className="size-3" />
    case "team":
      return <Users className="size-3" />
    case "user":
      return <User className="size-3" />
  }
}

function getScopeBadge(scope: MCPServer["scope"]) {
  const variants = {
    org: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
    team: "bg-purple-500/15 text-purple-600 dark:text-purple-400",
    user: "bg-green-500/15 text-green-600 dark:text-green-400",
  }

  const labels = {
    org: "Organization",
    team: "Team",
    user: "Personal",
  }

  return (
    <Badge variant="secondary" className={`text-xs h-5 px-1.5 border-0 ${variants[scope]}`}>
      {getScopeIcon(scope)}
      <span className="ml-1">{labels[scope]}</span>
    </Badge>
  )
}

export function MCPServersList({ scope, allowCreate = true, compact = false }: MCPServersListProps) {
  const queryClient = useQueryClient()

  const queryKey = scope.type === "org"
    ? ["mcp-servers", "org", scope.orgId]
    : scope.type === "team"
    ? ["mcp-servers", "team", scope.orgId, scope.teamId]
    : ["mcp-servers", "user", scope.orgId, scope.teamId]

  const { data: serversData, isLoading } = useQuery({
    queryKey,
    queryFn: () => {
      if (scope.type === "org") {
        return mcpServersApi.listOrgServers(scope.orgId)
      } else if (scope.type === "team") {
        return mcpServersApi.listTeamServers(scope.orgId, scope.teamId)
      } else {
        return mcpServersApi.listUserServers(scope.orgId, scope.teamId)
      }
    },
  })

  const servers = serversData?.data ?? []

  const deleteMutation = useMutation({
    mutationFn: (serverId: string) => {
      if (scope.type === "org") {
        return mcpServersApi.deleteOrgServer(scope.orgId, serverId)
      } else if (scope.type === "team") {
        return mcpServersApi.deleteTeamServer(scope.orgId, scope.teamId, serverId)
      } else {
        return mcpServersApi.deleteUserServer(serverId)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey })
    },
  })

  const toggleMutation = useMutation({
    mutationFn: ({ serverId, enabled }: { serverId: string; enabled: boolean }) => {
      if (scope.type === "org") {
        return mcpServersApi.updateOrgServer(scope.orgId, serverId, { enabled })
      } else if (scope.type === "team") {
        return mcpServersApi.updateTeamServer(scope.orgId, scope.teamId, serverId, { enabled })
      } else {
        return mcpServersApi.updateUserServer(serverId, { enabled })
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey })
    },
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Server className="size-4" />
          <span>{servers.length} server{servers.length !== 1 ? "s" : ""}</span>
        </div>
        {allowCreate && <AddServerDialog scope={scope} compact={compact} />}
      </div>

      {servers.length === 0 ? (
        <div className="text-center py-6">
          <Server className="size-8 mx-auto text-muted-foreground/50 mb-2" />
          <p className="text-sm text-muted-foreground">No MCP servers configured</p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            Add a server to enable external tool integrations
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {servers.map((server) => (
            <ServerRow
              key={server.id}
              server={server}
              scope={scope}
              onToggle={(enabled) => toggleMutation.mutate({ serverId: server.id, enabled })}
              onDelete={() => deleteMutation.mutate(server.id)}
              isToggling={toggleMutation.isPending}
              isDeleting={deleteMutation.isPending}
              compact={compact}
            />
          ))}
        </div>
      )}
    </div>
  )
}

interface ServerRowProps {
  server: MCPServer
  scope: Scope
  onToggle: (enabled: boolean) => void
  onDelete: () => void
  isToggling?: boolean
  isDeleting?: boolean
  compact?: boolean
}

function ServerRow({
  server,
  scope,
  onToggle,
  onDelete,
  isToggling,
  isDeleting,
  compact,
}: ServerRowProps) {
  return (
    <div className={`flex items-center justify-between rounded-lg border p-3 ${!server.enabled ? "opacity-60" : ""}`}>
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className={`flex items-center justify-center rounded-md ${server.enabled ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`} style={{ width: compact ? 28 : 32, height: compact ? 28 : 32 }}>
          <Server className={compact ? "size-3.5" : "size-4"} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={`font-medium truncate ${compact ? "text-sm" : ""}`}>{server.name}</span>
            {getScopeBadge(server.scope)}
            {!server.enabled && (
              <Badge variant="outline" className="text-xs h-5 px-1.5 text-muted-foreground">
                Disabled
              </Badge>
            )}
          </div>
          {server.description && !compact && (
            <p className="text-xs text-muted-foreground truncate mt-0.5">
              {server.description}
            </p>
          )}
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-muted-foreground truncate max-w-[200px]">
              {server.url}
            </span>
            <Badge variant="outline" className="text-[10px] h-4 px-1">
              {server.transport.toUpperCase()}
            </Badge>
            {server.auth_type !== "none" && (
              <Badge
                variant="outline"
                className={`text-[10px] h-4 px-1 ${server.has_auth_secret ? "border-green-500 text-green-600 dark:text-green-400" : "border-amber-500 text-amber-600 dark:text-amber-400"}`}
              >
                {server.auth_type === "bearer" ? "Bearer" : "API Key"}
                {!server.has_auth_secret && " (no secret)"}
              </Badge>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1 ml-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-7">
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem
              onClick={() => window.open(server.url, "_blank")}
            >
              <ExternalLink className="mr-2 size-3.5" />
              Open URL
            </DropdownMenuItem>
            <EditServerDialog server={server} scope={scope} />
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onToggle(!server.enabled)}
              disabled={isToggling}
            >
              {server.enabled ? (
                <>
                  <PowerOff className="mr-2 size-3.5" />
                  Disable
                </>
              ) : (
                <>
                  <Power className="mr-2 size-3.5" />
                  Enable
                </>
              )}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onSelect={(e) => e.preventDefault()}
                >
                  <Trash2 className="mr-2 size-3.5" />
                  Delete
                </DropdownMenuItem>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete MCP Server</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete "{server.name}"? This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={onDelete}
                    disabled={isDeleting}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {isDeleting && <Loader2 className="mr-2 size-3 animate-spin" />}
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}

interface AddServerDialogProps {
  scope: Scope
  compact?: boolean
}

function AddServerDialog({ scope, compact }: AddServerDialogProps) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const [formData, setFormData] = useState<MCPServerCreate>({
    name: "",
    description: "",
    url: "",
    transport: "http",
    auth_type: "none",
    auth_header_name: "",
    auth_secret: "",
    enabled: true,
    tool_prefix: true,
  })

  const createMutation = useMutation({
    mutationFn: (data: MCPServerCreate) => {
      if (scope.type === "org") {
        return mcpServersApi.createOrgServer(scope.orgId, data)
      } else if (scope.type === "team") {
        return mcpServersApi.createTeamServer(scope.orgId, scope.teamId, data)
      } else {
        return mcpServersApi.createUserServer(scope.orgId, scope.teamId, data)
      }
    },
    onSuccess: () => {
      const queryKey = scope.type === "org"
        ? ["mcp-servers", "org", scope.orgId]
        : scope.type === "team"
        ? ["mcp-servers", "team", scope.orgId, scope.teamId]
        : ["mcp-servers", "user", scope.orgId, scope.teamId]
      queryClient.invalidateQueries({ queryKey })
      resetForm()
    },
    onError: (err: ApiError) => {
      const detail = (err.body as { detail?: string })?.detail
      setError(detail || "Failed to create server")
    },
  })

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      url: "",
      transport: "http",
      auth_type: "none",
      auth_header_name: "",
      auth_secret: "",
      enabled: true,
      tool_prefix: true,
    })
    setError(null)
    setOpen(false)
  }

  const handleSubmit = () => {
    setError(null)
    createMutation.mutate(formData)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => o ? setOpen(true) : resetForm()}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className={compact ? "h-7 text-xs" : ""}>
          <Plus className={compact ? "size-3 mr-1" : "size-4 mr-1.5"} />
          Add Server
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add MCP Server</DialogTitle>
          <DialogDescription>
            Connect to a remote MCP server to enable additional tools.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="My MCP Server"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="transport">Transport</Label>
              <Select
                value={formData.transport}
                onValueChange={(v) => setFormData((prev) => ({ ...prev, transport: v as MCPTransport }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="http">HTTP</SelectItem>
                  <SelectItem value="sse">SSE</SelectItem>
                  <SelectItem value="streamable_http">Streamable HTTP</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="url">URL</Label>
            <Input
              id="url"
              type="url"
              value={formData.url}
              onChange={(e) => setFormData((prev) => ({ ...prev, url: e.target.value }))}
              placeholder="https://mcp.example.com"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description (optional)</Label>
            <Textarea
              id="description"
              value={formData.description || ""}
              onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
              placeholder="What tools does this server provide?"
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="auth_type">Authentication</Label>
              <Select
                value={formData.auth_type}
                onValueChange={(v) => setFormData((prev) => ({ ...prev, auth_type: v as MCPAuthType }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="bearer">Bearer Token</SelectItem>
                  <SelectItem value="api_key">API Key</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {formData.auth_type !== "none" && (
              <div className="space-y-2">
                <Label htmlFor="auth_header_name">Header Name</Label>
                <Input
                  id="auth_header_name"
                  value={formData.auth_header_name || ""}
                  onChange={(e) => setFormData((prev) => ({ ...prev, auth_header_name: e.target.value }))}
                  placeholder={formData.auth_type === "bearer" ? "Authorization" : "X-API-Key"}
                />
              </div>
            )}
          </div>

          {formData.auth_type !== "none" && (
            <div className="space-y-2">
              <Label htmlFor="auth_secret">
                {formData.auth_type === "bearer" ? "Bearer Token" : "API Key"}
              </Label>
              <Input
                id="auth_secret"
                type="password"
                value={formData.auth_secret || ""}
                onChange={(e) => setFormData((prev) => ({ ...prev, auth_secret: e.target.value }))}
                placeholder={formData.auth_type === "bearer" ? "Enter bearer token" : "Enter API key"}
              />
              <p className="text-xs text-muted-foreground">
                This will be securely stored and never displayed again.
              </p>
            </div>
          )}

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="tool_prefix">Prefix Tool Names</Label>
              <p className="text-xs text-muted-foreground">
                Add server name as prefix to tool names
              </p>
            </div>
            <Switch
              id="tool_prefix"
              checked={formData.tool_prefix}
              onCheckedChange={(checked) => setFormData((prev) => ({ ...prev, tool_prefix: checked }))}
            />
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={resetForm}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!formData.name || !formData.url || createMutation.isPending}
          >
            {createMutation.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
            Add Server
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

interface EditServerDialogProps {
  server: MCPServer
  scope: Scope
}

function EditServerDialog({ server, scope }: EditServerDialogProps) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const [formData, setFormData] = useState<MCPServerUpdate>({
    name: server.name,
    description: server.description,
    url: server.url,
    transport: server.transport,
    auth_type: server.auth_type,
    auth_header_name: server.auth_header_name,
    auth_secret: undefined,
    tool_prefix: server.tool_prefix,
  })

  const updateMutation = useMutation({
    mutationFn: (data: MCPServerUpdate) => {
      if (scope.type === "org") {
        return mcpServersApi.updateOrgServer(scope.orgId, server.id, data)
      } else if (scope.type === "team") {
        return mcpServersApi.updateTeamServer(scope.orgId, scope.teamId, server.id, data)
      } else {
        return mcpServersApi.updateUserServer(server.id, data)
      }
    },
    onSuccess: () => {
      const queryKey = scope.type === "org"
        ? ["mcp-servers", "org", scope.orgId]
        : scope.type === "team"
        ? ["mcp-servers", "team", scope.orgId, scope.teamId]
        : ["mcp-servers", "user", scope.orgId, scope.teamId]
      queryClient.invalidateQueries({ queryKey })
      setOpen(false)
      setError(null)
    },
    onError: (err: ApiError) => {
      const detail = (err.body as { detail?: string })?.detail
      setError(detail || "Failed to update server")
    },
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
          <Pencil className="mr-2 size-3.5" />
          Edit
        </DropdownMenuItem>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit MCP Server</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Name</Label>
              <Input
                id="edit-name"
                value={formData.name || ""}
                onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-transport">Transport</Label>
              <Select
                value={formData.transport || server.transport}
                onValueChange={(v) => setFormData((prev) => ({ ...prev, transport: v as MCPTransport }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="http">HTTP</SelectItem>
                  <SelectItem value="sse">SSE</SelectItem>
                  <SelectItem value="streamable_http">Streamable HTTP</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-url">URL</Label>
            <Input
              id="edit-url"
              type="url"
              value={formData.url || ""}
              onChange={(e) => setFormData((prev) => ({ ...prev, url: e.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-description">Description</Label>
            <Textarea
              id="edit-description"
              value={formData.description || ""}
              onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-auth_type">Authentication</Label>
              <Select
                value={formData.auth_type || server.auth_type}
                onValueChange={(v) => setFormData((prev) => ({ ...prev, auth_type: v as MCPAuthType }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="bearer">Bearer Token</SelectItem>
                  <SelectItem value="api_key">API Key</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {(formData.auth_type || server.auth_type) !== "none" && (
              <div className="space-y-2">
                <Label htmlFor="edit-auth_header_name">Header Name</Label>
                <Input
                  id="edit-auth_header_name"
                  value={formData.auth_header_name || ""}
                  onChange={(e) => setFormData((prev) => ({ ...prev, auth_header_name: e.target.value }))}
                  placeholder={(formData.auth_type || server.auth_type) === "bearer" ? "Authorization" : "X-API-Key"}
                />
              </div>
            )}
          </div>

          {(formData.auth_type || server.auth_type) !== "none" && (
            <div className="space-y-2">
              <Label htmlFor="edit-auth_secret">
                {(formData.auth_type || server.auth_type) === "bearer" ? "Bearer Token" : "API Key"}
              </Label>
              <Input
                id="edit-auth_secret"
                type="password"
                value={formData.auth_secret || ""}
                onChange={(e) => setFormData((prev) => ({ ...prev, auth_secret: e.target.value }))}
                placeholder={server.has_auth_secret ? "Leave empty to keep current" : "Enter new secret"}
              />
              <p className="text-xs text-muted-foreground">
                {server.has_auth_secret
                  ? "A secret is configured. Enter a new value to replace it, or leave empty to keep current."
                  : "No secret configured. Enter a value to add authentication."}
              </p>
            </div>
          )}

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="edit-tool_prefix">Prefix Tool Names</Label>
              <p className="text-xs text-muted-foreground">
                Add server name as prefix to tool names
              </p>
            </div>
            <Switch
              id="edit-tool_prefix"
              checked={formData.tool_prefix ?? server.tool_prefix}
              onCheckedChange={(checked) => setFormData((prev) => ({ ...prev, tool_prefix: checked }))}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => updateMutation.mutate(formData)}
            disabled={updateMutation.isPending}
          >
            {updateMutation.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export { AddServerDialog, EditServerDialog }
