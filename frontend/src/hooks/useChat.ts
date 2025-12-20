/**
 * Chat hook with SSE streaming support and shared state via Zustand.
 *
 * Provides a complete chat state management solution with:
 * - Shared message state between chat instances (page and side panel)
 * - SSE streaming for real-time responses
 * - Abort controller for canceling requests
 * - Loading and error states
 *
 * Usage:
 *   const { messages, sendMessage, isStreaming, error } = useChat({ instanceId: "page" })
 */

import { useCallback, useRef, useMemo, useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { agentApi } from "@/lib/api"
import { queryKeys } from "@/lib/queries"
import { useChatMessagesStore, type ChatMessage } from "@/lib/chat-store"
import { useShallow } from "zustand/react/shallow"

export type { ChatMessage }

interface UseChatOptions {
  /** Unique identifier for this chat instance (e.g., "page" or "panel") */
  instanceId?: string
  conversationId?: string
  organizationId?: string
  teamId?: string
  onError?: (error: Error) => void
  onStreamStart?: () => void
  onStreamEnd?: (conversationId: string) => void
  onTitleUpdate?: (conversationId: string, title: string) => void
}

interface UseChatReturn {
  messages: ChatMessage[]
  sendMessage: (content: string) => Promise<void>
  stopStreaming: () => void
  clearMessages: () => void
  loadConversation: (conversationId: string, history: { role: "user" | "assistant"; content: string }[]) => void
  isStreaming: boolean
  error: Error | null
  conversationId: string | null
}

const defaultSession = {
  messages: [] as ChatMessage[],
  isStreaming: false,
  error: null as Error | null,
  conversationId: null as string | null,
}

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
  } = options

  const session = useChatMessagesStore(
    useShallow((state) => state.sessions[instanceId] ?? defaultSession)
  )

  const actions = useChatMessagesStore(
    useShallow((state) => ({
      setMessages: state.setMessages,
      updateMessage: state.updateMessage,
      addMessages: state.addMessages,
      removeMessage: state.removeMessage,
      setIsStreaming: state.setIsStreaming,
      setError: state.setError,
      setConversationId: state.setConversationId,
      clearSession: state.clearSession,
      syncConversation: state.syncConversation,
    }))
  )

  const { messages, isStreaming, error, conversationId: sessionConversationId } = session
  const conversationId = sessionConversationId ?? initialConversationId ?? null

  const abortControllerRef = useRef<AbortController | null>(null)
  const queryClient = useQueryClient()

  const stopStreaming = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    actions.setIsStreaming(instanceId, false)
  }, [instanceId, actions])

  // Cleanup SSE stream on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
        abortControllerRef.current = null
      }
    }
  }, [])

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || isStreaming) return

      actions.setError(instanceId, null)

      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: content.trim(),
      }

      const assistantMessageId = crypto.randomUUID()
      const assistantMessage: ChatMessage = {
        id: assistantMessageId,
        role: "assistant",
        content: "",
        isStreaming: true,
      }

      actions.addMessages(instanceId, [userMessage, assistantMessage])
      actions.setIsStreaming(instanceId, true)
      onStreamStart?.()

      abortControllerRef.current = new AbortController()

      try {
        let streamedContent = ""
        let newConversationId = conversationId

        for await (const event of agentApi.chatStream(
          {
            message: content.trim(),
            conversation_id: conversationId ?? undefined,
            organization_id: organizationId,
            team_id: teamId,
          },
          abortControllerRef.current.signal
        )) {
          switch (event.type) {
            case "token":
              streamedContent += event.data
              actions.updateMessage(instanceId, assistantMessageId, { content: streamedContent })
              break

            case "title":
              if (event.data.conversation_id && event.data.title) {
                onTitleUpdate?.(event.data.conversation_id, event.data.title)
                agentApi.updateTitle(event.data.conversation_id, event.data.title)
                  .then(() => {
                    queryClient.invalidateQueries({
                      queryKey: queryKeys.conversations.list(teamId),
                    })
                  })
                  .catch((err) => {
                    console.error("Failed to update conversation title:", err)
                  })
              }
              break

            case "done":
              newConversationId = event.data.conversation_id
              actions.setConversationId(instanceId, newConversationId)
              break

            case "error":
              throw new Error(event.data)
          }
        }

        actions.updateMessage(instanceId, assistantMessageId, { isStreaming: false })

        if (newConversationId) {
          queryClient.invalidateQueries({
            queryKey: queryKeys.agent.history(newConversationId),
          })
          queryClient.invalidateQueries({
            queryKey: queryKeys.conversations.list(teamId),
          })
          onStreamEnd?.(newConversationId)
        }
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          actions.removeMessage(instanceId, assistantMessageId)
          return
        }

        const error = err instanceof Error ? err : new Error("Stream failed")
        actions.setError(instanceId, error)
        onError?.(error)

        actions.updateMessage(instanceId, assistantMessageId, {
          content: "Failed to get response. Please try again.",
          isStreaming: false,
        })
      } finally {
        actions.setIsStreaming(instanceId, false)
        abortControllerRef.current = null
      }
    },
    [conversationId, organizationId, teamId, isStreaming, onError, onStreamStart, onStreamEnd, onTitleUpdate, queryClient, instanceId, actions]
  )

  const clearMessages = useCallback(() => {
    actions.clearSession(instanceId)
  }, [instanceId, actions])

  const loadConversation = useCallback(
    (newConversationId: string, history: { role: "user" | "assistant"; content: string }[]) => {
      const newMessages = history.map((msg) => ({
        id: crypto.randomUUID(),
        role: msg.role,
        content: msg.content,
      }))
      actions.setConversationId(instanceId, newConversationId)
      actions.setError(instanceId, null)
      actions.setMessages(instanceId, newMessages)
      actions.syncConversation(newConversationId, newMessages)
    },
    [instanceId, actions]
  )

  return useMemo(() => ({
    messages,
    sendMessage,
    stopStreaming,
    clearMessages,
    loadConversation,
    isStreaming,
    error,
    conversationId,
  }), [messages, sendMessage, stopStreaming, clearMessages, loadConversation, isStreaming, error, conversationId])
}
