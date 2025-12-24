/**
 * Tool Approval Card component for Human-in-the-Loop (HITL) MCP tool approval.
 *
 * Displays inline in the chat when an MCP tool call requires user approval.
 * Similar to GitHub Copilot / Claude Code tool approval UX.
 *
 * States:
 * - pending: Waiting for user decision (shows approve/reject buttons)
 * - approved: Brief visual feedback before continuing (green checkmark)
 * - rejected: Brief visual feedback, then transforms to rejection message with undo
 */

import { memo, useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  Play,
  X,
  ChevronDown,
  ChevronRight,
  Loader2,
  Check,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export interface ToolApprovalData {
  tool_name: string;
  tool_args: Record<string, unknown>;
  tool_call_id: string | null;
  tool_description: string;
}

export type ApprovalState = "pending" | "approved" | "rejected";

interface ToolApprovalCardProps {
  data: ToolApprovalData;
  onApprove: () => void;
  onReject: () => void;
  isLoading?: boolean;
  className?: string;
}

/**
 * Format tool arguments for display.
 * Handles nested objects and arrays nicely.
 */
function formatArgValue(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    return JSON.stringify(value, null, 2);
  }
  if (typeof value === "object") {
    return JSON.stringify(value, null, 2);
  }
  return String(value);
}

/**
 * Tool arguments viewer with expandable sections for complex values.
 */
const ToolArgsViewer = memo(function ToolArgsViewer({
  args,
}: {
  args: Record<string, unknown>;
}) {
  const { t } = useTranslation();
  const entries = Object.entries(args);

  if (entries.length === 0) {
    return (
      <span className="text-muted-foreground italic">{t("tool_no_args")}</span>
    );
  }

  return (
    <div className="space-y-1.5">
      {entries.map(([key, value]) => {
        const formattedValue = formatArgValue(value);
        const isMultiline = formattedValue.includes("\n");

        return (
          <div key={key} className="text-xs">
            <span className="font-medium text-foreground">{key}:</span>{" "}
            {isMultiline ? (
              <pre className="mt-1 rounded bg-muted/50 p-2 text-muted-foreground overflow-x-auto">
                {formattedValue}
              </pre>
            ) : (
              <span className="text-muted-foreground font-mono">
                {formattedValue.length > 100
                  ? `${formattedValue.slice(0, 100)}...`
                  : formattedValue}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
});

export const ToolApprovalCard = memo(function ToolApprovalCard({
  data,
  onApprove,
  onReject,
  isLoading = false,
  className,
}: ToolApprovalCardProps) {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);
  const [approvalState, setApprovalState] = useState<ApprovalState>("pending");
  const hasArgs = Object.keys(data.tool_args).length > 0;

  const handleApprove = useCallback(() => {
    setApprovalState("approved");
    // Brief visual feedback before calling handler
    setTimeout(() => {
      onApprove();
    }, 300);
  }, [onApprove]);

  const handleReject = useCallback(() => {
    setApprovalState("rejected");
    // Brief visual feedback before calling handler
    setTimeout(() => {
      onReject();
    }, 300);
  }, [onReject]);

  // Visual feedback for approved state (brief green checkmark)
  if (approvalState === "approved") {
    return (
      <div
        className={cn(
          "w-full rounded-lg border border-green-500/50 bg-green-500/10 overflow-hidden transition-all duration-300",
          className,
        )}
      >
        <div className="flex items-center gap-2 px-3 py-2.5">
          <div className="flex size-6 items-center justify-center rounded bg-green-500/20 text-green-500">
            <Check className="size-3.5" />
          </div>
          <div className="text-sm text-green-600 dark:text-green-400">
            {t("tool_approved")}: {data.tool_name}
          </div>
        </div>
      </div>
    );
  }

  // Visual feedback for rejected state (brief red X)
  if (approvalState === "rejected") {
    return (
      <div
        className={cn(
          "w-full rounded-lg border border-destructive/50 bg-destructive/10 overflow-hidden transition-all duration-300",
          className,
        )}
      >
        <div className="flex items-center gap-2 px-3 py-2.5">
          <div className="flex size-6 items-center justify-center rounded bg-destructive/20 text-destructive">
            <X className="size-3.5" />
          </div>
          <div className="text-sm text-destructive">
            {t("tool_rejected")}: {data.tool_name}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "w-full rounded-lg border border-border bg-card overflow-hidden",
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-3 py-2.5 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex size-6 items-center justify-center rounded bg-amber-500/10 text-amber-500">
            <Play className="size-3" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium text-foreground truncate">
              {data.tool_name}
            </div>
            {data.tool_description && (
              <div className="text-xs text-muted-foreground truncate">
                {data.tool_description}
              </div>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1.5 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReject}
            disabled={isLoading}
            className="text-muted-foreground hover:text-destructive"
          >
            <X className="size-3.5" />
            <span className="hidden sm:inline">{t("com_cancel")}</span>
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={handleApprove}
            disabled={isLoading}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            {isLoading ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Play className="size-3.5" />
            )}
            <span className="hidden sm:inline">{t("com_continue")}</span>
          </Button>
        </div>
      </div>

      {/* Arguments section (collapsible) */}
      {hasArgs && (
        <div>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex w-full items-center gap-1.5 px-3 py-2 text-xs text-muted-foreground hover:bg-muted/30 transition-colors"
          >
            {isExpanded ? (
              <ChevronDown className="size-3" />
            ) : (
              <ChevronRight className="size-3" />
            )}
            <span>
              {isExpanded ? t("tool_hide_args") : t("tool_show_args")} (
              {Object.keys(data.tool_args).length})
            </span>
          </button>

          {isExpanded && (
            <div className="px-3 pb-3 pt-1 border-t border-border/50">
              <ToolArgsViewer args={data.tool_args} />
            </div>
          )}
        </div>
      )}
    </div>
  );
});

/**
 * Rejection message shown in chat history after a tool call is rejected.
 * Includes an "Undo" button that allows re-approval within a time window.
 */
interface ToolRejectionMessageProps {
  toolName: string;
  onUndo?: () => void;
  undoTimeoutMs?: number;
  className?: string;
}

export const ToolRejectionMessage = memo(function ToolRejectionMessage({
  toolName,
  onUndo,
  undoTimeoutMs = 30000,
  className,
}: ToolRejectionMessageProps) {
  const { t } = useTranslation();
  const [canUndo, setCanUndo] = useState(!!onUndo);

  useEffect(() => {
    if (!onUndo) return;

    const timeout = setTimeout(() => {
      setCanUndo(false);
    }, undoTimeoutMs);

    return () => clearTimeout(timeout);
  }, [onUndo, undoTimeoutMs]);

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50 text-sm text-muted-foreground",
        className,
      )}
    >
      <X className="size-4 text-destructive shrink-0" />
      <span>
        {t("tool_call_rejected")}:{" "}
        <code className="text-xs bg-muted px-1 py-0.5 rounded">{toolName}</code>
      </span>
      {canUndo && onUndo && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onUndo}
          className="ml-auto h-6 px-2 text-xs"
        >
          <RotateCcw className="size-3 mr-1" />
          {t("com_undo")}
        </Button>
      )}
    </div>
  );
});
