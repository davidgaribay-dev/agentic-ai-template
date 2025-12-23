import { useState, useMemo, useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
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
  PlayCircle,
  CheckCircle2,
  XCircle,
  Clock,
  Wrench,
  AlertTriangle,
} from "lucide-react";

import {
  mcpServersApi,
  type MCPServer,
  type MCPServerCreate,
  type MCPServerUpdate,
  type MCPTransport,
  type MCPAuthType,
  type MCPTestResult,
  getApiErrorMessage,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Scope =
  | { type: "org"; orgId: string }
  | { type: "team"; orgId: string; teamId: string }
  | { type: "user"; orgId: string; teamId: string };

interface MCPServersListProps {
  scope: Scope;
  allowCreate?: boolean;
}

function getScopeIcon(scope: MCPServer["scope"]) {
  switch (scope) {
    case "org":
      return <Globe className="size-3" />;
    case "team":
      return <Users className="size-3" />;
    case "user":
      return <User className="size-3" />;
  }
}

function getScopeBadge(scope: MCPServer["scope"]) {
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

function getTransportBadge(transport: string) {
  return (
    <Badge variant="outline" className="text-[10px] h-5 px-1.5 font-mono">
      {transport.toUpperCase()}
    </Badge>
  );
}

function getAuthBadge(authType: string, hasSecret: boolean) {
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

function getStatusBadge(enabled: boolean) {
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

interface ServerActionsCellProps {
  server: MCPServer;
  scope: Scope;
  onToggle: (enabled: boolean) => void;
  onDelete: () => void;
  isToggling: boolean;
}

function ServerActionsCell({
  server,
  scope,
  onToggle,
  onDelete,
  isToggling,
}: ServerActionsCellProps) {
  const [testDialogOpen, setTestDialogOpen] = useState(false);

  return (
    <div className="flex justify-end">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-7">
            <MoreHorizontal className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onSelect={() => setTestDialogOpen(true)}>
            <PlayCircle className="mr-2 size-3.5" />
            Test Connection
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => window.open(server.url, "_blank")}>
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
                  Are you sure you want to delete "{server.name}"? This action
                  cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={onDelete}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Test Connection Dialog - rendered outside dropdown to avoid focus conflicts */}
      <TestConnectionDialog
        server={server}
        scope={scope}
        open={testDialogOpen}
        onOpenChange={setTestDialogOpen}
      />
    </div>
  );
}

export function MCPServersList({
  scope,
  allowCreate = true,
}: MCPServersListProps) {
  const queryClient = useQueryClient();

  const queryKey =
    scope.type === "org"
      ? ["mcp-servers", "org", scope.orgId]
      : scope.type === "team"
        ? ["mcp-servers", "team", scope.orgId, scope.teamId]
        : ["mcp-servers", "user", scope.orgId, scope.teamId];

  const { data: serversData, isLoading } = useQuery({
    queryKey,
    queryFn: () => {
      if (scope.type === "org") {
        return mcpServersApi.listOrgServers(scope.orgId);
      } else if (scope.type === "team") {
        return mcpServersApi.listTeamServers(scope.orgId, scope.teamId);
      } else {
        return mcpServersApi.listUserServers(scope.orgId, scope.teamId);
      }
    },
  });

  const servers = serversData?.data ?? [];

  const deleteMutation = useMutation({
    mutationFn: (serverId: string) => {
      if (scope.type === "org") {
        return mcpServersApi.deleteOrgServer(scope.orgId, serverId);
      } else if (scope.type === "team") {
        return mcpServersApi.deleteTeamServer(
          scope.orgId,
          scope.teamId,
          serverId,
        );
      } else {
        return mcpServersApi.deleteUserServer(serverId);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({
      serverId,
      enabled,
    }: {
      serverId: string;
      enabled: boolean;
    }) => {
      if (scope.type === "org") {
        return mcpServersApi.updateOrgServer(scope.orgId, serverId, {
          enabled,
        });
      } else if (scope.type === "team") {
        return mcpServersApi.updateTeamServer(
          scope.orgId,
          scope.teamId,
          serverId,
          { enabled },
        );
      } else {
        return mcpServersApi.updateUserServer(serverId, { enabled });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const columns: ColumnDef<MCPServer>[] = useMemo(
    () => [
      {
        accessorKey: "name",
        header: "Server",
        cell: ({ row }) => {
          const server = row.original;
          return (
            <div className="flex items-center gap-2.5">
              <div
                className={`flex size-8 items-center justify-center rounded-md ${server.enabled ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}
              >
                <Server className="size-4" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-medium truncate flex items-center gap-2">
                  {server.name}
                  {getScopeBadge(server.scope)}
                </div>
                <div className="text-xs text-muted-foreground truncate max-w-[300px]">
                  {server.url}
                </div>
              </div>
            </div>
          );
        },
      },
      {
        accessorKey: "transport",
        header: "Transport",
        cell: ({ row }) => getTransportBadge(row.original.transport),
      },
      {
        accessorKey: "auth_type",
        header: "Auth",
        cell: ({ row }) =>
          getAuthBadge(
            row.original.auth_type,
            row.original.has_auth_secret,
          ) ?? <span className="text-xs text-muted-foreground">None</span>,
      },
      {
        accessorKey: "enabled",
        header: "Status",
        cell: ({ row }) => getStatusBadge(row.original.enabled),
      },
      {
        id: "actions",
        header: () => <div className="text-right">Actions</div>,
        cell: ({ row }) => {
          const server = row.original;
          return (
            <ServerActionsCell
              server={server}
              scope={scope}
              onToggle={(enabled) =>
                toggleMutation.mutate({ serverId: server.id, enabled })
              }
              onDelete={() => deleteMutation.mutate(server.id)}
              isToggling={toggleMutation.isPending}
            />
          );
        },
      },
    ],
    [scope, toggleMutation, deleteMutation],
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Server className="size-4" />
          <span>
            {servers.length} server{servers.length !== 1 ? "s" : ""}
          </span>
        </div>
        {allowCreate && <AddServerDialog scope={scope} />}
      </div>

      {servers.length === 0 ? (
        <div className="text-center py-8 border rounded-lg">
          <Server className="size-10 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-sm text-muted-foreground">
            No MCP servers configured
          </p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            Add a server to enable external tool integrations
          </p>
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={servers}
          searchKey="name"
          searchPlaceholder="Search servers..."
        />
      )}
    </div>
  );
}

interface AddServerDialogProps {
  scope: Scope;
}

function AddServerDialog({ scope }: AddServerDialogProps) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

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
  });

  const createMutation = useMutation({
    mutationFn: (data: MCPServerCreate) => {
      if (scope.type === "org") {
        return mcpServersApi.createOrgServer(scope.orgId, data);
      } else if (scope.type === "team") {
        return mcpServersApi.createTeamServer(scope.orgId, scope.teamId, data);
      } else {
        return mcpServersApi.createUserServer(scope.orgId, scope.teamId, data);
      }
    },
    onSuccess: () => {
      const queryKey =
        scope.type === "org"
          ? ["mcp-servers", "org", scope.orgId]
          : scope.type === "team"
            ? ["mcp-servers", "team", scope.orgId, scope.teamId]
            : ["mcp-servers", "user", scope.orgId, scope.teamId];
      queryClient.invalidateQueries({ queryKey });
      resetForm();
    },
    onError: (err: unknown) => {
      setError(getApiErrorMessage(err, "Failed to create server"));
    },
  });

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
    });
    setError(null);
    setOpen(false);
  };

  const handleSubmit = () => {
    setError(null);
    createMutation.mutate(formData);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : resetForm())}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus className="size-4 mr-1.5" />
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
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, name: e.target.value }))
                }
                placeholder="My MCP Server"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="transport">Transport</Label>
              <Select
                value={formData.transport}
                onValueChange={(v) =>
                  setFormData((prev) => ({
                    ...prev,
                    transport: v as MCPTransport,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="http">HTTP</SelectItem>
                  <SelectItem value="sse">SSE</SelectItem>
                  <SelectItem value="streamable_http">
                    Streamable HTTP
                  </SelectItem>
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
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, url: e.target.value }))
              }
              placeholder="https://mcp.example.com"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description (optional)</Label>
            <Textarea
              id="description"
              value={formData.description || ""}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  description: e.target.value,
                }))
              }
              placeholder="What tools does this server provide?"
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="auth_type">Authentication</Label>
              <Select
                value={formData.auth_type}
                onValueChange={(v) =>
                  setFormData((prev) => ({
                    ...prev,
                    auth_type: v as MCPAuthType,
                  }))
                }
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
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      auth_header_name: e.target.value,
                    }))
                  }
                  placeholder={
                    formData.auth_type === "bearer"
                      ? "Authorization"
                      : "X-API-Key"
                  }
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
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    auth_secret: e.target.value,
                  }))
                }
                placeholder={
                  formData.auth_type === "bearer"
                    ? "Enter bearer token"
                    : "Enter API key"
                }
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
              onCheckedChange={(checked) =>
                setFormData((prev) => ({ ...prev, tool_prefix: checked }))
              }
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={resetForm}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={
              !formData.name || !formData.url || createMutation.isPending
            }
          >
            {createMutation.isPending && (
              <Loader2 className="mr-2 size-4 animate-spin" />
            )}
            Add Server
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface EditServerDialogProps {
  server: MCPServer;
  scope: Scope;
}

function EditServerDialog({ server, scope }: EditServerDialogProps) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState<MCPServerUpdate>({
    name: server.name,
    description: server.description,
    url: server.url,
    transport: server.transport,
    auth_type: server.auth_type,
    auth_header_name: server.auth_header_name,
    auth_secret: undefined,
    tool_prefix: server.tool_prefix,
  });

  const updateMutation = useMutation({
    mutationFn: (data: MCPServerUpdate) => {
      if (scope.type === "org") {
        return mcpServersApi.updateOrgServer(scope.orgId, server.id, data);
      } else if (scope.type === "team") {
        return mcpServersApi.updateTeamServer(
          scope.orgId,
          scope.teamId,
          server.id,
          data,
        );
      } else {
        return mcpServersApi.updateUserServer(server.id, data);
      }
    },
    onSuccess: () => {
      const queryKey =
        scope.type === "org"
          ? ["mcp-servers", "org", scope.orgId]
          : scope.type === "team"
            ? ["mcp-servers", "team", scope.orgId, scope.teamId]
            : ["mcp-servers", "user", scope.orgId, scope.teamId];
      queryClient.invalidateQueries({ queryKey });
      setOpen(false);
      setError(null);
    },
    onError: (err: unknown) => {
      setError(getApiErrorMessage(err, "Failed to update server"));
    },
  });

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
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, name: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-transport">Transport</Label>
              <Select
                value={formData.transport || server.transport}
                onValueChange={(v) =>
                  setFormData((prev) => ({
                    ...prev,
                    transport: v as MCPTransport,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="http">HTTP</SelectItem>
                  <SelectItem value="sse">SSE</SelectItem>
                  <SelectItem value="streamable_http">
                    Streamable HTTP
                  </SelectItem>
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
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, url: e.target.value }))
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-description">Description</Label>
            <Textarea
              id="edit-description"
              value={formData.description || ""}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  description: e.target.value,
                }))
              }
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-auth_type">Authentication</Label>
              <Select
                value={formData.auth_type || server.auth_type}
                onValueChange={(v) =>
                  setFormData((prev) => ({
                    ...prev,
                    auth_type: v as MCPAuthType,
                  }))
                }
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
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      auth_header_name: e.target.value,
                    }))
                  }
                  placeholder={
                    (formData.auth_type || server.auth_type) === "bearer"
                      ? "Authorization"
                      : "X-API-Key"
                  }
                />
              </div>
            )}
          </div>

          {(formData.auth_type || server.auth_type) !== "none" && (
            <div className="space-y-2">
              <Label htmlFor="edit-auth_secret">
                {(formData.auth_type || server.auth_type) === "bearer"
                  ? "Bearer Token"
                  : "API Key"}
              </Label>
              <Input
                id="edit-auth_secret"
                type="password"
                value={formData.auth_secret || ""}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    auth_secret: e.target.value,
                  }))
                }
                placeholder={
                  server.has_auth_secret
                    ? "Leave empty to keep current"
                    : "Enter new secret"
                }
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
              onCheckedChange={(checked) =>
                setFormData((prev) => ({ ...prev, tool_prefix: checked }))
              }
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
            {updateMutation.isPending && (
              <Loader2 className="mr-2 size-4 animate-spin" />
            )}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface TestConnectionDialogProps {
  server: MCPServer;
  scope: Scope;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function TestConnectionDialog({
  server,
  scope,
  open,
  onOpenChange,
}: TestConnectionDialogProps) {
  const [result, setResult] = useState<MCPTestResult | null>(null);

  const testMutation = useMutation({
    mutationFn: () => {
      if (scope.type === "org") {
        return mcpServersApi.testOrgServer(scope.orgId, server.id);
      } else if (scope.type === "team") {
        return mcpServersApi.testTeamServer(
          scope.orgId,
          scope.teamId,
          server.id,
        );
      } else {
        return mcpServersApi.testUserServer(server.id);
      }
    },
    onSuccess: (data) => {
      setResult(data);
    },
    onError: (err: unknown) => {
      setResult({
        success: false,
        message: "Failed to test connection",
        tools: [],
        tool_count: 0,
        connection_time_ms: null,
        error_details: getApiErrorMessage(err, "Unknown error"),
      });
    },
  });

  // Auto-test when dialog opens
  const hasInitiated = useRef(false);
  useEffect(() => {
    if (open && !hasInitiated.current) {
      hasInitiated.current = true;
      setResult(null);
      testMutation.mutate();
    }
    if (!open) {
      hasInitiated.current = false;
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Server className="size-5" />
            Test Connection: {server.name}
          </DialogTitle>
          <DialogDescription className="truncate">
            Testing connection to {server.url}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 overflow-y-auto min-h-0 flex-1">
          {testMutation.isPending ? (
            <div className="flex flex-col items-center justify-center py-8 gap-3">
              <Loader2 className="size-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Connecting to server...
              </p>
            </div>
          ) : result ? (
            <div className="space-y-4">
              {/* Status Banner */}
              <div
                className={`flex items-center gap-3 p-4 rounded-lg ${
                  result.success
                    ? "bg-green-500/10 border border-green-500/20"
                    : "bg-destructive/10 border border-destructive/20"
                }`}
              >
                {result.success ? (
                  <CheckCircle2 className="size-6 text-green-600 dark:text-green-400 shrink-0" />
                ) : (
                  <XCircle className="size-6 text-destructive shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <p
                    className={`font-medium ${result.success ? "text-green-700 dark:text-green-300" : "text-destructive"}`}
                  >
                    {result.success
                      ? "Connection Successful"
                      : "Connection Failed"}
                  </p>
                  <p className="text-sm text-muted-foreground truncate">
                    {result.message}
                  </p>
                </div>
              </div>

              {/* Connection Details */}
              <div className="space-y-3">
                {result.connection_time_ms !== null && (
                  <div className="flex items-center gap-2 text-sm">
                    <Clock className="size-4 text-muted-foreground" />
                    <span className="text-muted-foreground">
                      Response time:
                    </span>
                    <span className="font-mono">
                      {result.connection_time_ms.toFixed(0)}ms
                    </span>
                  </div>
                )}

                {result.success && result.tool_count > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      <Wrench className="size-4 text-muted-foreground" />
                      <span className="text-muted-foreground">
                        Discovered tools:
                      </span>
                      <Badge variant="secondary">{result.tool_count}</Badge>
                    </div>
                    <div className="max-h-48 overflow-y-auto overflow-x-hidden rounded-lg border bg-muted/30 p-2">
                      <ul className="space-y-1.5">
                        {result.tools.map((tool) => (
                          <li
                            key={tool.name}
                            className="text-sm overflow-hidden"
                          >
                            <div className="flex items-start gap-2 min-w-0">
                              <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium shrink-0 max-w-[180px] truncate">
                                {tool.name}
                              </code>
                              {tool.description && (
                                <span className="text-muted-foreground text-xs truncate min-w-0 flex-1">
                                  {tool.description}
                                </span>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}

                {result.success && result.tool_count === 0 && (
                  <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="size-4" />
                    <span>Server connected but no tools were discovered.</span>
                  </div>
                )}

                {result.error_details && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-destructive">
                      Error Details:
                    </p>
                    <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3">
                      <pre className="text-xs text-destructive whitespace-pre-wrap break-all font-mono">
                        {result.error_details}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>

        <DialogFooter className="shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button
            onClick={() => {
              setResult(null);
              testMutation.mutate();
            }}
            disabled={testMutation.isPending}
          >
            {testMutation.isPending ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Testing...
              </>
            ) : (
              <>
                <PlayCircle className="mr-2 size-4" />
                Test Again
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export { AddServerDialog, EditServerDialog, TestConnectionDialog };
