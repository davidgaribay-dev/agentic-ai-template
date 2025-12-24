import * as React from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { useChat, type ChatMessage } from "@/hooks/useChat";
import { ChatContainer } from "./ChatContainer";
import { ChatInput } from "./ChatInput";
import { ChatError } from "./ChatError";
import { ToolApprovalCard, ToolRejectionMessage } from "./ToolApprovalCard";

interface ChatProps {
  /** Unique identifier for this chat instance (e.g., "page" or "panel") */
  instanceId?: string;
  conversationId?: string;
  organizationId?: string;
  teamId?: string;
  onError?: (error: Error) => void;
  onTitleUpdate?: (conversationId: string, title: string) => void;
  /** Called when streaming ends with the conversation ID */
  onStreamEnd?: (conversationId: string) => void;
  className?: string;
  welcomeMessage?: string;
}

export interface ChatHandle {
  clearMessages: () => void;
  loadConversation: (
    conversationId: string,
    history: { role: "user" | "assistant"; content: string }[],
  ) => Promise<void>;
  conversationId: string | null;
}

export const Chat = React.forwardRef<ChatHandle, ChatProps>(
  (
    {
      instanceId = "default",
      conversationId,
      organizationId,
      teamId,
      onError,
      onTitleUpdate,
      onStreamEnd,
      className,
      welcomeMessage,
    },
    ref,
  ) => {
    const { t } = useTranslation();
    const scrollContainerRef = React.useRef<HTMLDivElement>(null);
    const displayWelcome = welcomeMessage ?? t("chat_welcome");
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
      rejectedToolCall,
      resumeWithApproval,
      undoRejection,
    } = useChat({
      instanceId,
      conversationId,
      organizationId,
      teamId,
      onError,
      onTitleUpdate,
      onStreamEnd,
    });

    const [isResuming, setIsResuming] = React.useState(false);

    const handleApprove = React.useCallback(async () => {
      setIsResuming(true);
      try {
        await resumeWithApproval(true);
      } finally {
        setIsResuming(false);
      }
    }, [resumeWithApproval]);

    const handleReject = React.useCallback(async () => {
      setIsResuming(true);
      try {
        await resumeWithApproval(false);
      } finally {
        setIsResuming(false);
      }
    }, [resumeWithApproval]);

    // Auto-cancel pending tool approval when component unmounts
    // This prevents orphaned tool_use blocks in the checkpoint
    // We use refs to avoid re-running the effect when these values change
    const pendingApprovalRef = React.useRef(pendingToolApproval);
    const resumeRef = React.useRef(resumeWithApproval);
    const conversationIdRef = React.useRef(currentConversationId);
    const orgIdRef = React.useRef(organizationId);

    pendingApprovalRef.current = pendingToolApproval;
    resumeRef.current = resumeWithApproval;
    conversationIdRef.current = currentConversationId;
    orgIdRef.current = organizationId;

    React.useEffect(() => {
      return () => {
        // If unmounting while there's a pending approval, auto-reject it
        // This cleans up the checkpoint so the next message doesn't fail
        if (
          pendingApprovalRef.current &&
          conversationIdRef.current &&
          orgIdRef.current
        ) {
          // Fire and forget - we're unmounting so we can't await
          resumeRef.current(false).catch((err) => {
            console.warn("Failed to auto-cancel pending tool approval:", err);
          });
        }
      };
    }, []); // Empty deps - only run cleanup on unmount

    const hasMessages = messages.length > 0;

    React.useEffect(() => {
      if (scrollContainerRef.current && hasMessages) {
        scrollContainerRef.current.scrollTop =
          scrollContainerRef.current.scrollHeight;
      }
    }, [messages, hasMessages]);

    React.useImperativeHandle(
      ref,
      () => ({
        clearMessages,
        loadConversation,
        conversationId: currentConversationId,
      }),
      [clearMessages, loadConversation, currentConversationId],
    );

    if (!hasMessages) {
      return (
        <div
          className={cn(
            "flex h-full flex-col items-center justify-start pt-[25vh]",
            className,
          )}
        >
          <div className="w-full max-w-2xl px-4">
            <h1 className="mb-8 text-center text-2xl font-medium text-foreground">
              {displayWelcome}
            </h1>
            <ChatInput
              onSubmit={sendMessage}
              onStop={stopStreaming}
              disabled={isStreaming}
              isStreaming={isStreaming}
              placeholder={t("chat_ask_something")}
              organizationId={organizationId}
              teamId={teamId}
            />
            {error && (
              <ChatError
                error={error}
                organizationId={organizationId}
                teamId={teamId}
                className="mt-4"
              />
            )}
          </div>
        </div>
      );
    }

    return (
      <div className={cn("flex h-full flex-col overflow-hidden", className)}>
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto overflow-x-hidden"
        >
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
            {/* Rejection message with undo - shown after rejecting a tool call */}
            {rejectedToolCall && !pendingToolApproval && (
              <div className="pb-4">
                <ToolRejectionMessage
                  toolName={rejectedToolCall.tool_name}
                  onUndo={undoRejection}
                  undoTimeoutMs={30000}
                />
              </div>
            )}
          </div>
        </div>
        <div className="shrink-0 bg-background pb-4 pt-4">
          <div className="mx-auto w-full max-w-3xl px-4">
            <ChatInput
              onSubmit={sendMessage}
              onStop={stopStreaming}
              disabled={isStreaming}
              isStreaming={isStreaming}
              placeholder={
                pendingToolApproval
                  ? t("chat_skip_tool_continue")
                  : t("chat_ask_something")
              }
              organizationId={organizationId}
              teamId={teamId}
            />
            {error && (
              <ChatError
                error={error}
                organizationId={organizationId}
                teamId={teamId}
                className="mt-2"
              />
            )}
          </div>
        </div>
      </div>
    );
  },
);

Chat.displayName = "Chat";

export type { ChatMessage };
