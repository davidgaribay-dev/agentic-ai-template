import * as React from "react";
import { useRef, useCallback, useState, useEffect } from "react";
import { ArrowUp, Square, ImagePlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { PromptPicker } from "./PromptPicker";
import { ToolPicker } from "./ToolPicker";
import { ImagePreviewList } from "./ImagePreview";
import {
  useMediaUpload,
  mediaToAttachment,
  getAllowedMediaAccept,
} from "@/hooks/useMediaUpload";
import { mediaApi } from "@/lib/api";
import type { ChatMediaAttachment } from "@/lib/chat-store";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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
  /** Enable image upload functionality */
  enableImageUpload?: boolean;
}

export function ChatInput({
  onSubmit,
  onStop,
  placeholder = "Type a message...",
  disabled = false,
  isStreaming = false,
  className,
  organizationId,
  teamId,
  enableImageUpload = true,
}: ChatInputProps) {
  const [value, setValue] = useState("");
  const [isPending, setIsPending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Media upload hook
  const mediaUpload = useMediaUpload({
    organizationId: organizationId ?? "",
    teamId,
    onError: (error) => console.error("Media upload error:", error),
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

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        mediaUpload.addFiles(files);
      }
      // Reset input so same file can be selected again
      e.target.value = "";
    },
    [mediaUpload],
  );

  const handleImageButtonClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // Handle paste events for images
  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      if (!enableImageUpload || !organizationId) return;

      const items = e.clipboardData.items;
      const imageFiles: File[] = [];

      for (const item of items) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            imageFiles.push(file);
          }
        }
      }

      if (imageFiles.length > 0) {
        mediaUpload.addFiles(imageFiles);
      }
    },
    [enableImageUpload, organizationId, mediaUpload],
  );

  // Handle drag and drop
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      if (!enableImageUpload || !organizationId) return;

      e.preventDefault();
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        mediaUpload.addFiles(files);
      }
    },
    [enableImageUpload, organizationId, mediaUpload],
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

  const showImageUpload = enableImageUpload && organizationId;

  return (
    <div
      className={cn(
        "flex flex-col rounded-xl bg-chat-input-bg border border-border/50",
        className,
      )}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      {/* Image previews */}
      {hasMedia && (
        <div className="px-3 pt-3">
          <ImagePreviewList
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
        placeholder={placeholder}
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
          {showImageUpload && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept={getAllowedMediaAccept()}
                multiple
                onChange={handleFileSelect}
                className="hidden"
                aria-label="Upload images"
              />
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={handleImageButtonClick}
                      disabled={disabled || isStreaming || isPending}
                      className="size-8 text-muted-foreground hover:text-foreground"
                      aria-label="Attach image"
                    >
                      <ImagePlus className="size-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <p>Attach image</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </>
          )}
        </div>
        <div className="flex items-center gap-1">
          {isStreaming ? (
            <Button
              onClick={onStop}
              variant="outline"
              size="icon"
              aria-label="Stop generating"
              className="rounded-full"
            >
              <Square className="size-3 fill-current" />
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              disabled={!canSubmit}
              size="icon"
              aria-label={isPending ? "Sending..." : "Send message"}
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
