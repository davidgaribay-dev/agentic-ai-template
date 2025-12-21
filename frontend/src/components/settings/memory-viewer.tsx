import { useState } from "react"
import { Brain, Trash2, Loader2, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { useWorkspace } from "@/lib/workspace"
import { useUserMemories, useDeleteMemory, useClearAllMemories } from "@/lib/queries"
import type { MemoryType } from "@/lib/api"

const memoryTypeColors: Record<MemoryType, string> = {
  preference: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
  fact: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
  entity: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300",
  relationship: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300",
  summary: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300",
}

const memoryTypeLabels: Record<MemoryType, string> = {
  preference: "Preference",
  fact: "Fact",
  entity: "Entity",
  relationship: "Relationship",
  summary: "Summary",
}

function formatDate(dateString: string): string {
  try {
    const date = new Date(dateString)
    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    })
  } catch {
    return dateString
  }
}

export function MemoryViewer() {
  const { currentOrg, currentTeam } = useWorkspace()
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const orgId = currentOrg?.id
  const teamId = currentTeam?.id

  const { data: memoriesResponse, isLoading, error } = useUserMemories(orgId, teamId)
  const deleteMutation = useDeleteMemory(orgId, teamId)
  const clearMutation = useClearAllMemories(orgId, teamId)

  const memories = memoriesResponse?.data ?? []

  const handleDeleteMemory = async (memoryId: string) => {
    setDeletingId(memoryId)
    try {
      await deleteMutation.mutateAsync(memoryId)
    } finally {
      setDeletingId(null)
    }
  }

  const handleClearAll = async () => {
    await clearMutation.mutateAsync()
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 py-4 text-destructive">
        <AlertCircle className="h-4 w-4" />
        <span>Failed to load memories</span>
      </div>
    )
  }

  if (memories.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <Brain className="h-12 w-12 text-muted-foreground/50 mb-4" />
        <p className="text-muted-foreground">No memories yet</p>
        <p className="text-sm text-muted-foreground/75 mt-1">
          As you chat, important information will be remembered here.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">
          {memories.length} {memories.length === 1 ? "memory" : "memories"} stored
        </p>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="destructive"
              size="sm"
              disabled={clearMutation.isPending}
            >
              {clearMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Clear All
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Clear all memories?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete all {memories.length} memories. This action
                cannot be undone. The AI will no longer remember information from
                your previous conversations.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleClearAll}>
                Clear All
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <ul className="space-y-2">
        {memories.map((memory) => (
          <li
            key={memory.id}
            className="flex justify-between items-start p-3 border rounded-lg hover:bg-muted/50 transition-colors"
          >
            <div className="flex-1 min-w-0 pr-4">
              <div className="flex items-center gap-2 mb-1">
                <Badge
                  variant="secondary"
                  className={memoryTypeColors[memory.type] || memoryTypeColors.fact}
                >
                  {memoryTypeLabels[memory.type] || memory.type}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {formatDate(memory.created_at)}
                </span>
              </div>
              <p className="text-sm">{memory.content}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={() => handleDeleteMemory(memory.id)}
              disabled={deletingId === memory.id}
            >
              {deletingId === memory.id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  )
}
