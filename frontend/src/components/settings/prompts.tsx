import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import {
  Loader2,
  Trash2,
  Plus,
  Power,
  Pencil,
  ChevronDown,
  ChevronRight,
} from "lucide-react"
import {
  promptsApi,
  type Prompt,
  type PromptCreate,
  type PromptUpdate,
  type PromptType,
  ApiError,
} from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"

type PromptScope =
  | { type: "user" }
  | { type: "org"; orgId: string }
  | { type: "team"; orgId: string; teamId: string }

function getQueryKey(scope: PromptScope): string[] {
  switch (scope.type) {
    case "user":
      return ["user-prompts"]
    case "org":
      return ["org-prompts", scope.orgId]
    case "team":
      return ["team-prompts", scope.orgId, scope.teamId]
  }
}

function activatePrompt(scope: PromptScope, promptId: string) {
  switch (scope.type) {
    case "user":
      return promptsApi.activateUserPrompt(promptId)
    case "org":
      return promptsApi.activateOrgPrompt(scope.orgId, promptId)
    case "team":
      return promptsApi.activateTeamPrompt(scope.orgId, scope.teamId, promptId)
  }
}

function createPrompt(scope: PromptScope, data: PromptCreate) {
  switch (scope.type) {
    case "user":
      return promptsApi.createUserPrompt(data)
    case "org":
      return promptsApi.createOrgPrompt(scope.orgId, data)
    case "team":
      return promptsApi.createTeamPrompt(scope.orgId, scope.teamId, data)
  }
}

function updatePrompt(scope: PromptScope, promptId: string, data: PromptUpdate) {
  switch (scope.type) {
    case "user":
      return promptsApi.updateUserPrompt(promptId, data)
    case "org":
      return promptsApi.updateOrgPrompt(scope.orgId, promptId, data)
    case "team":
      return promptsApi.updateTeamPrompt(scope.orgId, scope.teamId, promptId, data)
  }
}

function deletePrompt(scope: PromptScope, promptId: string) {
  switch (scope.type) {
    case "user":
      return promptsApi.deleteUserPrompt(promptId)
    case "org":
      return promptsApi.deleteOrgPrompt(scope.orgId, promptId)
    case "team":
      return promptsApi.deleteTeamPrompt(scope.orgId, scope.teamId, promptId)
  }
}

interface PromptRowProps {
  prompt: Prompt
  scope: PromptScope
  compact?: boolean
}

export function PromptRow({ prompt, scope, compact = false }: PromptRowProps) {
  const queryClient = useQueryClient()
  const [expanded, setExpanded] = useState(false)

  const activateMutation = useMutation({
    mutationFn: () => activatePrompt(scope, prompt.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getQueryKey(scope) })
    },
  })

  const isSystem = prompt.prompt_type === "system"

  const sizes = compact
    ? { container: "rounded-md", text: "text-xs", icon: "size-3", badge: "text-[10px] h-4", pre: "text-[10px] max-h-24", padding: "px-2.5 py-2", expandPadding: "px-2.5 pb-2" }
    : { container: "rounded-lg", text: "text-sm", icon: "size-3.5", badge: "text-xs h-5", pre: "text-xs max-h-32", padding: "px-3 py-2.5", expandPadding: "px-3 pb-3" }

  return (
    <div className={`group ${sizes.container} bg-muted/30 hover:bg-muted/50 transition-colors`}>
      <div
        className={`flex items-center justify-between ${sizes.padding} cursor-pointer`}
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2 min-w-0">
          <button className="text-muted-foreground hover:text-foreground">
            {expanded ? <ChevronDown className={sizes.icon} /> : <ChevronRight className={sizes.icon} />}
          </button>
          <span className={`${sizes.text} font-medium truncate`}>{prompt.name}</span>
          {isSystem && prompt.is_active && (
            <Badge variant="secondary" className={`bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-0 ${sizes.badge}`}>
              Active
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
          {isSystem && !prompt.is_active && (
            <Button
              variant="ghost"
              size="sm"
              className={compact ? "h-6 text-[10px] px-1.5" : "h-7 text-xs"}
              onClick={() => activateMutation.mutate()}
              disabled={activateMutation.isPending}
            >
              {activateMutation.isPending ? (
                <Loader2 className={compact ? "size-2.5 animate-spin" : "size-3 animate-spin"} />
              ) : (
                <Power className={compact ? "size-2.5" : "size-3"} />
              )}
            </Button>
          )}
          <EditPromptDialog prompt={prompt} scope={scope} compact={compact} />
          <DeletePromptButton prompt={prompt} scope={scope} compact={compact} />
        </div>
      </div>
      {expanded && (
        <div className={sizes.expandPadding}>
          {prompt.description && (
            <p className={`${compact ? "text-[10px]" : "text-xs"} text-muted-foreground mb-${compact ? "1.5" : "2"}`}>{prompt.description}</p>
          )}
          <pre className={`${sizes.pre} text-muted-foreground bg-background/50 rounded p-${compact ? "1.5" : "2"} whitespace-pre-wrap font-mono overflow-auto`}>
            {prompt.content}
          </pre>
        </div>
      )}
    </div>
  )
}

interface CreatePromptDialogProps {
  scope: PromptScope
  defaultType?: PromptType
  compact?: boolean
}

export function CreatePromptDialog({ scope, defaultType = "template", compact = false }: CreatePromptDialogProps) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [content, setContent] = useState("")
  const [error, setError] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const createMutation = useMutation({
    mutationFn: (data: PromptCreate) => createPrompt(scope, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getQueryKey(scope) })
      resetForm()
    },
    onError: (err: ApiError) => {
      setError((err.body as { detail?: string })?.detail || "Failed to create prompt")
    },
  })

  const resetForm = () => {
    setName("")
    setDescription("")
    setContent("")
    setError(null)
    setOpen(false)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !content.trim()) {
      setError("Name and content are required")
      return
    }
    createMutation.mutate({
      name: name.trim(),
      description: description.trim() || null,
      content: content.trim(),
      prompt_type: defaultType,
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className={compact ? "h-5 text-[10px] px-1.5" : "h-7 text-xs"}>
          <Plus className={compact ? "size-2.5 mr-0.5" : "size-3 mr-1"} />
          Add
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">
            Create {defaultType === "system" ? "System Prompt" : "Template"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-3 py-3">
            <div className="space-y-1.5">
              <Label htmlFor="name" className="text-xs">Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => { setName(e.target.value); setError(null) }}
                placeholder="e.g., My Writing Style"
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="description" className="text-xs">Description (optional)</Label>
              <Input
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description"
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="content" className="text-xs">Content</Label>
              <Textarea
                id="content"
                value={content}
                onChange={(e) => { setContent(e.target.value); setError(null) }}
                placeholder={
                  defaultType === "system"
                    ? "Always respond in a concise manner..."
                    : "Enter the template text..."
                }
                rows={4}
                className="font-mono text-sm"
              />
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" size="sm" onClick={resetForm}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={createMutation.isPending}>
              {createMutation.isPending && <Loader2 className="mr-1.5 size-3 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

interface EditPromptDialogProps {
  prompt: Prompt
  scope: PromptScope
  compact?: boolean
}

export function EditPromptDialog({ prompt, scope, compact = false }: EditPromptDialogProps) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(prompt.name)
  const [description, setDescription] = useState(prompt.description ?? "")
  const [content, setContent] = useState(prompt.content)
  const [error, setError] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const updateMutation = useMutation({
    mutationFn: (data: PromptUpdate) => updatePrompt(scope, prompt.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getQueryKey(scope) })
      setOpen(false)
      setError(null)
    },
    onError: (err: ApiError) => {
      setError((err.body as { detail?: string })?.detail || "Failed to update prompt")
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !content.trim()) {
      setError("Name and content are required")
      return
    }
    updateMutation.mutate({
      name: name.trim(),
      description: description.trim() || null,
      content: content.trim(),
    })
  }

  const resetForm = () => {
    setName(prompt.name)
    setDescription(prompt.description ?? "")
    setContent(prompt.content)
    setError(null)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        setOpen(isOpen)
        if (!isOpen) resetForm()
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className={compact ? "size-6" : "size-7"}>
          <Pencil className={compact ? "size-2.5" : "size-3"} />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Edit Prompt</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-3 py-3">
            <div className="space-y-1.5">
              <Label htmlFor="edit-name" className="text-xs">Name</Label>
              <Input
                id="edit-name"
                value={name}
                onChange={(e) => { setName(e.target.value); setError(null) }}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-description" className="text-xs">Description (optional)</Label>
              <Input
                id="edit-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-content" className="text-xs">Content</Label>
              <Textarea
                id="edit-content"
                value={content}
                onChange={(e) => { setContent(e.target.value); setError(null) }}
                rows={4}
                className="font-mono text-sm"
              />
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={updateMutation.isPending}>
              {updateMutation.isPending && <Loader2 className="mr-1.5 size-3 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

interface DeletePromptButtonProps {
  prompt: Prompt
  scope: PromptScope
  compact?: boolean
}

export function DeletePromptButton({ prompt, scope, compact = false }: DeletePromptButtonProps) {
  const queryClient = useQueryClient()

  const deleteMutation = useMutation({
    mutationFn: () => deletePrompt(scope, prompt.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getQueryKey(scope) })
    },
  })

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="icon" className={`${compact ? "size-6" : "size-7"} text-muted-foreground hover:text-destructive`}>
          <Trash2 className={compact ? "size-2.5" : "size-3"} />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Prompt</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete "{prompt.name}"? This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => deleteMutation.mutate()}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {deleteMutation.isPending ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Deleting...
              </>
            ) : (
              "Delete"
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
