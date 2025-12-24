import { memo } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { ChatMessage } from "./ChatMessage";
import type { MessageSource, ChatMediaAttachment } from "@/lib/chat-store";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
  sources?: MessageSource[];
  media?: ChatMediaAttachment[];
  /** Whether this message was blocked by guardrails */
  guardrail_blocked?: boolean;
}

interface ChatContainerProps {
  messages: Message[];
  className?: string;
}

export const ChatContainer = memo(function ChatContainer({
  messages,
  className,
}: ChatContainerProps) {
  const { t } = useTranslation();

  if (messages.length === 0) {
    return null;
  }

  return (
    <div
      className={cn("flex min-h-full flex-col gap-4", className)}
      role="log"
      aria-label={t("aria_chat_messages")}
      aria-live="polite"
      aria-relevant="additions"
    >
      {messages.map((message) => (
        <ChatMessage
          key={message.id}
          role={message.role}
          content={message.content}
          isStreaming={message.isStreaming}
          sources={message.sources}
          media={message.media}
          guardrail_blocked={message.guardrail_blocked}
        />
      ))}
    </div>
  );
});
