/**
 * Main MCP servers list component with DataTable.
 */

import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Server, Loader2 } from "lucide-react";

import { mcpServersApi, type MCPServer } from "@/lib/api";
import { DataTable } from "@/components/ui/data-table";
import type { Scope } from "./types";
import { getQueryKeyForScope } from "./hooks";
import {
  getScopeBadge,
  getTransportBadge,
  getAuthBadge,
  getStatusBadge,
} from "./badges";
import { AddServerDialog } from "./AddServerDialog";
import { ServerActionsCell } from "./ServerActionsCell";

interface MCPServersListProps {
  scope: Scope;
  allowCreate?: boolean;
}

export function MCPServersList({
  scope,
  allowCreate = true,
}: MCPServersListProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const queryKey = getQueryKeyForScope(scope);

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
        header: t("mcp_header_server"),
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
        header: t("mcp_header_transport"),
        cell: ({ row }) => getTransportBadge(row.original.transport),
      },
      {
        accessorKey: "auth_type",
        header: t("mcp_header_auth"),
        cell: ({ row }) =>
          getAuthBadge(
            row.original.auth_type,
            row.original.has_auth_secret,
          ) ?? (
            <span className="text-xs text-muted-foreground">
              {t("mcp_auth_none_label")}
            </span>
          ),
      },
      {
        accessorKey: "enabled",
        header: t("mcp_header_status"),
        cell: ({ row }) => getStatusBadge(row.original.enabled),
      },
      {
        id: "actions",
        header: () => (
          <div className="text-right">{t("mcp_header_actions")}</div>
        ),
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
    [scope, toggleMutation, deleteMutation, t],
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
            {t(
              servers.length === 1
                ? "mcp_server_count"
                : "mcp_server_count_plural",
              { count: servers.length },
            )}
          </span>
        </div>
        {allowCreate && <AddServerDialog scope={scope} />}
      </div>

      {servers.length === 0 ? (
        <div className="text-center py-8 border rounded-lg">
          <Server className="size-10 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-sm text-muted-foreground">{t("mcp_no_servers")}</p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            {t("mcp_add_server_hint")}
          </p>
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={servers}
          searchKey="name"
          searchPlaceholder={t("mcp_search_servers")}
        />
      )}
    </div>
  );
}
