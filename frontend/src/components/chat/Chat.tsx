import * as React from "react"
import { cn } from "@/lib/utils"
import { useChat, type ChatMessage } from "@/hooks/useChat"
import { ChatContainer } from "./ChatContainer"
import { ChatInput } from "./ChatInput"
import { ToolApprovalCard } from "./ToolApprovalCard"

interface ChatProps {
  /** Unique identifier for this chat instance (e.g., "page" or "panel") */
  instanceId?: string
  conversationId?: string
  organizationId?: string
  teamId?: string
  onError?: (error: Error) => void
  onTitleUpdate?: (conversationId: string, title: string) => void
  /** Called when streaming ends with the conversation ID */
  onStreamEnd?: (conversationId: string) => void
  className?: string
  welcomeMessage?: string
}

export interface ChatHandle {
  clearMessages: () => void
  loadConversation: (conversationId: string, history: { role: "user" | "assistant"; content: string }[]) => void
  conversationId: string | null
}

export const Chat = React.forwardRef<ChatHandle, ChatProps>(
  ({ instanceId = "default", conversationId, organizationId, teamId, onError, onTitleUpdate, onStreamEnd, className, welcomeMessage = "How can I help you today?" }, ref) => {
    const scrollContainerRef = React.useRef<HTMLDivElement>(null)
    const {
      messages,
      sendMessage,
      stopStreaming,
      clearMessages,
      loadConversation,
      isStreaming,
      error,
      conversationId: currentConversationId,
      pendingToolApproval,
      resumeWithApproval,
    } = useChat({
      instanceId,
      conversationId,
      organizationId,
      teamId,
      onError,
      onTitleUpdate,
      onStreamEnd,
    })

    const [isResuming, setIsResuming] = React.useState(false)

    const handleApprove = React.useCallback(async () => {
      setIsResuming(true)
      try {
        await resumeWithApproval(true)
      } finally {
        setIsResuming(false)
      }
    }, [resumeWithApproval])

    const handleReject = React.useCallback(async () => {
      setIsResuming(true)
      try {
        await resumeWithApproval(false)
      } finally {
        setIsResuming(false)
      }
    }, [resumeWithApproval])

    const hasMessages = messages.length > 0

    React.useEffect(() => {
      if (scrollContainerRef.current && hasMessages) {
        scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight
      }
    }, [messages, hasMessages])

    React.useImperativeHandle(ref, () => ({
      clearMessages,
      loadConversation,
      conversationId: currentConversationId,
    }), [clearMessages, loadConversation, currentConversationId])

    if (!hasMessages) {
      return (
        <div className={cn("flex h-full flex-col items-center justify-center", className)}>
          <div className="w-full max-w-2xl px-4">
            <h1 className="mb-8 text-center text-2xl font-medium text-foreground">
              {welcomeMessage}
            </h1>
            <ChatInput
              onSubmit={sendMessage}
              onStop={stopStreaming}
              disabled={isStreaming}
              isStreaming={isStreaming}
              placeholder="Ask something..."
              organizationId={organizationId}
              teamId={teamId}
            />
            {error && (
              <p className="mt-2 text-center text-xs text-destructive">{error.message}</p>
            )}
          </div>
        </div>
      )
    }

    return (
      <div className={cn("flex h-full flex-col", className)}>
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-3xl px-4">
            <ChatContainer messages={messages} className="py-4" />
            {/* Tool Approval Card - shown inline after messages when waiting for approval */}
            {pendingToolApproval && (
              <div className="pb-4">
                <ToolApprovalCard
                  data={pendingToolApproval}
                  onApprove={handleApprove}
                  onReject={handleReject}
                  isLoading={isResuming}
                />
              </div>
            )}
          </div>
        </div>
        <div className="shrink-0 bg-background pb-4 pt-2">
          <div className="mx-auto w-full max-w-3xl px-4">
            <ChatInput
              onSubmit={sendMessage}
              onStop={stopStreaming}
              disabled={isStreaming || !!pendingToolApproval}
              isStreaming={isStreaming}
              placeholder={pendingToolApproval ? "Waiting for tool approval..." : "Ask something..."}
              organizationId={organizationId}
              teamId={teamId}
            />
            {error && (
              <p className="mt-2 text-xs text-destructive">{error.message}</p>
            )}
          </div>
        </div>
      </div>
    )
  }
)

Chat.displayName = "Chat"

export type { ChatMessage }
