import * as React from "react"
import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
} from "react"
import { Plus, PanelRight } from "lucide-react"
import { Chat, ChatHistoryDropdown, type ChatHandle } from "./chat"
import { Button } from "@/components/ui/button"
import { agentApi } from "@/lib/api"
import {
  useSidePanelState,
  MIN_SIDE_PANEL_WIDTH,
  MAX_SIDE_PANEL_WIDTH,
} from "@/lib/ui-store"
import { useWorkspace } from "@/lib/workspace"
import { useChatSelection } from "@/lib/chat-store"

type PanelMode = "chat" | "custom"

interface SidePanelContextValue {
  isOpen: boolean
  width: number
  title: string
  mode: PanelMode
  open: () => void
  close: () => void
  toggle: () => void
  content: React.ReactNode
  setContent: (content: React.ReactNode) => void
  setTitle: (title: string) => void
  setWidth: (width: number) => void
  setMode: (mode: PanelMode) => void
  openChat: () => void
}

const SidePanelContext = createContext<SidePanelContextValue | null>(null)

export function useSidePanel() {
  const context = useContext(SidePanelContext)
  if (!context) {
    throw new Error("useSidePanel must be used within a SidePanelProvider")
  }
  return context
}

export function SidePanelProvider({ children }: { children: React.ReactNode }) {
  const {
    sidePanelOpen: isOpen,
    sidePanelWidth: width,
    setSidePanelOpen,
    toggleSidePanel,
    setSidePanelWidth,
  } = useSidePanelState()

  const [content, setContent] = useState<React.ReactNode>(null)
  const [title, setTitle] = useState("Panel")
  const [mode, setMode] = useState<PanelMode>("chat")

  const open = useCallback(() => setSidePanelOpen(true), [setSidePanelOpen])
  const close = useCallback(() => setSidePanelOpen(false), [setSidePanelOpen])
  const toggle = toggleSidePanel

  const openChat = useCallback(() => {
    setMode("chat")
    setTitle("Chat")
    setSidePanelOpen(true)
  }, [setSidePanelOpen])

  const value = useMemo<SidePanelContextValue>(
    () => ({
      isOpen,
      width,
      title,
      mode,
      open,
      close,
      toggle,
      content,
      setContent,
      setTitle,
      setWidth: setSidePanelWidth,
      setMode,
      openChat,
    }),
    [isOpen, width, title, mode, open, close, toggle, content, setSidePanelWidth, openChat]
  )

  return (
    <SidePanelContext.Provider value={value}>
      {children}
    </SidePanelContext.Provider>
  )
}

export function SidePanel() {
  const { isOpen, title, mode, toggle, content, setWidth } = useSidePanel()
  const { currentOrg, currentTeam } = useWorkspace()
  const { selectedConversationId } = useChatSelection()
  const isResizing = useRef(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const chatRef = useRef<ChatHandle>(null)
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null)
  const [currentTitle, setCurrentTitle] = useState<string | null>(null)

  const teamId = currentTeam?.id
  const orgId = currentOrg?.id

  const startResizing = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isResizing.current = true
    document.body.style.cursor = "ew-resize"
    document.body.style.userSelect = "none"
  }, [])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing.current) return

      const newWidth = window.innerWidth - e.clientX
      if (newWidth >= MIN_SIDE_PANEL_WIDTH && newWidth <= MAX_SIDE_PANEL_WIDTH) {
        setWidth(newWidth)
      }
    }

    const handleMouseUp = () => {
      isResizing.current = false
      document.body.style.cursor = ""
      document.body.style.userSelect = ""
    }

    document.addEventListener("mousemove", handleMouseMove)
    document.addEventListener("mouseup", handleMouseUp)

    return () => {
      document.removeEventListener("mousemove", handleMouseMove)
      document.removeEventListener("mouseup", handleMouseUp)
    }
  }, [setWidth])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        toggle()
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [isOpen, toggle])

  useEffect(() => {
    if (chatRef.current && mode === "chat") {
      setCurrentConversationId(chatRef.current.conversationId)
    }
  }, [mode])

  // Watch for global conversation selection changes (from search page, etc.)
  useEffect(() => {
    if (selectedConversationId && mode === "chat" && isOpen && selectedConversationId !== currentConversationId) {
      handleSelectConversation(selectedConversationId)
    }
  }, [selectedConversationId, mode, isOpen, currentConversationId])

  const handleSelectConversation = useCallback(async (conversationId: string) => {
    try {
      const history = await agentApi.getHistory(conversationId)
      chatRef.current?.loadConversation(conversationId, history)
      setCurrentConversationId(conversationId)
      setCurrentTitle(null)
    } catch (error) {
      console.error("Failed to load conversation:", error)
    }
  }, [])

  const handleNewChat = useCallback(() => {
    chatRef.current?.clearMessages()
    setCurrentConversationId(null)
    setCurrentTitle(null)
  }, [])

  const handleTitleUpdate = useCallback((conversationId: string, newTitle: string) => {
    if (conversationId === currentConversationId || !currentConversationId) {
      setCurrentTitle(newTitle)
    }
  }, [currentConversationId])

  if (!isOpen) return null

  return (
    <div
      ref={panelRef}
      role="complementary"
      aria-label={mode === "chat" ? "Chat panel" : title}
      className="relative flex h-full flex-col border-l bg-background overflow-hidden"
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize panel"
        tabIndex={0}
        className="absolute left-0 top-0 z-10 h-full w-1 cursor-ew-resize hover:bg-primary/20 active:bg-primary/30"
        onMouseDown={startResizing}
      />

      <div className="flex h-9 shrink-0 items-center justify-between border-b px-2">
        {mode === "chat" ? (
          <>
            <ChatHistoryDropdown
              currentConversationId={currentConversationId}
              currentTitle={currentTitle}
              teamId={teamId}
              onSelectConversation={handleSelectConversation}
              onNewChat={handleNewChat}
            />
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={handleNewChat}
                title="New chat"
              >
                <Plus className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={toggle}
                title="Close panel"
              >
                <PanelRight className="size-4" />
              </Button>
            </div>
          </>
        ) : (
          <>
            <span className="px-2 text-xs font-medium uppercase tracking-wide">
              {title}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={toggle}
              title="Close panel"
            >
              <PanelRight className="size-4" />
            </Button>
          </>
        )}
      </div>

      {mode === "chat" ? (
        <Chat
          ref={chatRef}
          instanceId="panel"
          organizationId={orgId}
          teamId={teamId}
          onTitleUpdate={handleTitleUpdate}
          className="flex-1 overflow-hidden"
        />
      ) : (
        <div className="flex-1 overflow-y-auto p-4">
          {content || (
            <p className="text-sm text-muted-foreground">No content to display</p>
          )}
        </div>
      )}
    </div>
  )
}
