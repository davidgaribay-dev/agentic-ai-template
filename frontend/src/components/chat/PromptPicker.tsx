import * as React from "react"
import { useState, useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  FileText,
  Building2,
  Users,
  User,
  Search,
  Loader2,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { promptsApi, type Prompt } from "@/lib/api"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"

interface PromptPickerProps {
  organizationId?: string
  teamId?: string
  onSelect: (content: string) => void
  disabled?: boolean
}

export function PromptPicker({
  organizationId,
  teamId,
  onSelect,
  disabled = false,
}: PromptPickerProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")

  // Fetch available prompts when we have org/team context
  const { data: availablePrompts, isLoading: isLoadingAvailable } = useQuery({
    queryKey: ["available-prompts", organizationId, teamId],
    queryFn: () => promptsApi.getAvailablePrompts(organizationId!, teamId!, "template"),
    enabled: open && !!organizationId && !!teamId,
  })

  // Fetch user prompts (always available)
  const { data: userPrompts, isLoading: isLoadingUser } = useQuery({
    queryKey: ["user-prompts-templates"],
    queryFn: () => promptsApi.listUserPrompts("template"),
    enabled: open,
  })

  const isLoading = isLoadingAvailable || isLoadingUser

  // Combine prompts into groups
  const promptGroups = useMemo(() => {
    const groups: Array<{
      label: string
      icon: React.ReactNode
      prompts: Prompt[]
    }> = []

    // Add org prompts if available
    if (availablePrompts?.org_prompts?.length) {
      groups.push({
        label: "Organization",
        icon: <Building2 className="h-4 w-4" />,
        prompts: availablePrompts.org_prompts,
      })
    }

    // Add team prompts if available
    if (availablePrompts?.team_prompts?.length) {
      groups.push({
        label: "Team",
        icon: <Users className="h-4 w-4" />,
        prompts: availablePrompts.team_prompts,
      })
    }

    // Add user prompts (from the separate user prompts query or from availablePrompts)
    const personalPrompts = availablePrompts?.user_prompts ?? userPrompts?.data ?? []
    if (personalPrompts.length) {
      groups.push({
        label: "Personal",
        icon: <User className="h-4 w-4" />,
        prompts: personalPrompts,
      })
    }

    return groups
  }, [availablePrompts, userPrompts])

  // Filter prompts based on search
  const filteredGroups = useMemo(() => {
    if (!search.trim()) return promptGroups

    const searchLower = search.toLowerCase()
    return promptGroups
      .map((group) => ({
        ...group,
        prompts: group.prompts.filter(
          (p) =>
            p.name.toLowerCase().includes(searchLower) ||
            p.description?.toLowerCase().includes(searchLower)
        ),
      }))
      .filter((group) => group.prompts.length > 0)
  }, [promptGroups, search])

  const totalPrompts = promptGroups.reduce((acc, g) => acc + g.prompts.length, 0)

  const handleSelect = (prompt: Prompt) => {
    onSelect(prompt.content)
    setOpen(false)
    setSearch("")
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          disabled={disabled}
          className="h-8 w-8 rounded-full"
          aria-label="Insert template"
        >
          <FileText className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-80 p-0"
        align="start"
        side="top"
        sideOffset={8}
      >
        <div className="flex flex-col">
          {/* Header */}
          <div className="border-b px-3 py-2">
            <h4 className="text-sm font-medium">Insert Template</h4>
            <p className="text-xs text-muted-foreground">
              Choose a prompt template to insert
            </p>
          </div>

          {/* Search */}
          <div className="border-b p-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search templates..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 pl-8 text-sm"
              />
            </div>
          </div>

          {/* Content */}
          <ScrollArea className="max-h-[300px]">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : totalPrompts === 0 ? (
              <div className="py-8 text-center">
                <FileText className="mx-auto h-8 w-8 text-muted-foreground/50" />
                <p className="mt-2 text-sm text-muted-foreground">
                  No templates available
                </p>
                <p className="text-xs text-muted-foreground">
                  Create templates in settings
                </p>
              </div>
            ) : filteredGroups.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-sm text-muted-foreground">
                  No templates match "{search}"
                </p>
              </div>
            ) : (
              <div className="p-1">
                {filteredGroups.map((group, groupIndex) => (
                  <div key={group.label}>
                    {groupIndex > 0 && <div className="my-1 border-t" />}
                    <div className="flex items-center gap-2 px-2 py-1.5">
                      <span className="text-muted-foreground">{group.icon}</span>
                      <span className="text-xs font-medium text-muted-foreground">
                        {group.label}
                      </span>
                    </div>
                    {group.prompts.map((prompt) => (
                      <button
                        key={prompt.id}
                        onClick={() => handleSelect(prompt)}
                        className={cn(
                          "w-full rounded-md px-2 py-2 text-left",
                          "hover:bg-accent focus:bg-accent focus:outline-none",
                          "transition-colors"
                        )}
                      >
                        <p className="text-sm font-medium">{prompt.name}</p>
                        {prompt.description && (
                          <p className="text-xs text-muted-foreground line-clamp-1">
                            {prompt.description}
                          </p>
                        )}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      </PopoverContent>
    </Popover>
  )
}
