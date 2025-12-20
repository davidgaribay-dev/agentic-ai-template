import { createFileRoute, redirect } from "@tanstack/react-router"
import { useCallback, useRef, useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { z } from "zod"
import { MessageSquareOff } from "lucide-react"

import { Chat, type ChatHandle } from "@/components/chat"
import { agentApi } from "@/lib/api"
import { queryKeys } from "@/lib/queries"
import { useChatSelection } from "@/lib/chat-store"
import { useWorkspace } from "@/lib/workspace"
import { useEffectiveSettings } from "@/lib/settings-context"

const chatSearchSchema = z.object({
  id: z.string().optional(),
})

export const Route = createFileRoute("/chat")({
  beforeLoad: ({ context }) => {
    if (!context.auth.isAuthenticated && !context.auth.isLoading) {
      throw redirect({ to: "/login" })
    }
  },
  component: ChatPage,
  validateSearch: chatSearchSchema,
})

function ChatPage() {
  const queryClient = useQueryClient()
  const chatRef = useRef<ChatHandle>(null)
  const { currentOrg, currentTeam } = useWorkspace()
  const { id: conversationIdFromUrl } = Route.useSearch()
  const effectiveSettings = useEffectiveSettings()

  const {
    selectedConversationId,
    currentTitle,
    setSelectedConversation,
    setCurrentTitle,
  } = useChatSelection()

  const lastLoadedIdRef = useRef<string | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  const teamId = currentTeam?.id
  const orgId = currentOrg?.id

  useEffect(() => {
    if (conversationIdFromUrl === lastLoadedIdRef.current) {
      return
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }

    if (!conversationIdFromUrl) {
      if (lastLoadedIdRef.current) {
        chatRef.current?.clearMessages()
        lastLoadedIdRef.current = null
      }
      return
    }

    const abortController = new AbortController()
    abortControllerRef.current = abortController

    lastLoadedIdRef.current = conversationIdFromUrl
    agentApi.getHistory(conversationIdFromUrl).then((history) => {
      if (abortController.signal.aborted) return
      chatRef.current?.loadConversation(conversationIdFromUrl, history)
    }).catch((error) => {
      if (error instanceof Error && error.name === "AbortError") return
      console.error("Failed to load conversation:", error)
      lastLoadedIdRef.current = null
    })

    return () => {
      abortController.abort()
    }
  }, [conversationIdFromUrl])

  const handleTitleUpdate = useCallback(
    (_conversationId: string, title: string) => {
      setCurrentTitle(title)
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations.list(teamId) })
    },
    [queryClient, setCurrentTitle, teamId]
  )

  const handleStreamEnd = useCallback(
    (conversationId: string) => {
      if (conversationId && conversationId !== selectedConversationId) {
        setSelectedConversation(conversationId, currentTitle)
      }
    },
    [selectedConversationId, currentTitle, setSelectedConversation]
  )

  if (!effectiveSettings.chat_enabled) {
    const disabledBy = effectiveSettings.chat_disabled_by
    const message =
      disabledBy === "org"
        ? "Chat has been disabled by your organization."
        : disabledBy === "team"
          ? "Chat has been disabled by your team."
          : "Chat is currently disabled."

    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center max-w-md px-4">
          <div className="flex justify-center mb-4">
            <div className="flex size-16 items-center justify-center rounded-full bg-muted">
              <MessageSquareOff className="size-8 text-muted-foreground" />
            </div>
          </div>
          <h1 className="text-xl font-semibold mb-2">Chat Unavailable</h1>
          <p className="text-muted-foreground">{message}</p>
          <p className="text-sm text-muted-foreground mt-4">
            Contact your administrator if you need access to this feature.
          </p>
        </div>
      </div>
    )
  }

  return (
    <Chat
      ref={chatRef}
      instanceId="page"
      organizationId={orgId}
      teamId={teamId}
      onTitleUpdate={handleTitleUpdate}
      onStreamEnd={handleStreamEnd}
      className="h-full border-0"
    />
  )
}
