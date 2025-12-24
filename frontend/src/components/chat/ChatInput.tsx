import * as React from "react";
import { useRef, useCallback, useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { ArrowUp, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { PromptPicker } from "./PromptPicker";
import { ToolPicker } from "./ToolPicker";
import { AttachmentPicker } from "./AttachmentPicker";
import { AttachmentPreviewList } from "./AttachmentPreviewList";
import {
  useMediaUpload,
  mediaToAttachment,
  isAllowedAttachmentType,
} from "@/hooks/useMediaUpload";
import { mediaApi, documentsApi, type DocumentScope } from "@/lib/api";
import type { ChatMediaAttachment } from "@/lib/chat-store";

interface ChatInputProps {
  onSubmit: (
    message: string,
    options?: { media?: ChatMediaAttachment[] },
  ) => void;
  onStop?: () => void;
  placeholder?: string;
  disabled?: boolean;
  isStreaming?: boolean;
  className?: string;
  organizationId?: string;
  teamId?: string;
  /** Enable attachment functionality (images + documents) */
  enableAttachments?: boolean;
}

export function ChatInput({
  onSubmit,
  onStop,
  placeholder,
  disabled = false,
  isStreaming = false,
  className,
  organizationId,
  teamId,
  enableAttachments = true,
}: ChatInputProps) {
  const { t } = useTranslation();
  const [value, setValue] = useState("");
  const [isPending, setIsPending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const defaultPlaceholder = t("chat_placeholder");

  // Media upload hook (for inline attachments - images and documents)
  const mediaUpload = useMediaUpload({
    organizationId: organizationId ?? "",
    teamId,
    allowDocuments: true,
    onError: (error) => {
      console.error("Media upload error:", error);
    },
  });

  // Reset pending state when streaming starts (parent acknowledged the submit)
  useEffect(() => {
    if (isStreaming) {
      setIsPending(false);
    }
  }, [isStreaming]);

  const handlePromptSelect = useCallback((content: string) => {
    setValue((prev) => {
      // If there's existing text, add a space before the template
      if (prev.trim()) {
        return prev + (prev.endsWith(" ") ? "" : " ") + content;
      }
      return content;
    });
    // Focus the textarea after inserting
    setTimeout(() => textareaRef.current?.focus(), 0);
  }, []);

  const handleSubmit = useCallback(async () => {
    const trimmed = value.trim();
    const hasMedia = mediaUpload.pendingUploads.length > 0;

    if ((!trimmed && !hasMedia) || disabled || isPending || isStreaming) return;

    setIsPending(true);

    try {
      let mediaAttachments: ChatMediaAttachment[] | undefined;

      // Upload pending media if any
      if (hasMedia) {
        const uploadedMedia = await mediaUpload.uploadAll();
        if (uploadedMedia.length > 0) {
          mediaAttachments = uploadedMedia.map((media) =>
            mediaToAttachment(media, mediaApi.getContentUrl(media.id)),
          );
        }
      }

      onSubmit(trimmed, { media: mediaAttachments });
      setValue("");
      mediaUpload.clearUploads();
      textareaRef.current?.focus();
    } catch (error) {
      console.error("Submit error:", error);
    }

    // Reset pending state after a short timeout as fallback
    // (in case streaming never starts due to an error)
    setTimeout(() => setIsPending(false), 2000);
  }, [value, disabled, isPending, isStreaming, onSubmit, mediaUpload]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  // Handle inline file selection from AttachmentPicker
  const handleInlineSelect = useCallback(
    (files: FileList) => {
      mediaUpload.addFiles(files);
    },
    [mediaUpload],
  );

  // Handle RAG file selection from AttachmentPicker
  const handleRAGSelect = useCallback(
    async (files: FileList) => {
      if (!organizationId) return;

      const fileArray = Array.from(files);
      const scope: DocumentScope = teamId ? "team" : "org";

      for (const file of fileArray) {
        try {
          console.log(`Uploading ${file.name} to Knowledge Base...`);

          await documentsApi.upload({
            file,
            organization_id: organizationId,
            team_id: teamId,
            scope,
          });

          console.log(
            `${file.name} added to Knowledge Base and will be searchable soon.`,
          );
        } catch (error) {
          const message =
            error instanceof Error ? error.message : t("docs_upload_failed");
          console.error(`Failed to upload ${file.name}: ${message}`);
        }
      }
    },
    [organizationId, teamId, t],
  );

  // Handle paste events for files
  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      if (!enableAttachments || !organizationId) return;

      const items = e.clipboardData.items;
      const files: File[] = [];

      for (const item of items) {
        // Check if it's an allowed attachment type
        if (isAllowedAttachmentType(item.type)) {
          const file = item.getAsFile();
          if (file) {
            files.push(file);
          }
        }
      }

      if (files.length > 0) {
        mediaUpload.addFiles(files);
      }
    },
    [enableAttachments, organizationId, mediaUpload],
  );

  // Handle drag and drop
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      if (!enableAttachments || !organizationId) return;

      e.preventDefault();
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        mediaUpload.addFiles(files);
      }
    },
    [enableAttachments, organizationId, mediaUpload],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const isEmpty = value.trim().length === 0;
  const hasMedia = mediaUpload.pendingUploads.length > 0;
  const canSubmit = !disabled && !isPending && (!isEmpty || hasMedia);

  useEffect(() => {
    if (!disabled && !isStreaming) {
      textareaRef.current?.focus();
    }
  }, [disabled, isStreaming]);

  const showAttachments = enableAttachments && organizationId;

  return (
    <div
      className={cn(
        "flex flex-col rounded-xl bg-chat-input-bg border border-border/50",
        className,
      )}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      {/* Attachment previews */}
      {hasMedia && (
        <div className="px-3 pt-3">
          <AttachmentPreviewList
            uploads={mediaUpload.pendingUploads}
            onRemove={mediaUpload.removeUpload}
            disabled={isPending || isStreaming || mediaUpload.isUploading}
          />
        </div>
      )}

      <Textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        placeholder={placeholder ?? defaultPlaceholder}
        disabled={disabled}
        className="flex-1 border-0 focus-visible:ring-0 focus-visible:border-0 resize-none px-3 pt-3 pb-0 !min-h-0 bg-transparent max-h-[7.5rem] [field-sizing:content]"
        rows={2}
      />
      <div className="flex items-center justify-between px-2 pb-2 pt-1">
        <div className="flex items-center gap-1">
          <PromptPicker
            organizationId={organizationId}
            teamId={teamId}
            onSelect={handlePromptSelect}
            disabled={disabled || isStreaming || isPending}
          />
          <ToolPicker
            organizationId={organizationId}
            teamId={teamId}
            disabled={disabled || isStreaming || isPending}
          />
          {showAttachments && (
            <AttachmentPicker
              organizationId={organizationId}
              teamId={teamId}
              onInlineSelect={handleInlineSelect}
              onRAGSelect={handleRAGSelect}
              disabled={disabled || isStreaming || isPending}
            />
          )}
        </div>
        <div className="flex items-center gap-1">
          {isStreaming ? (
            <Button
              onClick={onStop}
              variant="outline"
              size="icon"
              aria-label={t("chat_stop")}
              className="rounded-full"
            >
              <Square className="size-3 fill-current" />
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              disabled={!canSubmit}
              size="icon"
              aria-label={isPending ? t("chat_sending") : t("chat_send")}
              className="rounded-full"
            >
              <ArrowUp className="size-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
