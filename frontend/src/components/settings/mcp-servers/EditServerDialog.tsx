/**
 * Dialog for editing an existing MCP server.
 */

import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
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
  name: z.string().min(1, "prompts_name_required"),
  description: z.string().optional(),
  url: z.string().url("error_invalid_url"),
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
  const { t } = useTranslation();
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
      setError(getApiErrorMessage(err, t("mcp_failed_update")));
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
          {t("mcp_edit")}
        </DropdownMenuItem>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("mcp_edit_server")}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-name">{t("com_name")}</Label>
                <Input id="edit-name" {...form.register("name")} />
                {form.formState.errors.name?.message && (
                  <p className="text-sm text-destructive">
                    {t(
                      form.formState.errors.name
                        .message as "prompts_name_required",
                    )}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-transport">{t("mcp_transport")}</Label>
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
                    <SelectItem value="http">
                      {t("mcp_transport_http")}
                    </SelectItem>
                    <SelectItem value="sse">
                      {t("mcp_transport_sse")}
                    </SelectItem>
                    <SelectItem value="streamable_http">
                      {t("mcp_transport_streamable")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-url">{t("mcp_url")}</Label>
              <Input id="edit-url" type="url" {...form.register("url")} />
              {form.formState.errors.url?.message && (
                <p className="text-sm text-destructive">
                  {t(form.formState.errors.url.message as "error_invalid_url")}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-description">{t("com_description")}</Label>
              <Textarea
                id="edit-description"
                {...form.register("description")}
                rows={2}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-auth_type">
                  {t("mcp_authentication")}
                </Label>
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
                    <SelectItem value="none">{t("mcp_auth_none")}</SelectItem>
                    <SelectItem value="bearer">
                      {t("mcp_auth_bearer")}
                    </SelectItem>
                    <SelectItem value="api_key">
                      {t("mcp_auth_api_key")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {authType !== "none" && (
                <div className="space-y-2">
                  <Label htmlFor="edit-auth_header_name">
                    {t("mcp_header_name")}
                  </Label>
                  <Input
                    id="edit-auth_header_name"
                    {...form.register("auth_header_name")}
                    placeholder={
                      authType === "bearer"
                        ? t("mcp_auth_header_authorization")
                        : t("mcp_auth_header_api_key")
                    }
                  />
                </div>
              )}
            </div>

            {authType !== "none" && (
              <div className="space-y-2">
                <Label htmlFor="edit-auth_secret">
                  {authType === "bearer"
                    ? t("mcp_auth_bearer")
                    : t("mcp_auth_api_key")}
                </Label>
                <Input
                  id="edit-auth_secret"
                  type="password"
                  {...form.register("auth_secret")}
                  placeholder={
                    server.has_auth_secret
                      ? t("mcp_secret_keep_current")
                      : t("mcp_secret_enter_new")
                  }
                />
                <p className="text-xs text-muted-foreground">
                  {server.has_auth_secret
                    ? t("mcp_secret_configured")
                    : t("mcp_secret_not_configured")}
                </p>
              </div>
            )}

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="edit-tool_prefix">
                  {t("mcp_prefix_tools")}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {t("mcp_prefix_tools_desc")}
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
              {t("com_cancel")}
            </Button>
            <Button type="submit" disabled={updateMutation.isPending}>
              {updateMutation.isPending && (
                <Loader2 className="mr-2 size-4 animate-spin" />
              )}
              {t("com_save_changes")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
