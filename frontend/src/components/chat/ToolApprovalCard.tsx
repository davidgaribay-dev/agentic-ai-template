/**
 * Tool Approval Card component for Human-in-the-Loop (HITL) MCP tool approval.
 *
 * Displays inline in the chat when an MCP tool call requires user approval.
 * Similar to GitHub Copilot / Claude Code tool approval UX.
 */

import * as React from "react"
import { memo, useState } from "react"
import { Play, X, ChevronDown, ChevronRight, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

export interface ToolApprovalData {
  tool_name: string
  tool_args: Record<string, unknown>
  tool_call_id: string | null
  tool_description: string
}

interface ToolApprovalCardProps {
  data: ToolApprovalData
  onApprove: () => void
  onReject: () => void
  isLoading?: boolean
  className?: string
}

/**
 * Format tool arguments for display.
 * Handles nested objects and arrays nicely.
 */
function formatArgValue(value: unknown): string {
  if (value === null) return "null"
  if (value === undefined) return "undefined"
  if (typeof value === "string") return value
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]"
    return JSON.stringify(value, null, 2)
  }
  if (typeof value === "object") {
    return JSON.stringify(value, null, 2)
  }
  return String(value)
}

/**
 * Tool arguments viewer with expandable sections for complex values.
 */
const ToolArgsViewer = memo(function ToolArgsViewer({
  args,
}: {
  args: Record<string, unknown>
}) {
  const entries = Object.entries(args)

  if (entries.length === 0) {
    return (
      <span className="text-muted-foreground italic">No arguments</span>
    )
  }

  return (
    <div className="space-y-1.5">
      {entries.map(([key, value]) => {
        const formattedValue = formatArgValue(value)
        const isMultiline = formattedValue.includes("\n")

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
        )
      })}
    </div>
  )
})

export const ToolApprovalCard = memo(function ToolApprovalCard({
  data,
  onApprove,
  onReject,
  isLoading = false,
  className,
}: ToolApprovalCardProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const hasArgs = Object.keys(data.tool_args).length > 0

  return (
    <div
      className={cn(
        "w-full rounded-lg border border-border bg-card overflow-hidden",
        className
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
            onClick={onReject}
            disabled={isLoading}
            className="text-muted-foreground hover:text-destructive"
          >
            <X className="size-3.5" />
            <span className="hidden sm:inline">Cancel</span>
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={onApprove}
            disabled={isLoading}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            {isLoading ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Play className="size-3.5" />
            )}
            <span className="hidden sm:inline">Continue</span>
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
              {isExpanded ? "Hide" : "Show"} arguments ({Object.keys(data.tool_args).length})
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
  )
})
