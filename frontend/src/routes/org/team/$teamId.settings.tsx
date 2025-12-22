import { useState, useEffect, useMemo } from "react"
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router"
import { z } from "zod"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  Users,
  Loader2,
  Shield,
  User,
  Eye,
  UserMinus,
  Key,
  MessageSquare,
  Sparkles,
  Settings2,
  MoreHorizontal,
  ChevronDown,
  ChevronRight,
  Plus,
  Brain,
  Plug,
  Palette,
} from "lucide-react"
import { useAuth } from "@/lib/auth"
import {
  useWorkspace,
  useOrganizationMembers,
} from "@/lib/workspace"
import {
  teamsApi,
  promptsApi,
  apiKeysApi,
  type TeamRole,
  type TeamMember,
  type OrganizationChatSettings,
  type TeamChatSettings,
  type LLMProvider,
  ApiError,
} from "@/lib/api"
import {
  useOrgChatSettings,
  useTeamChatSettings,
  useUpdateTeamChatSettings,
} from "@/lib/queries"
import { ChatSettings } from "@/components/chat-settings"
import { MemorySettings } from "@/components/settings/memory-settings"
import {
  PromptRow,
  CreatePromptDialog,
  ProviderRow,
  DefaultProviderSelector,
  TeamDangerZone,
  TeamDetailsSection,
  MCPSettings,
  MCPServersList,
} from "@/components/settings"
import { TeamThemeSettings } from "@/components/settings/team-theme-settings"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { isValidImageUrl, getInitials } from "@/lib/utils"
import type { ColumnDef } from "@tanstack/react-table"
import { DataTable } from "@/components/ui/data-table"

const teamSettingsSearchSchema = z.object({
  tab: z.enum(["general", "people", "ai", "preferences", "theme"]).optional(),
})

type TeamSettingsTab = z.infer<typeof teamSettingsSearchSchema>["tab"]

export const Route = createFileRoute("/org/team/$teamId/settings")({
  beforeLoad: ({ context }) => {
    if (!context.auth.isAuthenticated && !context.auth.isLoading) {
      throw redirect({ to: "/login" })
    }
  },
  component: TeamSettingsPage,
  validateSearch: teamSettingsSearchSchema,
})

function TeamSettingsPage() {
  const navigate = useNavigate()
  const { teamId } = Route.useParams()
  const { tab: tabFromUrl } = Route.useSearch()

  const currentTab = tabFromUrl || "general"

  const handleTabChange = (value: string) => {
    navigate({ to: "/org/team/$teamId/settings", params: { teamId }, search: { tab: value as TeamSettingsTab }, replace: true })
  }
  const { currentOrg, currentOrgRole, teams, switchTeam, refresh } = useWorkspace()

  const team = teams.find(t => t.id === teamId)

  useEffect(() => {
    if (currentOrg && teams.length > 0 && !team) {
      navigate({ to: "/org/settings" })
    }
  }, [currentOrg, teams, team, navigate])

  useEffect(() => {
    if (team) {
      switchTeam(team.id)
    }
  }, [team, switchTeam])

  const { data: teamMembersData, isLoading: isLoadingMembers } = useQuery({
    queryKey: ["team-members", currentOrg?.id, teamId],
    queryFn: () => teamsApi.getMembers(currentOrg!.id, teamId),
    enabled: !!currentOrg && !!teamId,
  })
  const teamMembers = teamMembersData?.data ?? []

  const { user } = useAuth()
  const currentUserMember = teamMembers.find(m => m.user_id === user?.id)
  const currentTeamRole = currentUserMember?.role

  const isOrgAdmin = currentOrgRole === "owner" || currentOrgRole === "admin"
  const isTeamAdmin = currentTeamRole === "admin"
  const canManageTeam = isOrgAdmin || isTeamAdmin

  const tabs = [
    { value: "general", label: "General", icon: Users },
    { value: "people", label: "People", icon: User },
    { value: "ai", label: "AI Configuration", icon: Sparkles },
    { value: "preferences", label: "Preferences", icon: Settings2 },
    { value: "theme", label: "Theme", icon: Palette },
  ]

  if (!currentOrg || !team) {
    return (
      <div className="bg-background min-h-screen">
        <div className="mx-auto max-w-5xl px-6 py-8">
          <div className="mb-6">
            <div className="flex items-center gap-3">
              <Skeleton className="size-10 rounded-full" />
              <div className="space-y-1.5">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
          </div>
          <div className="flex gap-6">
            <Skeleton className="h-8 w-48" />
            <div className="flex-1 space-y-4">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-background min-h-screen">
      <div className="mx-auto max-w-5xl px-6 py-8">
        <h1 className="text-lg font-semibold mb-6">Team Settings</h1>
        <Tabs value={currentTab} onValueChange={handleTabChange} orientation="vertical" className="flex gap-6">
          <div className="w-48 flex-shrink-0">
            <div className="sticky top-6">
              <TabsList className="flex flex-col items-stretch h-auto bg-transparent p-0 space-y-0.5">
                {tabs.map((tab) => (
                  <TabsTrigger
                    key={tab.value}
                    value={tab.value}
                    className="justify-start px-2.5 py-1.5 h-auto text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 data-[state=active]:bg-muted data-[state=active]:text-foreground rounded-md"
                  >
                    <tab.icon className="mr-2 size-3.5" />
                    {tab.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <TabsContent value="general" className="mt-0 space-y-6">
              {canManageTeam && (
                <TeamDetailsSection orgId={currentOrg.id} team={team} onUpdate={refresh} />
              )}
              <TeamDangerZone
                orgId={currentOrg.id}
                teamId={team.id}
                teamName={team.name}
                canDelete={canManageTeam}
                memberCount={teamMembers.length}
                onLeave={() => {
                  switchTeam(null)
                  navigate({ to: "/" })
                }}
                onDelete={() => {
                  switchTeam(null)
                  navigate({ to: "/org/settings" })
                }}
              />
            </TabsContent>

            <TabsContent value="people" className="mt-0 space-y-4">
              <MembersSection
                orgId={currentOrg.id}
                teamId={team.id}
                members={teamMembers}
                isLoading={isLoadingMembers}
                canManage={canManageTeam}
                isOrgAdmin={isOrgAdmin}
                currentUserId={user?.id}
                onUpdate={refresh}
              />
            </TabsContent>

            {canManageTeam && (
              <>
                <TabsContent value="ai" className="mt-0 space-y-4">
                  <AIConfigurationSection orgId={currentOrg.id} teamId={team.id} />
                </TabsContent>

                <TabsContent value="preferences" className="mt-0 space-y-4">
                  <ChatFeaturesSection orgId={currentOrg.id} teamId={team.id} />
                </TabsContent>

                <TabsContent value="theme" className="mt-0">
                  <TeamThemeSettings orgId={currentOrg.id} teamId={team.id} />
                </TabsContent>
              </>
            )}
          </div>
        </Tabs>
      </div>
    </div>
  )
}

type TeamMemberRow = {
  id: string
  user_id: string
  role: TeamRole
  org_role: string
  user_email: string
  user_full_name: string | null
  user_profile_image_url: string | null
}

interface MembersSectionProps {
  orgId: string
  teamId: string
  members: TeamMember[]
  isLoading: boolean
  canManage: boolean
  isOrgAdmin: boolean
  currentUserId?: string
  onUpdate: () => void
}

function MembersSection({
  orgId,
  teamId,
  members,
  isLoading,
  canManage,
  isOrgAdmin,
  currentUserId,
  onUpdate,
}: MembersSectionProps) {
  const queryClient = useQueryClient()
  const [addMemberOpen, setAddMemberOpen] = useState(false)
  const [selectedUserId, setSelectedUserId] = useState<string>("")
  const [selectedRole, setSelectedRole] = useState<TeamRole>("member")
  const [error, setError] = useState<string | null>(null)

  const { data: orgMembersData } = useOrganizationMembers(orgId)
  const orgMembers = orgMembersData?.data ?? []

  const teamUserIds = new Set(members.map(m => m.user_id))
  const availableOrgMembers = orgMembers.filter(m => !teamUserIds.has(m.user_id))

  const addMemberMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: TeamRole }) =>
      teamsApi.addMember(orgId, teamId, userId, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-members", orgId, teamId] })
      onUpdate()
      resetAddDialog()
    },
    onError: (err: ApiError) => {
      const detail = (err.body as { detail?: string })?.detail
      setError(detail || "Failed to add member")
    },
  })

  const updateRoleMutation = useMutation({
    mutationFn: ({ memberId, role }: { memberId: string; role: TeamRole }) =>
      teamsApi.updateMemberRole(orgId, teamId, memberId, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-members", orgId, teamId] })
      onUpdate()
    },
  })

  const removeMemberMutation = useMutation({
    mutationFn: (memberId: string) => teamsApi.removeMember(orgId, teamId, memberId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-members", orgId, teamId] })
      onUpdate()
    },
  })

  const handleAddMember = () => {
    if (!selectedUserId) return
    setError(null)
    addMemberMutation.mutate({ userId: selectedUserId, role: selectedRole })
  }

  const resetAddDialog = () => {
    setSelectedUserId("")
    setSelectedRole("member")
    setError(null)
    setAddMemberOpen(false)
  }

  const getRoleBadge = (role: TeamRole) => {
    switch (role) {
      case "admin":
        return (
          <Badge variant="secondary" className="bg-blue-500/15 text-blue-600 dark:text-blue-400 border-0 text-xs h-5">
            <Shield className="mr-1 size-2.5" />
            Admin
          </Badge>
        )
      case "member":
        return (
          <Badge variant="outline" className="text-muted-foreground text-xs h-5">
            <User className="mr-1 size-2.5" />
            Member
          </Badge>
        )
      case "viewer":
        return (
          <Badge variant="outline" className="text-muted-foreground text-xs h-5">
            <Eye className="mr-1 size-2.5" />
            Viewer
          </Badge>
        )
    }
  }

  const memberColumns: ColumnDef<TeamMemberRow>[] = useMemo(() => [
    {
      accessorKey: "user_full_name",
      header: "Member",
      cell: ({ row }) => {
        const member = row.original
        const isCurrentUser = member.user_id === currentUserId
        return (
          <div className="flex items-center gap-2.5">
            {isValidImageUrl(member.user_profile_image_url) ? (
              <img
                src={member.user_profile_image_url}
                alt={member.user_full_name || member.user_email}
                className="size-7 rounded-full object-cover"
              />
            ) : (
              <div className="flex size-7 items-center justify-center rounded-full bg-gradient-to-br from-primary/80 to-primary">
                <span className="text-xs font-medium text-primary-foreground">
                  {getInitials(member.user_full_name, member.user_email)}
                </span>
              </div>
            )}
            <div className="min-w-0">
              <div className="text-sm font-medium truncate flex items-center gap-1">
                {member.user_full_name || member.user_email}
                {isCurrentUser && <span className="text-xs text-muted-foreground">(you)</span>}
              </div>
              {member.user_full_name && (
                <div className="text-xs text-muted-foreground truncate">{member.user_email}</div>
              )}
            </div>
          </div>
        )
      },
    },
    {
      accessorKey: "role",
      header: "Role",
      cell: ({ row }) => getRoleBadge(row.original.role),
    },
    {
      id: "actions",
      header: () => <div className="text-right">Actions</div>,
      cell: ({ row }) => {
        const member = row.original
        const isCurrentUser = member.user_id === currentUserId
        const canManageMember = canManage && !isCurrentUser
        const canChangeRole = canManageMember && (isOrgAdmin || member.role !== "admin")

        if (!canManageMember) return null

        return (
          <div className="flex justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="size-7">
                  <MoreHorizontal className="size-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                {canChangeRole && (
                  <>
                    <DropdownMenuItem
                      onClick={() => updateRoleMutation.mutate({ memberId: member.id, role: "admin" })}
                      disabled={member.role === "admin"}
                    >
                      <Shield className="mr-2 size-3.5" />
                      Admin
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => updateRoleMutation.mutate({ memberId: member.id, role: "member" })}
                      disabled={member.role === "member"}
                    >
                      <User className="mr-2 size-3.5" />
                      Member
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => updateRoleMutation.mutate({ memberId: member.id, role: "viewer" })}
                      disabled={member.role === "viewer"}
                    >
                      <Eye className="mr-2 size-3.5" />
                      Viewer
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <DropdownMenuItem
                      onSelect={(e) => e.preventDefault()}
                      className="text-destructive focus:text-destructive"
                    >
                      <UserMinus className="mr-2 size-3.5" />
                      Remove
                    </DropdownMenuItem>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Remove Member</AlertDialogTitle>
                      <AlertDialogDescription>
                        Remove {member.user_full_name || member.user_email} from this team?
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => removeMemberMutation.mutate(member.id)}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Remove
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )
      },
    },
  ], [currentUserId, canManage, isOrgAdmin, updateRoleMutation, removeMemberMutation])

  const memberData: TeamMemberRow[] = useMemo(() =>
    members.map((m) => ({
      id: m.id,
      user_id: m.user_id,
      role: m.role,
      org_role: m.org_role,
      user_email: m.user_email,
      user_full_name: m.user_full_name,
      user_profile_image_url: m.user_profile_image_url,
    })),
  [members])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between py-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Users className="size-4" />
          Members
          <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
            {members.length}
          </Badge>
        </div>
        {canManage && availableOrgMembers.length > 0 && (
          <Dialog open={addMemberOpen} onOpenChange={(open) => open ? setAddMemberOpen(true) : resetAddDialog()}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 text-xs">
                <Plus className="size-3 mr-1" />
                Add
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="text-base">Add Member</DialogTitle>
                <DialogDescription className="text-xs">
                  Add an organization member to this team.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 py-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Member</Label>
                  <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="Choose a member..." />
                    </SelectTrigger>
                    <SelectContent>
                      {availableOrgMembers.map((member) => (
                        <SelectItem key={member.user_id} value={member.user_id}>
                          {member.user_full_name || member.user_email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Role</Label>
                  <Select value={selectedRole} onValueChange={(v) => setSelectedRole(v as TeamRole)}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="viewer">Viewer</SelectItem>
                      <SelectItem value="member">Member</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {error && <p className="text-xs text-destructive">{error}</p>}
              </div>
              <DialogFooter>
                <Button variant="ghost" size="sm" onClick={resetAddDialog}>
                  Cancel
                </Button>
                <Button size="sm" onClick={handleAddMember} disabled={!selectedUserId || addMemberMutation.isPending}>
                  {addMemberMutation.isPending && <Loader2 className="mr-1.5 size-3 animate-spin" />}
                  Add
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : members.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">
          No members yet
        </p>
      ) : (
        <DataTable columns={memberColumns} data={memberData} searchKey="user_full_name" searchPlaceholder="Search members..." />
      )}
    </div>
  )
}

function AIConfigurationSection({ orgId, teamId }: { orgId: string; teamId: string }) {
  const [promptsOpen, setPromptsOpen] = useState(true)
  const [apiKeysOpen, setApiKeysOpen] = useState(true)

  return (
    <div className="space-y-4">
      <Collapsible open={promptsOpen} onOpenChange={setPromptsOpen}>
        <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium hover:text-foreground/80 py-2">
          {promptsOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          <Sparkles className="size-4" />
          Prompts & Templates
        </CollapsibleTrigger>
        <CollapsibleContent>
          <PromptsSection orgId={orgId} teamId={teamId} />
        </CollapsibleContent>
      </Collapsible>

      <div className="border-t" />

      <Collapsible open={apiKeysOpen} onOpenChange={setApiKeysOpen}>
        <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium hover:text-foreground/80 py-2">
          {apiKeysOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          <Key className="size-4" />
          API Keys
        </CollapsibleTrigger>
        <CollapsibleContent>
          <ApiKeysSection orgId={orgId} teamId={teamId} />
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}

function PromptsSection({ orgId, teamId }: { orgId: string; teamId: string }) {
  const { data: promptsData, isLoading } = useQuery({
    queryKey: ["team-prompts", orgId, teamId],
    queryFn: () => promptsApi.listTeamPrompts(orgId, teamId),
  })

  const prompts = promptsData?.data ?? []
  const systemPrompts = prompts.filter((p) => p.prompt_type === "system")
  const templatePrompts = prompts.filter((p) => p.prompt_type === "template")

  const [systemOpen, setSystemOpen] = useState(true)
  const [templatesOpen, setTemplatesOpen] = useState(true)

  const scope = { type: "team" as const, orgId, teamId }

  return (
    <div className="pl-6 space-y-3">
      <Collapsible open={systemOpen} onOpenChange={setSystemOpen}>
        <div className="flex items-center justify-between py-1">
          <CollapsibleTrigger className="flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground">
            {systemOpen ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
            System Prompts
            <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">
              {systemPrompts.length}
            </Badge>
          </CollapsibleTrigger>
          <CreatePromptDialog scope={scope} defaultType="system" compact />
        </div>
        <CollapsibleContent className="space-y-1.5">
          {isLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            </div>
          ) : systemPrompts.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2 text-center">No system prompts</p>
          ) : (
            systemPrompts.map((prompt) => (
              <PromptRow key={prompt.id} prompt={prompt} scope={scope} compact />
            ))
          )}
        </CollapsibleContent>
      </Collapsible>

      <Collapsible open={templatesOpen} onOpenChange={setTemplatesOpen}>
        <div className="flex items-center justify-between py-1">
          <CollapsibleTrigger className="flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground">
            {templatesOpen ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
            Templates
            <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">
              {templatePrompts.length}
            </Badge>
          </CollapsibleTrigger>
          <CreatePromptDialog scope={scope} defaultType="template" compact />
        </div>
        <CollapsibleContent className="space-y-1.5">
          {isLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            </div>
          ) : templatePrompts.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2 text-center">No templates</p>
          ) : (
            templatePrompts.map((prompt) => (
              <PromptRow key={prompt.id} prompt={prompt} scope={scope} compact />
            ))
          )}
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}

function ApiKeysSection({ orgId, teamId }: { orgId: string; teamId: string }) {
  const { data: apiKeyStatuses, isLoading } = useQuery({
    queryKey: ["team-api-keys", orgId, teamId],
    queryFn: () => apiKeysApi.listTeamKeys(orgId, teamId),
  })
  const { data: defaultProvider, isLoading: isLoadingDefault } = useQuery({
    queryKey: ["team-default-provider", orgId, teamId],
    queryFn: () => apiKeysApi.getTeamDefaultProvider(orgId, teamId),
  })

  const scope = { type: "team" as const, orgId, teamId }

  return (
    <div className="pl-6 space-y-4">
      <div className="flex items-center gap-3">
        <Label className="text-xs text-muted-foreground">Default:</Label>
        <DefaultProviderSelector scope={scope} currentProvider={defaultProvider?.provider} isLoading={isLoadingDefault} />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-2">
          {(["openai", "anthropic", "google"] as LLMProvider[]).map((provider) => {
            const status = apiKeyStatuses?.find((s) => s.provider === provider)
            return <ProviderRow key={provider} provider={provider} status={status} scope={scope} />
          })}
        </div>
      )}
    </div>
  )
}

function ChatFeaturesSection({ orgId, teamId }: { orgId: string; teamId: string }) {
  const { data: orgSettings, isLoading: isLoadingOrg } = useOrgChatSettings(orgId)
  const { data: teamSettings, isLoading: isLoadingTeam } = useTeamChatSettings(orgId, teamId)
  const updateMutation = useUpdateTeamChatSettings(orgId, teamId)

  const chatDisabledByOrg = orgSettings ? !orgSettings.chat_enabled : false
  const chatPanelDisabledByOrg = orgSettings ? !orgSettings.chat_panel_enabled : false
  const memoryDisabledByOrg = orgSettings ? !orgSettings.memory_enabled : false

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 py-2">
          <MessageSquare className="size-4" />
          <span className="text-sm font-medium">Chat Features</span>
        </div>
        <p className="text-xs text-muted-foreground mb-2">
          Organization settings take precedence over team preferences.
        </p>
        <ChatSettings
          settings={teamSettings ?? { chat_enabled: true, chat_panel_enabled: true, memory_enabled: true, mcp_enabled: true }}
          onChatEnabledChange={(enabled) => updateMutation.mutate({ chat_enabled: enabled })}
          onChatPanelEnabledChange={(enabled) => updateMutation.mutate({ chat_panel_enabled: enabled })}
          chatDisabledByOrg={chatDisabledByOrg}
          chatPanelDisabledByOrg={chatPanelDisabledByOrg}
          isLoading={isLoadingOrg || isLoadingTeam || updateMutation.isPending}
          level="team"
        />
      </div>

      <div className="border-t pt-4">
        <div className="flex items-center gap-2 py-2">
          <Brain className="size-4" />
          <span className="text-sm font-medium">Memory</span>
        </div>
        <p className="text-xs text-muted-foreground mb-2">
          When disabled, memory will be turned off for all users in this team.
        </p>
        <MemorySettings
          memoryEnabled={teamSettings?.memory_enabled ?? true}
          onMemoryEnabledChange={(enabled) => updateMutation.mutate({ memory_enabled: enabled })}
          memoryDisabledByOrg={memoryDisabledByOrg}
          isLoading={isLoadingOrg || isLoadingTeam || updateMutation.isPending}
          level="team"
        />
      </div>

      <div className="border-t pt-4">
        <TeamMCPSection
          orgId={orgId}
          teamId={teamId}
          orgSettings={orgSettings}
          teamSettings={teamSettings}
          updateMutation={updateMutation}
          isLoading={isLoadingOrg || isLoadingTeam}
        />
      </div>
    </div>
  )
}

function TeamMCPSection({
  orgId,
  teamId,
  orgSettings,
  teamSettings,
  updateMutation,
  isLoading,
}: {
  orgId: string
  teamId: string
  orgSettings: OrganizationChatSettings | undefined
  teamSettings: TeamChatSettings | undefined
  updateMutation: ReturnType<typeof useUpdateTeamChatSettings>
  isLoading: boolean
}) {
  const mcpDisabledByOrg = orgSettings ? !orgSettings.mcp_enabled : false
  const customServersDisabledByOrg = orgSettings ? !orgSettings.mcp_allow_custom_servers : false

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 py-2">
        <Plug className="size-4" />
        <span className="text-sm font-medium">MCP Integration</span>
      </div>
      <p className="text-xs text-muted-foreground">
        Configure Model Context Protocol (MCP) servers for this team.
      </p>

      <MCPSettings
        mcpEnabled={teamSettings?.mcp_enabled ?? true}
        mcpAllowCustomServers={teamSettings?.mcp_allow_custom_servers ?? true}
        onMCPEnabledChange={(enabled) => updateMutation.mutate({ mcp_enabled: enabled })}
        onMCPAllowCustomServersChange={(allowed) => updateMutation.mutate({ mcp_allow_custom_servers: allowed })}
        disabledBy={mcpDisabledByOrg ? "org" : null}
        customServersDisabledBy={customServersDisabledByOrg ? "org" : null}
        isLoading={isLoading || updateMutation.isPending}
        level="team"
      />

      {!mcpDisabledByOrg && !customServersDisabledByOrg && (
        <div className="mt-4">
          <MCPServersList scope={{ type: "team", orgId, teamId }} />
        </div>
      )}
    </div>
  )
}
