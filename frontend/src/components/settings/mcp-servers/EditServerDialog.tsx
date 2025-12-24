/**
 * Dialog for editing an existing MCP server.
 */

import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Pencil, Loader2 } from "lucide-react";

import {
  mcpServersApi,
  type MCPServer,
  type MCPServerUpdate,
  type MCPTransport,
  type MCPAuthType,
  getApiErrorMessage,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import type { Scope } from "./types";
import { getQueryKeyForScope } from "./hooks";

const editServerSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  url: z.string().url("Must be a valid URL"),
  transport: z.enum(["http", "sse", "streamable_http"]),
  auth_type: z.enum(["none", "bearer", "api_key"]),
  auth_header_name: z.string().optional(),
  auth_secret: z.string().optional(),
  tool_prefix: z.boolean(),
});

type EditServerFormData = z.infer<typeof editServerSchema>;

interface EditServerDialogProps {
  server: MCPServer;
  scope: Scope;
}

export function EditServerDialog({ server, scope }: EditServerDialogProps) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const form = useForm<EditServerFormData>({
    resolver: zodResolver(editServerSchema),
    defaultValues: {
      name: server.name,
      description: server.description || "",
      url: server.url,
      transport: server.transport,
      auth_type: server.auth_type,
      auth_header_name: server.auth_header_name || "",
      auth_secret: "",
      tool_prefix: server.tool_prefix,
    },
  });

  // Reset form when server changes
  useEffect(() => {
    form.reset({
      name: server.name,
      description: server.description || "",
      url: server.url,
      transport: server.transport,
      auth_type: server.auth_type,
      auth_header_name: server.auth_header_name || "",
      auth_secret: "",
      tool_prefix: server.tool_prefix,
    });
  }, [server, form]);

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
      queryClient.invalidateQueries({ queryKey: getQueryKeyForScope(scope) });
      setOpen(false);
      setError(null);
    },
    onError: (err: unknown) => {
      setError(getApiErrorMessage(err, "Failed to update server"));
    },
  });

  const handleSubmit = form.handleSubmit((data) => {
    setError(null);
    // Only include auth_secret if it's not empty (to avoid overwriting existing secret)
    const updateData: MCPServerUpdate = {
      ...data,
      auth_secret: data.auth_secret || undefined,
    };
    updateMutation.mutate(updateData);
  });

  const authType = form.watch("auth_type");

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

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-name">Name</Label>
                <Input id="edit-name" {...form.register("name")} />
                {form.formState.errors.name && (
                  <p className="text-sm text-destructive">
                    {form.formState.errors.name.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-transport">Transport</Label>
                <Select
                  value={form.watch("transport")}
                  onValueChange={(v) =>
                    form.setValue("transport", v as MCPTransport)
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
              <Input id="edit-url" type="url" {...form.register("url")} />
              {form.formState.errors.url && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.url.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-description">Description</Label>
              <Textarea
                id="edit-description"
                {...form.register("description")}
                rows={2}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-auth_type">Authentication</Label>
                <Select
                  value={authType}
                  onValueChange={(v) =>
                    form.setValue("auth_type", v as MCPAuthType)
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
              {authType !== "none" && (
                <div className="space-y-2">
                  <Label htmlFor="edit-auth_header_name">Header Name</Label>
                  <Input
                    id="edit-auth_header_name"
                    {...form.register("auth_header_name")}
                    placeholder={
                      authType === "bearer" ? "Authorization" : "X-API-Key"
                    }
                  />
                </div>
              )}
            </div>

            {authType !== "none" && (
              <div className="space-y-2">
                <Label htmlFor="edit-auth_secret">
                  {authType === "bearer" ? "Bearer Token" : "API Key"}
                </Label>
                <Input
                  id="edit-auth_secret"
                  type="password"
                  {...form.register("auth_secret")}
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
                checked={form.watch("tool_prefix")}
                onCheckedChange={(checked) =>
                  form.setValue("tool_prefix", checked)
                }
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={updateMutation.isPending}>
              {updateMutation.isPending && (
                <Loader2 className="mr-2 size-4 animate-spin" />
              )}
              Save Changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
