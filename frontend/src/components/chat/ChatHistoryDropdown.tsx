import { useState, useMemo, useRef, useEffect, memo, useCallback } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  ChevronDown,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Star,
  Trash2,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { conversationsApi, type Conversation } from "@/lib/api"
import {
  queryKeys,
  useDeleteConversation,
  useStarConversation,
  useUpdateConversation,
} from "@/lib/queries"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

interface ChatHistoryDropdownProps {
  currentConversationId?: string | null
  currentTitle?: string | null
  teamId?: string
  onSelectConversation: (conversationId: string) => void
  onNewChat: () => void
  onConversationDeleted?: (conversationId: string) => void
  className?: string
}

interface ConversationItemProps {
  conversation: Conversation
  isSelected: boolean
  teamId?: string
  onSelect: (id: string) => void
  onRename: (conversation: Conversation) => void
  onRequestDelete: (conversation: Conversation) => void
  formatDate: (date: string) => string
}

const ConversationItem = memo(function ConversationItem({
  conversation,
  isSelected,
  teamId,
  onSelect,
  onRename,
  onRequestDelete,
  formatDate,
}: ConversationItemProps) {
  const [isHovered, setIsHovered] = useState(false)
  const [actionsOpen, setActionsOpen] = useState(false)
  const starMutation = useStarConversation(teamId)

  const handleStar = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    starMutation.mutate({ id: conversation.id, isStarred: !conversation.is_starred })
    setActionsOpen(false)
  }, [starMutation, conversation.id, conversation.is_starred])

  const handleRename = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    onRename(conversation)
    setActionsOpen(false)
  }, [onRename, conversation])

  const handleDelete = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    onRequestDelete(conversation)
    setActionsOpen(false)
  }, [onRequestDelete, conversation])

  const handleClick = useCallback(() => {
    onSelect(conversation.id)
  }, [onSelect, conversation.id])

  const handleMouseEnter = useCallback(() => setIsHovered(true), [])
  const handleMouseLeave = useCallback(() => setIsHovered(false), [])
  const handleTriggerClick = useCallback((e: React.MouseEvent) => e.stopPropagation(), [])

  const showActions = isHovered || actionsOpen

  return (
    <div
      className={cn(
        "flex cursor-pointer items-center justify-between gap-2 rounded-sm px-2 py-2 text-sm hover:bg-accent",
        isSelected && "bg-accent"
      )}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-1.5 truncate text-xs font-medium">
          {conversation.is_starred && (
            <Star className="size-3 shrink-0 fill-yellow-400 text-yellow-400" />
          )}
          <span className="truncate">{conversation.title}</span>
        </span>
        <span className="text-[10px] text-muted-foreground">
          {formatDate(conversation.updated_at)}
        </span>
      </div>
      <DropdownMenu open={actionsOpen} onOpenChange={setActionsOpen}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              "shrink-0 rounded p-0.5 transition-opacity hover:bg-muted",
              showActions ? "opacity-100" : "opacity-0"
            )}
            onClick={handleTriggerClick}
            aria-label="Conversation actions"
          >
            <MoreHorizontal className="size-4 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem onClick={handleStar}>
            <Star
              className={cn(
                "mr-2 size-4",
                conversation.is_starred && "fill-yellow-400 text-yellow-400"
              )}
            />
            {conversation.is_starred ? "Unstar" : "Star"}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleRename}>
            <Pencil className="mr-2 size-4" />
            Rename
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={handleDelete}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="mr-2 size-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
})

export function ChatHistoryDropdown({
  currentConversationId,
  currentTitle,
  teamId,
  onSelectConversation,
  onNewChat,
  onConversationDeleted,
  className,
}: ChatHistoryDropdownProps) {
  const [search, setSearch] = useState("")
  const [open, setOpen] = useState(false)
  const [renameDialogOpen, setRenameDialogOpen] = useState(false)
  const [conversationToRename, setConversationToRename] = useState<Conversation | null>(null)
  const [newTitle, setNewTitle] = useState("")
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [conversationToDelete, setConversationToDelete] = useState<Conversation | null>(null)
  const renameInputRef = useRef<HTMLInputElement>(null)

  const updateMutation = useUpdateConversation(teamId)
  const deleteMutation = useDeleteConversation(teamId)

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.conversations.list(teamId),
    queryFn: () => conversationsApi.getConversations(0, 50, teamId),
    enabled: open && !!teamId,
  })

  const conversations = data?.data ?? []

  const { starred, recent } = useMemo(() => {
    let filtered = conversations
    if (search.trim()) {
      const searchLower = search.toLowerCase()
      filtered = conversations.filter((c) =>
        c.title.toLowerCase().includes(searchLower)
      )
    }
    return {
      starred: filtered.filter((c) => c.is_starred),
      recent: filtered.filter((c) => !c.is_starred),
    }
  }, [conversations, search])

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMinutes = Math.floor(diffMs / (1000 * 60))
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffMinutes < 1) return "Just now"
    if (diffHours < 1) return `${diffMinutes}m`
    if (diffHours < 24) return `${diffHours}h`
    if (diffDays === 1) return "Yesterday"
    if (diffDays < 7) return `${diffDays}d`
    if (date.getFullYear() === now.getFullYear()) {
      return date.toLocaleDateString(undefined, { month: "short", day: "numeric" })
    }
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
  }

  const handleSelect = (conversationId: string) => {
    onSelectConversation(conversationId)
    setOpen(false)
    setSearch("")
  }

  const handleNewChat = () => {
    onNewChat()
    setOpen(false)
    setSearch("")
  }

  const handleOpenRename = (conversation: Conversation) => {
    setConversationToRename(conversation)
    setNewTitle(conversation.title)
    setRenameDialogOpen(true)
  }

  const handleRename = () => {
    if (!conversationToRename || !newTitle.trim()) return
    updateMutation.mutate(
      { id: conversationToRename.id, data: { title: newTitle.trim() } },
      {
        onSuccess: () => {
          setRenameDialogOpen(false)
          setConversationToRename(null)
          setNewTitle("")
        },
      }
    )
  }

  const handleRequestDelete = (conversation: Conversation) => {
    setConversationToDelete(conversation)
    setDeleteDialogOpen(true)
  }

  const handleConfirmDelete = () => {
    if (!conversationToDelete) return
    const conversationId = conversationToDelete.id
    deleteMutation.mutate(conversationId, {
      onSuccess: () => {
        if (conversationId === currentConversationId) {
          onConversationDeleted?.(conversationId)
        }
        setDeleteDialogOpen(false)
        setConversationToDelete(null)
      },
    })
  }

  useEffect(() => {
    if (renameDialogOpen && renameInputRef.current) {
      renameInputRef.current.focus()
      renameInputRef.current.select()
    }
  }, [renameDialogOpen])

  const renderConversationItem = (conversation: Conversation) => (
    <ConversationItem
      key={conversation.id}
      conversation={conversation}
      isSelected={conversation.id === currentConversationId}
      teamId={teamId}
      onSelect={handleSelect}
      onRename={handleOpenRename}
      onRequestDelete={handleRequestDelete}
      formatDate={formatDate}
    />
  )

  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={cn("gap-1.5 text-xs font-medium", className)}
          >
            <MessageSquare className="size-3.5" />
            <span className="max-w-[120px] truncate">
              {currentConversationId
                ? currentTitle ||
                  conversations.find((c) => c.id === currentConversationId)?.title ||
                  "Chat"
                : "New Chat"}
            </span>
            <ChevronDown className={cn(
              "size-3 text-muted-foreground transition-transform duration-200",
              open && "rotate-180"
            )} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-72">
          <div className="flex items-center gap-2 p-2">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search conversations..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-7 pl-7 text-xs"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-7 shrink-0 gap-1 px-2"
              onClick={handleNewChat}
            >
              <Plus className="size-3.5" />
              New
            </Button>
          </div>
          <DropdownMenuSeparator />
          <div className="max-h-[60vh] overflow-y-auto p-1">
            {isLoading ? (
              <div className="py-4 text-center text-xs text-muted-foreground">
                Loading...
              </div>
            ) : starred.length === 0 && recent.length === 0 ? (
              <div className="py-4 text-center text-xs text-muted-foreground">
                {search ? "No conversations found" : "No conversations yet"}
              </div>
            ) : (
              <>
                {starred.length > 0 && (
                  <>
                    <div className="mb-1 px-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      Starred
                    </div>
                    {starred.map(renderConversationItem)}
                    {recent.length > 0 && (
                      <div className="mb-1 mt-3 px-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                        Recents
                      </div>
                    )}
                  </>
                )}
                {recent.map(renderConversationItem)}
              </>
            )}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rename chat</DialogTitle>
          </DialogHeader>
          <Input
            ref={renameInputRef}
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                handleRename()
              }
            }}
            placeholder="Enter new title"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleRename}
              disabled={!newTitle.trim() || updateMutation.isPending}
            >
              {updateMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete conversation?</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete "{conversationToDelete?.title}". This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
