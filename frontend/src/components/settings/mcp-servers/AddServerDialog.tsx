/**
 * Dialog for adding a new MCP server.
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
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
  name: z.string().min(1, "prompts_name_required"),
  description: z.string().optional(),
  url: z.string().url("error_invalid_url"),
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
  const { t } = useTranslation();
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
      setError(getApiErrorMessage(err, t("mcp_failed_create")));
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
          {t("mcp_add_server")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("mcp_add_server_title")}</DialogTitle>
          <DialogDescription>{t("mcp_add_server_desc")}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">{t("com_name")}</Label>
                <Input
                  id="name"
                  {...form.register("name")}
                  placeholder={t("mcp_server_name_placeholder")}
                />
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
                <Label htmlFor="transport">{t("mcp_transport")}</Label>
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
              <Label htmlFor="url">{t("mcp_url")}</Label>
              <Input
                id="url"
                type="url"
                {...form.register("url")}
                placeholder={t("mcp_server_url_placeholder")}
              />
              {form.formState.errors.url?.message && (
                <p className="text-sm text-destructive">
                  {t(form.formState.errors.url.message as "error_invalid_url")}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">
                {t("prompts_description_optional")}
              </Label>
              <Textarea
                id="description"
                {...form.register("description")}
                placeholder={t("mcp_server_description_placeholder")}
                rows={2}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="auth_type">{t("mcp_authentication")}</Label>
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
                  <Label htmlFor="auth_header_name">
                    {t("mcp_header_name")}
                  </Label>
                  <Input
                    id="auth_header_name"
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
                <Label htmlFor="auth_secret">
                  {authType === "bearer"
                    ? t("mcp_auth_bearer")
                    : t("mcp_auth_api_key")}
                </Label>
                <Input
                  id="auth_secret"
                  type="password"
                  {...form.register("auth_secret")}
                  placeholder={
                    authType === "bearer"
                      ? t("mcp_secret_placeholder_bearer")
                      : t("mcp_secret_placeholder_api_key")
                  }
                />
                <p className="text-xs text-muted-foreground">
                  {t("mcp_secret_stored")}
                </p>
              </div>
            )}

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="tool_prefix">{t("mcp_prefix_tools")}</Label>
                <p className="text-xs text-muted-foreground">
                  {t("mcp_prefix_tools_desc")}
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
              {t("com_cancel")}
            </Button>
            <Button
              type="submit"
              disabled={!form.formState.isValid || createMutation.isPending}
            >
              {createMutation.isPending && (
                <Loader2 className="mr-2 size-4 animate-spin" />
              )}
              {t("mcp_add_server")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
