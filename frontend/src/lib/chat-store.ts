import { create } from "zustand"
import { useShallow } from "zustand/react/shallow"

/** Shared message type for chat state */
export interface ChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
  isStreaming?: boolean
}

/** State for a single chat session */
interface ChatSession {
  messages: ChatMessage[]
  isStreaming: boolean
  error: Error | null
  conversationId: string | null
}

/** Global chat state - supports multiple concurrent sessions keyed by instanceId */
interface ChatMessagesState {
  /** Sessions keyed by instanceId (e.g., "page" or "panel") */
  sessions: Record<string, ChatSession>

  /** Get or create a session */
  getSession: (instanceId: string) => ChatSession

  /** Set messages for a session */
  setMessages: (instanceId: string, messages: ChatMessage[]) => void

  /** Update a single message in a session */
  updateMessage: (instanceId: string, messageId: string, updates: Partial<ChatMessage>) => void

  /** Add messages to a session */
  addMessages: (instanceId: string, messages: ChatMessage[]) => void

  /** Remove a message from a session */
  removeMessage: (instanceId: string, messageId: string) => void

  /** Set streaming state */
  setIsStreaming: (instanceId: string, isStreaming: boolean) => void

  /** Set error state */
  setError: (instanceId: string, error: Error | null) => void

  /** Set conversation ID */
  setConversationId: (instanceId: string, conversationId: string | null) => void

  /** Clear a session */
  clearSession: (instanceId: string) => void

  /** Sync sessions - when one session loads a conversation, sync it to others viewing same conversation */
  syncConversation: (conversationId: string, messages: ChatMessage[]) => void
}

const defaultSession: ChatSession = {
  messages: [],
  isStreaming: false,
  error: null,
  conversationId: null,
}

/** Helper to update all sessions with the same conversationId */
function updateMatchingSessions(
  sessions: Record<string, ChatSession>,
  sourceInstanceId: string,
  updater: (session: ChatSession) => ChatSession
): Record<string, ChatSession> {
  const sourceSession = sessions[sourceInstanceId]
  if (!sourceSession?.conversationId) {
    return {
      ...sessions,
      [sourceInstanceId]: updater(sourceSession ?? { ...defaultSession }),
    }
  }

  const conversationId = sourceSession.conversationId
  const newSessions = { ...sessions }

  for (const [id, session] of Object.entries(newSessions)) {
    if (session.conversationId === conversationId || id === sourceInstanceId) {
      newSessions[id] = updater(session)
    }
  }

  return newSessions
}

export const useChatMessagesStore = create<ChatMessagesState>()((set, get) => ({
  sessions: {},

  getSession: (instanceId) => {
    return get().sessions[instanceId] ?? { ...defaultSession }
  },

  setMessages: (instanceId, messages) => set((state) => ({
    sessions: updateMatchingSessions(state.sessions, instanceId, (session) => ({
      ...session,
      messages,
    })),
  })),

  updateMessage: (instanceId, messageId, updates) => set((state) => ({
    sessions: updateMatchingSessions(state.sessions, instanceId, (session) => ({
      ...session,
      messages: session.messages.map((msg) =>
        msg.id === messageId ? { ...msg, ...updates } : msg
      ),
    })),
  })),

  addMessages: (instanceId, messages) => set((state) => ({
    sessions: updateMatchingSessions(state.sessions, instanceId, (session) => ({
      ...session,
      messages: [...session.messages, ...messages],
    })),
  })),

  removeMessage: (instanceId, messageId) => set((state) => ({
    sessions: updateMatchingSessions(state.sessions, instanceId, (session) => ({
      ...session,
      messages: session.messages.filter((msg) => msg.id !== messageId),
    })),
  })),

  setIsStreaming: (instanceId, isStreaming) => set((state) => ({
    sessions: updateMatchingSessions(state.sessions, instanceId, (session) => ({
      ...session,
      isStreaming,
    })),
  })),

  setError: (instanceId, error) => set((state) => ({
    sessions: updateMatchingSessions(state.sessions, instanceId, (session) => ({
      ...session,
      error,
    })),
  })),

  setConversationId: (instanceId, conversationId) => set((state) => ({
    sessions: {
      ...state.sessions,
      [instanceId]: {
        ...state.sessions[instanceId] ?? defaultSession,
        conversationId,
      },
    },
  })),

  clearSession: (instanceId) => set((state) => ({
    sessions: {
      ...state.sessions,
      [instanceId]: { ...defaultSession },
    },
  })),

  syncConversation: (conversationId, messages) => set((state) => {
    const newSessions = { ...state.sessions }
    for (const [id, session] of Object.entries(newSessions)) {
      if (session.conversationId === conversationId) {
        newSessions[id] = {
          ...session,
          messages,
        }
      }
    }
    return { sessions: newSessions }
  }),
}))

interface ChatPageState {
  selectedConversationId: string | null
  currentTitle: string | null
  searchQuery: string
  editingId: string | null
  editingTitle: string

  setSelectedConversation: (id: string | null, title: string | null) => void
  setCurrentTitle: (title: string | null) => void
  setSearchQuery: (query: string) => void
  startEditing: (id: string, title: string) => void
  setEditingTitle: (title: string) => void
  cancelEditing: () => void
  clearSelection: () => void
}

export const useChatPageStore = create<ChatPageState>()((set) => ({
  selectedConversationId: null,
  currentTitle: null,
  searchQuery: "",
  editingId: null,
  editingTitle: "",

  setSelectedConversation: (id, title) =>
    set({ selectedConversationId: id, currentTitle: title }),

  setCurrentTitle: (title) => set({ currentTitle: title }),

  setSearchQuery: (query) => set({ searchQuery: query }),

  startEditing: (id, title) => set({ editingId: id, editingTitle: title }),

  setEditingTitle: (title) => set({ editingTitle: title }),

  cancelEditing: () => set({ editingId: null, editingTitle: "" }),

  clearSelection: () =>
    set({ selectedConversationId: null, currentTitle: null }),
}))

/** Selector for conversation selection state */
export function useChatSelection() {
  return useChatPageStore(
    useShallow((state) => ({
      selectedConversationId: state.selectedConversationId,
      currentTitle: state.currentTitle,
      setSelectedConversation: state.setSelectedConversation,
      setCurrentTitle: state.setCurrentTitle,
      clearSelection: state.clearSelection,
    }))
  )
}

/** Selector for search state */
export function useChatSearch() {
  return useChatPageStore(
    useShallow((state) => ({
      searchQuery: state.searchQuery,
      setSearchQuery: state.setSearchQuery,
    }))
  )
}

/** Selector for editing state */
export function useChatEditing() {
  return useChatPageStore(
    useShallow((state) => ({
      editingId: state.editingId,
      editingTitle: state.editingTitle,
      startEditing: state.startEditing,
      setEditingTitle: state.setEditingTitle,
      cancelEditing: state.cancelEditing,
    }))
  )
}
