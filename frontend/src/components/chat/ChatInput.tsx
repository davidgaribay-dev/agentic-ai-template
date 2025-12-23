import * as React from "react";
import { useRef, useCallback, useState, useEffect } from "react";
import { ArrowUp, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { PromptPicker } from "./PromptPicker";
import { ToolPicker } from "./ToolPicker";

interface ChatInputProps {
  onSubmit: (message: string) => void;
  onStop?: () => void;
  placeholder?: string;
  disabled?: boolean;
  isStreaming?: boolean;
  className?: string;
  organizationId?: string;
  teamId?: string;
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
}: ChatInputProps) {
  const [value, setValue] = useState("");
  const [isPending, setIsPending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || disabled || isPending || isStreaming) return;

    setIsPending(true);
    onSubmit(trimmed);
    setValue("");
    textareaRef.current?.focus();

    // Reset pending state after a short timeout as fallback
    // (in case streaming never starts due to an error)
    setTimeout(() => setIsPending(false), 2000);
  }, [value, disabled, isPending, isStreaming, onSubmit]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  const isEmpty = value.trim().length === 0;

  useEffect(() => {
    if (!disabled && !isStreaming) {
      textareaRef.current?.focus();
    }
  }, [disabled, isStreaming]);

  return (
    <div
      className={cn(
        "flex flex-col rounded-xl bg-chat-input-bg border border-border/50",
        className,
      )}
    >
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
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
              disabled={disabled || isEmpty || isPending}
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
