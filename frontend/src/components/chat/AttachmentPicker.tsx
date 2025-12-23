/**
 * Attachment picker for chat - allows inline attachments or RAG uploads.
 *
 * Follows the PromptPicker/ToolPicker popover pattern with two upload options:
 * 1. Use in this conversation - inline for immediate analysis
 * 2. Add to Knowledge Base - upload to RAG for persistent storage
 */

import * as React from "react";
import { useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Paperclip, Database, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ragSettingsApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/** Inline attachment types (images + documents for Claude) */
const INLINE_ACCEPT =
  "image/jpeg,image/png,image/gif,image/webp,application/pdf,text/plain,text/markdown,text/csv";

/** Get accept string for RAG uploads based on allowed file types */
function getRAGAccept(allowedTypes: string[]): string {
  const mimeMap: Record<string, string> = {
    // Documents
    pdf: "application/pdf",
    txt: "text/plain",
    md: "text/markdown",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    csv: "text/csv",
    json: "application/json",
    yaml: "application/x-yaml",
    yml: "application/x-yaml",
    xml: "application/xml",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    // Images
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
    // Code
    py: "text/x-python",
    js: "text/javascript",
    ts: "text/typescript",
    jsx: "text/jsx",
    tsx: "text/tsx",
    java: "text/x-java",
    cpp: "text/x-c++src",
    c: "text/x-csrc",
    h: "text/x-chdr",
    go: "text/x-go",
    rs: "text/x-rust",
    rb: "text/x-ruby",
    php: "text/x-php",
    sh: "text/x-shellscript",
    sql: "text/x-sql",
    html: "text/html",
    htm: "text/html",
    css: "text/css",
  };

  return allowedTypes
    .map((ext) => mimeMap[ext] || `application/${ext}`)
    .join(",");
}

interface AttachmentPickerProps {
  organizationId?: string;
  teamId?: string;
  onInlineSelect: (files: FileList) => void;
  onRAGSelect: (files: FileList) => void;
  disabled?: boolean;
}

export function AttachmentPicker({
  organizationId,
  teamId,
  onInlineSelect,
  onRAGSelect,
  disabled = false,
}: AttachmentPickerProps) {
  const [open, setOpen] = React.useState(false);
  const inlineInputRef = useRef<HTMLInputElement>(null);
  const ragInputRef = useRef<HTMLInputElement>(null);

  // Fetch RAG settings to determine if RAG upload is available
  const { data: ragSettings, isLoading: isLoadingRAG } = useQuery({
    queryKey: ["effective-rag-settings", organizationId, teamId],
    queryFn: () => ragSettingsApi.getEffectiveSettings(organizationId, teamId),
    enabled: open && !!organizationId,
  });

  const ragEnabled = ragSettings?.rag_enabled ?? false;
  const allowedFileTypes = ragSettings?.allowed_file_types ?? [];

  const handleInlineClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      // Close popover first, then trigger file input after a small delay
      // to ensure the popover doesn't interfere with the file dialog
      setOpen(false);
      setTimeout(() => {
        inlineInputRef.current?.click();
      }, 100);
    },
    [],
  );

  const handleRAGClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      // Close popover first, then trigger file input after a small delay
      setOpen(false);
      setTimeout(() => {
        ragInputRef.current?.click();
      }, 100);
    },
    [],
  );

  const handleInlineChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      console.log("[AttachmentPicker] handleInlineChange called", files?.length);
      if (files && files.length > 0) {
        onInlineSelect(files);
      }
      e.target.value = "";
    },
    [onInlineSelect],
  );

  const handleRAGChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      console.log("[AttachmentPicker] handleRAGChange called", files?.length);
      if (files && files.length > 0) {
        onRAGSelect(files);
      }
      e.target.value = "";
    },
    [onRAGSelect],
  );

  // Generate unique IDs for file inputs (must be before early return)
  const inlineInputId = React.useId();
  const ragInputId = React.useId();

  // Don't render if no organization context
  if (!organizationId) return null;

  return (
    <>
      {/* Hidden file inputs - outside popover so they persist when popover closes */}
      <input
        id={inlineInputId}
        ref={inlineInputRef}
        type="file"
        accept={INLINE_ACCEPT}
        multiple
        onChange={handleInlineChange}
        className="hidden"
        aria-label="Select files for inline use"
      />
      <input
        id={ragInputId}
        ref={ragInputRef}
        type="file"
        accept={getRAGAccept(allowedFileTypes)}
        multiple
        onChange={handleRAGChange}
        className="hidden"
        aria-label="Select files for knowledge base"
      />

      <Popover open={open} onOpenChange={setOpen}>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                disabled={disabled}
                className="size-8 text-muted-foreground hover:text-foreground"
                aria-label="Attach files"
              >
                <Plus className="size-4" />
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p>Attach files</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <PopoverContent
        className="w-[360px] max-w-[calc(100vw-2rem)] p-0"
        align="start"
        side="top"
        sideOffset={8}
      >
        <div className="flex flex-col">
          {/* Header */}
          <div className="border-b px-4 py-3">
            <h4 className="text-sm font-medium">Attach Files</h4>
            <p className="text-xs text-muted-foreground">
              Choose how to use your files
            </p>
          </div>

          {/* Options */}
          <div className="p-2">
            {/* Inline attachment option */}
            <button
              type="button"
              onClick={handleInlineClick}
              className={cn(
                "w-full rounded-lg p-3 text-left",
                "hover:bg-accent focus:bg-accent focus:outline-none",
                "transition-colors",
              )}
            >
              <div className="flex items-start gap-3">
                <div className="rounded-md bg-primary/10 p-2">
                  <Paperclip className="size-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">
                    Use in this conversation
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Attach for immediate analysis (images, PDFs)
                  </p>
                </div>
              </div>
            </button>

            {/* RAG upload option */}
            {isLoadingRAG ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              </div>
            ) : ragEnabled ? (
              <button
                type="button"
                onClick={handleRAGClick}
                className={cn(
                  "w-full rounded-lg p-3 text-left mt-1",
                  "hover:bg-accent focus:bg-accent focus:outline-none",
                  "transition-colors",
                )}
              >
                <div className="flex items-start gap-3">
                  <div className="rounded-md bg-blue-500/10 p-2">
                    <Database className="size-4 text-blue-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">Add to Knowledge Base</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Store for retrieval across all conversations
                    </p>
                  </div>
                </div>
              </button>
            ) : (
              <div className="rounded-lg p-3 mt-1 bg-muted/50">
                <div className="flex items-start gap-3">
                  <div className="rounded-md bg-muted p-2">
                    <Database className="size-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-muted-foreground">
                      Knowledge Base
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      RAG is disabled for this workspace
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer hint */}
          <div className="border-t px-4 py-2">
            <p className="text-xs text-muted-foreground text-center">
              Drag & drop files anywhere in the chat
            </p>
          </div>
        </div>
      </PopoverContent>
    </Popover>
    </>
  );
}
