/**
 * Chat hook with SSE streaming support and shared state via Zustand.
 *
 * Provides a complete chat state management solution with:
 * - Shared message state between chat instances (page and side panel)
 * - SSE streaming for real-time responses
 * - Abort controller for canceling requests
 * - Loading and error states
 * - Human-in-the-loop (HITL) tool approval for MCP tools
 *
 * Usage:
 *   const { messages, sendMessage, isStreaming, error, pendingToolApproval, resumeWithApproval } = useChat({ instanceId: "page" })
 */

import { useCallback, useRef, useMemo, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  agentApi,
  type MessageSource,
  type MessageMediaInfo,
  mediaApi,
} from "@/lib/api";
import { queryKeys } from "@/lib/queries";
import {
  useChatMessagesStore,
  type ChatMessage,
  type ChatMediaAttachment,
  type PendingToolApproval,
  type RejectedToolCall,
} from "@/lib/chat-store";
import { useShallow } from "zustand/react/shallow";

export type {
  ChatMessage,
  ChatMediaAttachment,
  PendingToolApproval,
  RejectedToolCall,
  MessageSource,
  MessageMediaInfo,
};

interface UseChatOptions {
  /** Unique identifier for this chat instance (e.g., "page" or "panel") */
  instanceId?: string;
  conversationId?: string;
  organizationId?: string;
  teamId?: string;
  onError?: (error: Error) => void;
  onStreamStart?: () => void;
  onStreamEnd?: (conversationId: string) => void;
  onTitleUpdate?: (conversationId: string, title: string) => void;
}

/** Options for sending a message with optional media */
interface SendMessageOptions {
  /** Media attachments to include with the message */
  media?: ChatMediaAttachment[];
}

interface UseChatReturn {
  messages: ChatMessage[];
  sendMessage: (content: string, options?: SendMessageOptions) => Promise<void>;
  stopStreaming: () => void;
  clearMessages: () => void;
  loadConversation: (
    conversationId: string,
    history: {
      role: "user" | "assistant";
      content: string;
      sources?: MessageSource[] | null;
      media?: MessageMediaInfo[] | null;
    }[],
  ) => Promise<void>;
  isStreaming: boolean;
  error: Error | null;
  conversationId: string | null;
  /** Pending tool approval request (HITL for MCP tools) */
  pendingToolApproval: PendingToolApproval | null;
  /** Recently rejected tool call (for undo functionality) */
  rejectedToolCall: RejectedToolCall | null;
  /** Resume conversation after approving/rejecting a tool call */
  resumeWithApproval: (approved: boolean) => Promise<void>;
  /** Undo a rejection and re-show approval card */
  undoRejection: () => void;
}

const defaultSession = {
  messages: [] as ChatMessage[],
  isStreaming: false,
  error: null as Error | null,
  conversationId: null as string | null,
  pendingToolApproval: null as PendingToolApproval | null,
  rejectedToolCall: null as RejectedToolCall | null,
};

export function useChat(options: UseChatOptions = {}): UseChatReturn {
  const {
    instanceId = "default",
    conversationId: initialConversationId,
    organizationId,
    teamId,
    onError,
    onStreamStart,
    onStreamEnd,
    onTitleUpdate,
  } = options;

  const session = useChatMessagesStore(
    useShallow((state) => state.sessions[instanceId] ?? defaultSession),
  );

  const actions = useChatMessagesStore(
    useShallow((state) => ({
      setMessages: state.setMessages,
      updateMessage: state.updateMessage,
      addMessages: state.addMessages,
      removeMessage: state.removeMessage,
      setIsStreaming: state.setIsStreaming,
      setError: state.setError,
      setConversationId: state.setConversationId,
      setPendingToolApproval: state.setPendingToolApproval,
      setRejectedToolCall: state.setRejectedToolCall,
      clearSession: state.clearSession,
      syncConversation: state.syncConversation,
    })),
  );

  const {
    messages,
    isStreaming,
    error,
    conversationId: sessionConversationId,
    pendingToolApproval,
    rejectedToolCall,
  } = session;
  const conversationId = sessionConversationId ?? initialConversationId ?? null;

  const abortControllerRef = useRef<AbortController | null>(null);
  const queryClient = useQueryClient();

  const stopStreaming = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    actions.setIsStreaming(instanceId, false);
  }, [instanceId, actions]);

  // Cleanup SSE stream on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, []);

  const sendMessage = useCallback(
    async (content: string, options?: SendMessageOptions) => {
      if (!content.trim() || isStreaming) return;

      // If there's a pending tool approval, auto-reject it before sending new message
      // This allows users to skip tools by typing a new message
      if (pendingToolApproval && conversationId && organizationId) {
        // Clear pending approval and set as rejected (for potential undo)
        actions.setPendingToolApproval(instanceId, null);
        actions.setRejectedToolCall(instanceId, {
          ...pendingToolApproval,
          rejectedAt: Date.now(),
        });

        // Send rejection to backend (fire and forget)
        // Use an async IIFE to consume the generator without blocking
        (async () => {
          try {
            // Consume the generator to trigger the rejection
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            for await (const _event of agentApi.resumeStream(
              {
                conversation_id: conversationId,
                organization_id: organizationId,
                team_id: teamId,
                approved: false,
              },
              new AbortController().signal,
            )) {
              // Just consume, we don't need the response
            }
          } catch (err) {
            console.warn("Failed to auto-reject pending tool approval:", err);
          }
        })();
      }

      actions.setError(instanceId, null);

      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: content.trim(),
        media: options?.media,
      };

      const assistantMessageId = crypto.randomUUID();
      const assistantMessage: ChatMessage = {
        id: assistantMessageId,
        role: "assistant",
        content: "",
        isStreaming: true,
      };

      actions.addMessages(instanceId, [userMessage, assistantMessage]);
      actions.setIsStreaming(instanceId, true);
      onStreamStart?.();

      abortControllerRef.current = new AbortController();

      try {
        let streamedContent = "";
        let newConversationId = conversationId;
        let pendingSources: MessageSource[] = [];

        for await (const event of agentApi.chatStream(
          {
            message: content.trim(),
            conversation_id: conversationId ?? undefined,
            organization_id: organizationId,
            team_id: teamId,
            media_ids: options?.media?.map((m) => m.id),
          },
          abortControllerRef.current.signal,
        )) {
          switch (event.type) {
            case "token":
              streamedContent += event.data;
              actions.updateMessage(instanceId, assistantMessageId, {
                content: streamedContent,
              });
              break;

            case "title":
              if (event.data.conversation_id && event.data.title) {
                onTitleUpdate?.(event.data.conversation_id, event.data.title);
                agentApi
                  .updateTitle(event.data.conversation_id, event.data.title)
                  .then(() => {
                    queryClient.invalidateQueries({
                      queryKey: queryKeys.conversations.list(teamId),
                    });
                  })
                  .catch((err) => {
                    console.error("Failed to update conversation title:", err);
                  });
              }
              break;

            case "done":
              newConversationId = event.data.conversation_id;
              actions.setConversationId(instanceId, newConversationId);
              break;

            case "sources":
              // Accumulate sources from RAG search_documents tool
              pendingSources = [...pendingSources, ...event.data.sources];
              break;

            case "tool_approval":
              // Store the pending tool approval and pause streaming
              actions.setPendingToolApproval(instanceId, {
                tool_name: event.data.tool_name,
                tool_args: event.data.tool_args,
                tool_call_id: event.data.tool_call_id,
                tool_description: event.data.tool_description,
              });
              newConversationId = event.data.conversation_id;
              actions.setConversationId(instanceId, newConversationId);
              // Don't mark as not streaming - we're waiting for user input
              actions.updateMessage(instanceId, assistantMessageId, {
                isStreaming: false,
              });
              return; // Exit early, user needs to approve/reject

            case "guardrail_block":
              // Guardrail blocked the message - update with the block message
              actions.updateMessage(instanceId, assistantMessageId, {
                content: event.data.message,
                isStreaming: false,
                guardrail_blocked: true,
              });
              newConversationId = event.data.conversation_id;
              actions.setConversationId(instanceId, newConversationId);
              break;

            case "error":
              throw new Error(event.data);
          }
        }

        // Attach sources to the assistant message if any were collected
        actions.updateMessage(instanceId, assistantMessageId, {
          isStreaming: false,
          ...(pendingSources.length > 0 ? { sources: pendingSources } : {}),
        });

        if (newConversationId) {
          queryClient.invalidateQueries({
            queryKey: queryKeys.agent.history(newConversationId),
          });
          queryClient.invalidateQueries({
            queryKey: queryKeys.conversations.list(teamId),
          });
          onStreamEnd?.(newConversationId);
        }
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          actions.removeMessage(instanceId, assistantMessageId);
          return;
        }

        const error = err instanceof Error ? err : new Error("Stream failed");
        actions.setError(instanceId, error);
        onError?.(error);

        actions.updateMessage(instanceId, assistantMessageId, {
          content: "Failed to get response. Please try again.",
          isStreaming: false,
        });
      } finally {
        actions.setIsStreaming(instanceId, false);
        abortControllerRef.current = null;
      }
    },
    [
      conversationId,
      organizationId,
      teamId,
      isStreaming,
      pendingToolApproval,
      onError,
      onStreamStart,
      onStreamEnd,
      onTitleUpdate,
      queryClient,
      instanceId,
      actions,
    ],
  );

  const clearMessages = useCallback(() => {
    actions.clearSession(instanceId);
  }, [instanceId, actions]);

  const loadConversation = useCallback(
    async (
      newConversationId: string,
      history: {
        role: "user" | "assistant";
        content: string;
        sources?: MessageSource[] | null;
        media?: MessageMediaInfo[] | null;
        guardrail_blocked?: boolean;
      }[],
    ) => {
      // Convert history to ChatMessages, including media attachments
      const newMessages: ChatMessage[] = history.map((msg) => {
        const chatMsg: ChatMessage = {
          id: crypto.randomUUID(),
          role: msg.role,
          content: msg.content,
          sources: msg.sources ?? undefined,
          guardrail_blocked: msg.guardrail_blocked ?? false,
        };

        // Convert media info to media attachments with URLs
        if (msg.media && msg.media.length > 0) {
          chatMsg.media = msg.media.map((m) => ({
            id: m.id,
            url: mediaApi.getContentUrl(m.id),
            filename: m.filename || "",
            mime_type: m.mime_type,
          }));
        }

        return chatMsg;
      });
      actions.setConversationId(instanceId, newConversationId);
      actions.setError(instanceId, null);
      actions.setMessages(instanceId, newMessages);
      actions.syncConversation(newConversationId, newMessages);

      // Check for pending tool approval on this conversation
      // This handles the case where user reloads/returns to a conversation with pending approval
      if (organizationId) {
        try {
          const pendingApproval = await agentApi.getPendingApproval(
            newConversationId,
            organizationId,
            teamId,
          );
          if (pendingApproval) {
            actions.setPendingToolApproval(instanceId, {
              tool_name: pendingApproval.tool_name,
              tool_args: pendingApproval.tool_args,
              tool_call_id: pendingApproval.tool_call_id,
              tool_description: pendingApproval.tool_description,
            });
          } else {
            // Clear any stale pending approval
            actions.setPendingToolApproval(instanceId, null);
          }
        } catch (err) {
          console.warn("Failed to check pending approval:", err);
          // Non-fatal - just log and continue
        }
      }
    },
    [instanceId, actions, organizationId, teamId],
  );

  const resumeWithApproval = useCallback(
    async (approved: boolean) => {
      if (!conversationId || !organizationId) {
        console.error(
          "Cannot resume: missing conversationId or organizationId",
        );
        return;
      }

      // Store the pending approval for potential undo if rejecting
      const currentApproval = pendingToolApproval;

      // Clear the pending approval immediately
      actions.setPendingToolApproval(instanceId, null);
      actions.setError(instanceId, null);

      // If rejecting, store for undo capability
      if (!approved && currentApproval) {
        actions.setRejectedToolCall(instanceId, {
          ...currentApproval,
          rejectedAt: Date.now(),
        });
      } else {
        // Clear any existing rejection if approving
        actions.setRejectedToolCall(instanceId, null);
      }

      // Create an assistant message to show streaming response
      const assistantMessageId = crypto.randomUUID();
      const assistantMessage: ChatMessage = {
        id: assistantMessageId,
        role: "assistant",
        content: "", // Don't show "cancelled" - let the agent respond
        isStreaming: approved, // Only stream if approved
      };

      if (approved) {
        actions.addMessages(instanceId, [assistantMessage]);
        actions.setIsStreaming(instanceId, true);
      }

      abortControllerRef.current = new AbortController();

      try {
        let streamedContent = "";
        let pendingSources: MessageSource[] = [];

        for await (const event of agentApi.resumeStream(
          {
            conversation_id: conversationId,
            organization_id: organizationId,
            team_id: teamId,
            approved,
          },
          abortControllerRef.current.signal,
        )) {
          switch (event.type) {
            case "token":
              streamedContent += event.data;
              actions.updateMessage(instanceId, assistantMessageId, {
                content: streamedContent,
              });
              break;

            case "done":
              break;

            case "sources":
              // Accumulate sources from RAG search_documents tool
              pendingSources = [...pendingSources, ...event.data.sources];
              break;

            case "tool_approval":
              // Another tool needs approval
              actions.setPendingToolApproval(instanceId, {
                tool_name: event.data.tool_name,
                tool_args: event.data.tool_args,
                tool_call_id: event.data.tool_call_id,
                tool_description: event.data.tool_description,
              });
              actions.updateMessage(instanceId, assistantMessageId, {
                isStreaming: false,
              });
              return; // Exit early, user needs to approve/reject again

            case "error":
              throw new Error(event.data);
          }
        }

        if (approved) {
          // Attach sources to the assistant message if any were collected
          actions.updateMessage(instanceId, assistantMessageId, {
            isStreaming: false,
            ...(pendingSources.length > 0 ? { sources: pendingSources } : {}),
          });
        }

        // Invalidate queries
        queryClient.invalidateQueries({
          queryKey: queryKeys.agent.history(conversationId),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.conversations.list(teamId),
        });
        onStreamEnd?.(conversationId);
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          if (approved) {
            actions.removeMessage(instanceId, assistantMessageId);
          }
          return;
        }

        const error = err instanceof Error ? err : new Error("Resume failed");
        actions.setError(instanceId, error);
        onError?.(error);

        if (approved) {
          actions.updateMessage(instanceId, assistantMessageId, {
            content: "Failed to continue. Please try again.",
            isStreaming: false,
          });
        }
      } finally {
        actions.setIsStreaming(instanceId, false);
        abortControllerRef.current = null;
      }
    },
    [
      conversationId,
      organizationId,
      teamId,
      pendingToolApproval,
      onError,
      onStreamEnd,
      queryClient,
      instanceId,
      actions,
    ],
  );

  const undoRejection = useCallback(() => {
    if (!rejectedToolCall) return;

    // Re-show the approval card with the rejected tool call data
    actions.setPendingToolApproval(instanceId, {
      tool_name: rejectedToolCall.tool_name,
      tool_args: rejectedToolCall.tool_args,
      tool_call_id: rejectedToolCall.tool_call_id,
      tool_description: rejectedToolCall.tool_description,
    });
    // Clear the rejection
    actions.setRejectedToolCall(instanceId, null);
  }, [rejectedToolCall, instanceId, actions]);

  return useMemo(
    () => ({
      messages,
      sendMessage,
      stopStreaming,
      clearMessages,
      loadConversation,
      isStreaming,
      error,
      conversationId,
      pendingToolApproval,
      rejectedToolCall,
      resumeWithApproval,
      undoRejection,
    }),
    [
      messages,
      sendMessage,
      stopStreaming,
      clearMessages,
      loadConversation,
      isStreaming,
      error,
      conversationId,
      pendingToolApproval,
      rejectedToolCall,
      resumeWithApproval,
      undoRejection,
    ],
  );
}
