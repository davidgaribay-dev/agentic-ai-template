/**
 * Dialog for adding a new MCP server.
 */

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Loader2 } from "lucide-react";

import {
  mcpServersApi,
  type MCPServerCreate,
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
  DialogDescription,
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
import type { Scope } from "./types";
import { getQueryKeyForScope } from "./hooks";

const addServerSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  url: z.string().url("Must be a valid URL"),
  transport: z.enum(["http", "sse", "streamable_http"]),
  auth_type: z.enum(["none", "bearer", "api_key"]),
  auth_header_name: z.string().optional(),
  auth_secret: z.string().optional(),
  enabled: z.boolean(),
  tool_prefix: z.boolean(),
});

type AddServerFormData = z.infer<typeof addServerSchema>;

interface AddServerDialogProps {
  scope: Scope;
}

export function AddServerDialog({ scope }: AddServerDialogProps) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const form = useForm<AddServerFormData>({
    resolver: zodResolver(addServerSchema),
    defaultValues: {
      name: "",
      description: "",
      url: "",
      transport: "http",
      auth_type: "none",
      auth_header_name: "",
      auth_secret: "",
      enabled: true,
      tool_prefix: true,
    },
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
      queryClient.invalidateQueries({ queryKey: getQueryKeyForScope(scope) });
      resetForm();
    },
    onError: (err: unknown) => {
      setError(getApiErrorMessage(err, "Failed to create server"));
    },
  });

  const resetForm = () => {
    form.reset();
    setError(null);
    setOpen(false);
  };

  const handleSubmit = form.handleSubmit((data) => {
    setError(null);
    createMutation.mutate(data);
  });

  const authType = form.watch("auth_type");

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

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  {...form.register("name")}
                  placeholder="My MCP Server"
                />
                {form.formState.errors.name && (
                  <p className="text-sm text-destructive">
                    {form.formState.errors.name.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="transport">Transport</Label>
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
              <Label htmlFor="url">URL</Label>
              <Input
                id="url"
                type="url"
                {...form.register("url")}
                placeholder="https://mcp.example.com"
              />
              {form.formState.errors.url && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.url.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea
                id="description"
                {...form.register("description")}
                placeholder="What tools does this server provide?"
                rows={2}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="auth_type">Authentication</Label>
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
                  <Label htmlFor="auth_header_name">Header Name</Label>
                  <Input
                    id="auth_header_name"
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
                <Label htmlFor="auth_secret">
                  {authType === "bearer" ? "Bearer Token" : "API Key"}
                </Label>
                <Input
                  id="auth_secret"
                  type="password"
                  {...form.register("auth_secret")}
                  placeholder={
                    authType === "bearer"
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
                checked={form.watch("tool_prefix")}
                onCheckedChange={(checked) =>
                  form.setValue("tool_prefix", checked)
                }
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={resetForm}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!form.formState.isValid || createMutation.isPending}
            >
              {createMutation.isPending && (
                <Loader2 className="mr-2 size-4 animate-spin" />
              )}
              Add Server
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
