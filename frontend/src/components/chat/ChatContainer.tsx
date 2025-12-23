import { memo } from "react"
import { cn } from "@/lib/utils"
import { ChatMessage } from "./ChatMessage"
import type { MessageSource } from "@/lib/chat-store"

export interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  isStreaming?: boolean
  sources?: MessageSource[]
}

interface ChatContainerProps {
  messages: Message[]
  className?: string
}

export const ChatContainer = memo(function ChatContainer({
  messages,
  className,
}: ChatContainerProps) {
  if (messages.length === 0) {
    return null
  }

  return (
    <div
      className={cn("flex min-h-full flex-col gap-4", className)}
      role="log"
      aria-label="Chat messages"
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
        />
      ))}
    </div>
  )
})
