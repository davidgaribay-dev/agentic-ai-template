/**
 * Dialog for testing MCP server connections.
 */

import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useMutation } from "@tanstack/react-query";
import {
  Server,
  Loader2,
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
  type MCPTestResult,
  getApiErrorMessage,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Scope } from "./types";

interface TestConnectionDialogProps {
  server: MCPServer;
  scope: Scope;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TestConnectionDialog({
  server,
  scope,
  open,
  onOpenChange,
}: TestConnectionDialogProps) {
  const { t } = useTranslation();
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
        message: t("mcp_connection_failed"),
        tools: [],
        tool_count: 0,
        connection_time_ms: null,
        error_details: getApiErrorMessage(err, t("mcp_error_unknown")),
      });
    },
  });

  // Trigger test when dialog opens
  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      onOpenChange(isOpen);
      if (isOpen) {
        setResult(null);
        testMutation.mutate();
      }
    },
    [onOpenChange, testMutation],
  );

  const handleTestAgain = useCallback(() => {
    setResult(null);
    testMutation.mutate();
  }, [testMutation]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Server className="size-5" />
            {t("mcp_test_connection_title", { name: server.name })}
          </DialogTitle>
          <DialogDescription className="truncate">
            {t("mcp_test_connection_desc", { url: server.url })}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 overflow-y-auto min-h-0 flex-1">
          {testMutation.isPending ? (
            <div className="flex flex-col items-center justify-center py-8 gap-3">
              <Loader2 className="size-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {t("mcp_connecting")}
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
                      ? t("mcp_connection_success")
                      : t("mcp_connection_failed")}
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
                      {t("mcp_response_time")}
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
                        {t("mcp_discovered_tools")}
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
                    <span>{t("mcp_no_tools_discovered")}</span>
                  </div>
                )}

                {result.error_details && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-destructive">
                      {t("mcp_error_details")}
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
            {t("com_close")}
          </Button>
          <Button onClick={handleTestAgain} disabled={testMutation.isPending}>
            {testMutation.isPending ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                {t("mcp_testing")}
              </>
            ) : (
              <>
                <PlayCircle className="mr-2 size-4" />
                {t("mcp_test_again")}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
