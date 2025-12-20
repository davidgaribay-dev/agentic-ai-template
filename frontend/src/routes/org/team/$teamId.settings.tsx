/**
 * Team Settings Page.
 *
 * Provides settings management for the current team including:
 * - Team details (name, description)
 * - Members management (add from org, change roles, remove)
 * - Danger zone (leave/delete team)
 */

import { useState, useEffect, useRef, useMemo } from "react"
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router"
import { z } from "zod"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  Users,
  Trash2,
  Loader2,
  Shield,
  User,
  Eye,
  UserMinus,
  LogOut,
  AlertTriangle,
  UserPlus,
  Key,
  MessageSquare,
  Camera,
  Sparkles,
  Settings2,
  MoreHorizontal,
} from "lucide-react"
import { useAuth } from "@/lib/auth"
import {
  useWorkspace,
  useOrganizationMembers,
  workspaceKeys,
} from "@/lib/workspace"
import {
  teamsApi,
  promptsApi,
  apiKeysApi,
  type TeamUpdate,
  type TeamRole,
  type TeamMember,
  type ChatSettings as ChatSettingsType,
  type Prompt,
  type PromptCreate,
  type PromptUpdate,
  type PromptType,
  type APIKeyStatus,
  type LLMProvider,
  ApiError,
} from "@/lib/api"
import {
  useOrgChatSettings,
  useTeamChatSettings,
  useUpdateTeamChatSettings,
} from "@/lib/queries"
import { ChatSettings } from "@/components/chat-settings"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
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
import { isValidImageUrl, getInitials } from "@/lib/utils"
import type { ColumnDef } from "@tanstack/react-table"
import { DataTable } from "@/components/ui/data-table"
import { Check, X, Power, PowerOff, Pencil, EyeOff, Building2 } from "lucide-react"

const teamSettingsSearchSchema = z.object({
  tab: z.enum(["details", "members", "system-prompts", "templates", "api-keys", "preferences"]).optional(),
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

  const currentTab = tabFromUrl || "details"

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

  if (!currentOrg || !team) {
    return (
      <div className="bg-background min-h-screen">
        <div className="mx-auto max-w-6xl px-6 py-8">
          <div className="mb-8">
            <div className="flex items-center gap-3">
              <Skeleton className="h-12 w-12 rounded-full" />
              <div className="space-y-2">
                <Skeleton className="h-6 w-40" />
                <Skeleton className="h-4 w-56" />
              </div>
            </div>
          </div>
          <Skeleton className="h-10 w-full mb-8" />
          <div className="space-y-4">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-background min-h-screen">
      <div className="mx-auto max-w-6xl px-6 py-8">
        {/* Header */}
        <div className="mb-8 flex items-center gap-4">
          {isValidImageUrl(team.logo_url) ? (
            <img
              src={team.logo_url}
              alt={team.name}
              className="size-12 rounded-full object-cover ring-2 ring-border"
            />
          ) : (
            <div className="flex size-12 items-center justify-center rounded-full bg-gradient-to-br from-primary/80 to-primary ring-2 ring-border">
              <Users className="size-6 text-primary-foreground" />
            </div>
          )}
          <div>
            <h1 className="text-xl font-semibold">{team.name}</h1>
            <p className="text-sm text-muted-foreground">Team settings · {currentOrg.name}</p>
          </div>
        </div>

        <Tabs value={currentTab} onValueChange={handleTabChange} orientation="vertical" className="flex gap-8">
          {/* Left Sidebar */}
          <div className="w-56 flex-shrink-0">
            <TabsList className="flex flex-col items-stretch h-auto bg-transparent p-0 space-y-1">
              <TabsTrigger
                value="details"
                className="justify-start px-3 py-2 h-auto text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 data-[state=active]:bg-muted data-[state=active]:text-foreground rounded-md"
              >
                <Users className="mr-2 size-4" />
                Details
              </TabsTrigger>
              <TabsTrigger
                value="members"
                className="justify-start px-3 py-2 h-auto text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 data-[state=active]:bg-muted data-[state=active]:text-foreground rounded-md"
              >
                <User className="mr-2 size-4" />
                Members
              </TabsTrigger>

              {canManageTeam && (
                <>
                  <div className="pt-4 pb-2">
                    <span className="px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      AI Configuration
                    </span>
                  </div>
                  <TabsTrigger
                    value="system-prompts"
                    className="justify-start px-3 py-2 h-auto text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 data-[state=active]:bg-muted data-[state=active]:text-foreground rounded-md"
                  >
                    <Sparkles className="mr-2 size-4" />
                    System Prompts
                  </TabsTrigger>
                  <TabsTrigger
                    value="templates"
                    className="justify-start px-3 py-2 h-auto text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 data-[state=active]:bg-muted data-[state=active]:text-foreground rounded-md"
                  >
                    <MessageSquare className="mr-2 size-4" />
                    Templates
                  </TabsTrigger>
                  <TabsTrigger
                    value="api-keys"
                    className="justify-start px-3 py-2 h-auto text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 data-[state=active]:bg-muted data-[state=active]:text-foreground rounded-md"
                  >
                    <Key className="mr-2 size-4" />
                    API Keys
                  </TabsTrigger>
                  <TabsTrigger
                    value="preferences"
                    className="justify-start px-3 py-2 h-auto text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 data-[state=active]:bg-muted data-[state=active]:text-foreground rounded-md"
                  >
                    <Settings2 className="mr-2 size-4" />
                    Preferences
                  </TabsTrigger>
                </>
              )}
            </TabsList>
          </div>

          {/* Main Content */}
          <div className="flex-1 min-w-0">
            <TabsContent value="details" className="mt-0 space-y-8">
              {canManageTeam && (
                <TeamDetailsSection
                  orgId={currentOrg.id}
                  team={team}
                  onUpdate={refresh}
                />
              )}
              <TeamDangerZoneSection
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

            <TabsContent value="members" className="mt-0 space-y-6">
              <TeamMembersSection
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
                <TabsContent value="system-prompts" className="mt-0 space-y-6">
                  <SystemPromptsSection orgId={currentOrg.id} teamId={team.id} />
                </TabsContent>

                <TabsContent value="templates" className="mt-0 space-y-6">
                  <TemplatesSection orgId={currentOrg.id} teamId={team.id} />
                </TabsContent>

                <TabsContent value="api-keys" className="mt-0 space-y-6">
                  <ApiKeysSection orgId={currentOrg.id} teamId={team.id} />
                </TabsContent>

                <TabsContent value="preferences" className="mt-0 space-y-6">
                  <TeamChatFeaturesSection orgId={currentOrg.id} teamId={team.id} />
                </TabsContent>
              </>
            )}
          </div>
        </Tabs>
      </div>
    </div>
  )
}

interface TeamDetailsSectionProps {
  orgId: string
  team: { id: string; name: string; description: string | null; logo_url: string | null }
  onUpdate: () => void
}

function TeamDetailsSection({ orgId, team, onUpdate }: TeamDetailsSectionProps) {
  const queryClient = useQueryClient()
  const [name, setName] = useState(team.name)
  const [description, setDescription] = useState(team.description ?? "")
  const [error, setError] = useState<string | null>(null)
  const [logoError, setLogoError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setName(team.name)
    setDescription(team.description ?? "")
  }, [team])

  const updateMutation = useMutation({
    mutationFn: (data: TeamUpdate) => teamsApi.updateTeam(orgId, team.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.teams(orgId) })
      onUpdate()
      setError(null)
    },
    onError: (err: ApiError) => {
      const detail = (err.body as { detail?: string })?.detail
      setError(detail || "Failed to update team")
    },
  })

  const uploadLogoMutation = useMutation({
    mutationFn: (file: File) => teamsApi.uploadLogo(orgId, team.id, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.teams(orgId) })
      onUpdate()
      setLogoError(null)
    },
    onError: (err: ApiError) => {
      const detail = (err.body as { detail?: string })?.detail
      setLogoError(detail || "Failed to upload logo")
    },
  })

  const deleteLogoMutation = useMutation({
    mutationFn: () => teamsApi.deleteLogo(orgId, team.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.teams(orgId) })
      onUpdate()
      setLogoError(null)
    },
    onError: (err: ApiError) => {
      const detail = (err.body as { detail?: string })?.detail
      setLogoError(detail || "Failed to delete logo")
    },
  })

  const handleSave = () => {
    updateMutation.mutate({ name, description: description || null })
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setLogoError(null)
      uploadLogoMutation.mutate(file)
    }
    e.target.value = ""
  }

  const handleUploadClick = () => {
    fileInputRef.current?.click()
  }

  const handleDeleteLogo = () => {
    setLogoError(null)
    deleteLogoMutation.mutate()
  }

  const hasChanges = name !== team.name || description !== (team.description ?? "")
  const isLogoLoading = uploadLogoMutation.isPending || deleteLogoMutation.isPending

  return (
    <section>
      <div className="mb-4">
        <h2 className="text-lg font-semibold">Team Details</h2>
        <p className="text-sm text-muted-foreground">
          Update your team's basic information
        </p>
      </div>
      <div className="space-y-6">
        {/* Logo Upload */}
        <div className="space-y-2">
          <Label>Team Logo</Label>
          <div className="flex items-center gap-4">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              onChange={handleFileSelect}
              className="hidden"
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="group relative size-20 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  disabled={isLogoLoading}
                  aria-label="Upload team logo"
                >
                  {isValidImageUrl(team.logo_url) ? (
                    <img
                      src={team.logo_url}
                      alt="Team logo"
                      className="size-full rounded-lg object-cover ring-2 ring-border"
                    />
                  ) : (
                    <div className="flex size-full items-center justify-center rounded-lg bg-gradient-to-br from-primary/80 to-primary ring-2 ring-border">
                      <Users className="size-8 text-primary-foreground" />
                    </div>
                  )}
                  {isLogoLoading ? (
                    <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/60">
                      <Loader2 className="size-6 animate-spin text-white" />
                    </div>
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/60 opacity-0 transition-all duration-200 group-hover:opacity-100">
                      <Camera className="size-6 text-white" />
                    </div>
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onClick={handleUploadClick}>
                  <Camera className="mr-2 size-4" />
                  {team.logo_url ? "Change logo" : "Upload logo"}
                </DropdownMenuItem>
                {team.logo_url && (
                  <DropdownMenuItem onClick={handleDeleteLogo} className="text-destructive focus:text-destructive">
                    <Trash2 className="mr-2 size-4" />
                    Remove logo
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            <div className="text-sm text-muted-foreground">
              <p>Click to upload a logo</p>
              <p className="text-xs">JPG, PNG, GIF, or WebP (max 5MB)</p>
            </div>
          </div>
          {logoError && <p className="text-sm text-destructive">{logoError}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="team-name">Team Name</Label>
          <Input
            id="team-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Team name"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="team-description">Description</Label>
          <Textarea
            id="team-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional description"
            rows={3}
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button
          onClick={handleSave}
          disabled={!hasChanges || updateMutation.isPending}
        >
          {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save Changes
        </Button>
      </div>
    </section>
  )
}

interface TeamMembersSectionProps {
  orgId: string
  teamId: string
  members: TeamMember[]
  isLoading: boolean
  canManage: boolean
  isOrgAdmin: boolean
  currentUserId?: string
  onUpdate: () => void
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

function TeamMembersSection({
  orgId,
  teamId,
  members,
  isLoading,
  canManage,
  isOrgAdmin,
  currentUserId,
  onUpdate,
}: TeamMembersSectionProps) {
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
          <Badge variant="secondary" className="bg-blue-500/15 text-blue-600 dark:text-blue-400 border-0">
            <Shield className="mr-1 size-3" />
            Admin
          </Badge>
        )
      case "member":
        return (
          <Badge variant="outline" className="text-muted-foreground">
            <User className="mr-1 size-3" />
            Member
          </Badge>
        )
      case "viewer":
        return (
          <Badge variant="outline" className="text-muted-foreground">
            <Eye className="mr-1 size-3" />
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
          <div className="flex items-center gap-3">
            {isValidImageUrl(member.user_profile_image_url) ? (
              <img
                src={member.user_profile_image_url}
                alt={member.user_full_name || member.user_email}
                className="size-8 rounded-full object-cover ring-1 ring-border"
              />
            ) : (
              <div className="flex size-8 items-center justify-center rounded-full bg-gradient-to-br from-primary/80 to-primary ring-1 ring-border">
                <span className="text-xs font-medium text-primary-foreground">
                  {getInitials(member.user_full_name, member.user_email)}
                </span>
              </div>
            )}
            <div>
              <div className="font-medium flex items-center gap-1">
                {member.user_full_name || member.user_email}
                {isCurrentUser && (
                  <span className="text-xs text-muted-foreground">(you)</span>
                )}
              </div>
              {member.user_full_name && (
                <div className="text-xs text-muted-foreground">{member.user_email}</div>
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
      accessorKey: "org_role",
      header: "Org Role",
      cell: ({ row }) => {
        const orgRole = row.original.org_role
        if (orgRole === "member") return null
        return (
          <span className="text-xs text-muted-foreground capitalize">
            {orgRole}
          </span>
        )
      },
    },
    {
      id: "actions",
      header: () => <div className="text-right">Actions</div>,
      cell: ({ row }) => {
        const member = row.original
        const isCurrentUser = member.user_id === currentUserId
        const canManageMember = canManage && !isCurrentUser
        const canChangeRole = canManageMember && (isOrgAdmin || member.role !== "admin")

        if (!canManageMember) {
          return <div className="flex justify-end" />
        }

        return (
          <div className="flex justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="size-8">
                  <MoreHorizontal className="size-4" />
                  <span className="sr-only">Open menu</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {canChangeRole && (
                  <>
                    <DropdownMenuItem
                      onClick={() => updateRoleMutation.mutate({ memberId: member.id, role: "admin" })}
                      disabled={member.role === "admin"}
                    >
                      <Shield className="mr-2 size-4" />
                      Make Admin
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => updateRoleMutation.mutate({ memberId: member.id, role: "member" })}
                      disabled={member.role === "member"}
                    >
                      <User className="mr-2 size-4" />
                      Make Member
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => updateRoleMutation.mutate({ memberId: member.id, role: "viewer" })}
                      disabled={member.role === "viewer"}
                    >
                      <Eye className="mr-2 size-4" />
                      Make Viewer
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
                      <UserMinus className="mr-2 size-4" />
                      Remove from team
                    </DropdownMenuItem>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Remove Team Member</AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to remove {member.user_full_name || member.user_email} from this team?
                        They will still be a member of the organization.
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
    <section>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold">Members</h2>
          <p className="text-sm text-muted-foreground">
            Manage who has access to this team
          </p>
        </div>
        {canManage && availableOrgMembers.length > 0 && (
          <Dialog open={addMemberOpen} onOpenChange={(open) => open ? setAddMemberOpen(true) : resetAddDialog()}>
            <DialogTrigger asChild>
              <Button>
                <UserPlus className="mr-2 h-4 w-4" />
                Add Member
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Team Member</DialogTitle>
                <DialogDescription>
                  Add an organization member to this team.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Select Member</Label>
                  <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a member..." />
                    </SelectTrigger>
                    <SelectContent>
                      {availableOrgMembers.map((member) => (
                        <SelectItem key={member.user_id} value={member.user_id}>
                          {member.user_full_name || member.user_email}
                          <span className="text-muted-foreground text-xs ml-2">
                            ({member.role})
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Team Role</Label>
                  <Select value={selectedRole} onValueChange={(v) => setSelectedRole(v as TeamRole)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="viewer">Viewer - Read-only access</SelectItem>
                      <SelectItem value="member">Member - Can create and edit</SelectItem>
                      <SelectItem value="admin">Admin - Full team control</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={resetAddDialog}>
                  Cancel
                </Button>
                <Button onClick={handleAddMember} disabled={!selectedUserId || addMemberMutation.isPending}>
                  {addMemberMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Add Member
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3">
                <Skeleton className="size-8 rounded-full" />
                <div className="space-y-1.5">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-40" />
                </div>
              </div>
              <Skeleton className="h-6 w-16 rounded-full" />
            </div>
          ))}
        </div>
      ) : members.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-muted-foreground rounded-lg border border-dashed">
          <Users className="h-8 w-8 mb-2" />
          <p>No team members yet</p>
          {canManage && availableOrgMembers.length > 0 && (
            <p className="text-sm mt-1">Add organization members to this team</p>
          )}
        </div>
      ) : (
        <DataTable
          columns={memberColumns}
          data={memberData}
          searchKey="user_full_name"
          searchPlaceholder="Search members..."
          pageSize={10}
        />
      )}

      {canManage && availableOrgMembers.length === 0 && members.length > 0 && (
        <p className="text-xs text-muted-foreground mt-2">
          All organization members are already in this team.
        </p>
      )}
    </section>
  )
}

interface TeamDangerZoneSectionProps {
  orgId: string
  teamId: string
  teamName: string
  canDelete: boolean
  memberCount: number
  onLeave: () => void
  onDelete: () => void
}

function TeamDangerZoneSection({
  orgId,
  teamId,
  teamName,
  canDelete,
  memberCount,
  onLeave,
  onDelete,
}: TeamDangerZoneSectionProps) {
  const queryClient = useQueryClient()
  const [confirmName, setConfirmName] = useState("")

  const leaveMutation = useMutation({
    mutationFn: () => teamsApi.leaveTeam(orgId, teamId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.teams(orgId) })
      queryClient.invalidateQueries({ queryKey: ["team-members", orgId, teamId] })
      onLeave()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => teamsApi.deleteTeam(orgId, teamId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.teams(orgId) })
      onDelete()
    },
  })

  return (
    <section>
      <h2 className="text-lg font-semibold mb-4 text-destructive">Danger Zone</h2>
      <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-6 space-y-4">
        {/* Leave Team */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Leave Team</p>
            <p className="text-xs text-muted-foreground">
              You will lose access to team resources.
            </p>
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground">
                <LogOut className="mr-2 h-4 w-4" />
                Leave
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Leave Team</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to leave {teamName}? You will lose access to team resources.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => leaveMutation.mutate()}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {leaveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Leave Team
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        {/* Delete Team (Admin only) */}
        {canDelete && (
          <div className="flex items-center justify-between border-t border-destructive/20 pt-4">
            <div>
              <p className="text-sm font-medium">Delete Team</p>
              <p className="text-xs text-muted-foreground">
                Permanently delete this team and all its data.
              </p>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive">
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-destructive" />
                    Delete Team
                  </AlertDialogTitle>
                  <AlertDialogDescription className="space-y-2">
                    <p>
                      This action cannot be undone. This will permanently delete <strong>{teamName}</strong> and remove {memberCount} member{memberCount !== 1 && "s"}.
                    </p>
                    <p className="text-sm">
                      Type <strong>{teamName}</strong> to confirm:
                    </p>
                    <Input
                      value={confirmName}
                      onChange={(e) => setConfirmName(e.target.value)}
                      placeholder={teamName}
                    />
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel onClick={() => setConfirmName("")}>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => deleteMutation.mutate()}
                    disabled={confirmName !== teamName || deleteMutation.isPending}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {deleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Delete Team
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </div>
    </section>
  )
}

interface TeamChatFeaturesSectionProps {
  orgId: string
  teamId: string
}

function TeamChatFeaturesSection({ orgId, teamId }: TeamChatFeaturesSectionProps) {
  const { data: orgSettings, isLoading: isLoadingOrg } = useOrgChatSettings(orgId)
  const { data: teamSettings, isLoading: isLoadingTeam } = useTeamChatSettings(orgId, teamId)
  const updateMutation = useUpdateTeamChatSettings(orgId, teamId)

  const handleChatEnabledChange = (enabled: boolean) => {
    updateMutation.mutate({ chat_enabled: enabled })
  }

  const handleChatPanelEnabledChange = (enabled: boolean) => {
    updateMutation.mutate({ chat_panel_enabled: enabled })
  }

  const currentSettings: ChatSettingsType = teamSettings ?? {
    chat_enabled: true,
    chat_panel_enabled: true,
  }

  const chatDisabledByOrg = orgSettings ? !orgSettings.chat_enabled : false
  const chatPanelDisabledByOrg = orgSettings ? !orgSettings.chat_panel_enabled : false

  return (
    <div className="space-y-4">
      <ChatSettings
        settings={currentSettings}
        onChatEnabledChange={handleChatEnabledChange}
        onChatPanelEnabledChange={handleChatPanelEnabledChange}
        chatDisabledByOrg={chatDisabledByOrg}
        chatPanelDisabledByOrg={chatPanelDisabledByOrg}
        isLoading={isLoadingOrg || isLoadingTeam || updateMutation.isPending}
        level="team"
      />
    </div>
  )
}

// API Keys Section
const PROVIDER_INFO: Record<LLMProvider, { name: string; description: string; icon: string }> = {
  openai: {
    name: "OpenAI",
    description: "GPT-4o and other OpenAI models",
    icon: "O",
  },
  anthropic: {
    name: "Anthropic",
    description: "Claude models for advanced reasoning",
    icon: "A",
  },
  google: {
    name: "Google",
    description: "Gemini models from Google AI",
    icon: "G",
  },
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

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-lg font-semibold mb-4">Default Provider</h2>
        <DefaultProviderSelector
          orgId={orgId}
          teamId={teamId}
          currentProvider={defaultProvider?.provider}
          isLoading={isLoadingDefault}
        />
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-4">Provider API Keys</h2>
        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : (
          <div className="space-y-4">
            {(["openai", "anthropic", "google"] as LLMProvider[]).map((provider) => {
              const status = apiKeyStatuses?.find((s) => s.provider === provider)
              return (
                <ProviderCard
                  key={provider}
                  provider={provider}
                  status={status}
                  orgId={orgId}
                  teamId={teamId}
                />
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}

function DefaultProviderSelector({
  orgId,
  teamId,
  currentProvider,
  isLoading,
}: {
  orgId: string
  teamId: string
  currentProvider?: string
  isLoading: boolean
}) {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)

  const updateMutation = useMutation({
    mutationFn: (provider: LLMProvider) =>
      apiKeysApi.setTeamDefaultProvider(orgId, teamId, { provider }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-default-provider", orgId, teamId] })
      setError(null)
    },
    onError: (err: ApiError) => {
      setError((err.body as { detail?: string })?.detail || "Failed to update default provider")
    },
  })

  if (isLoading) {
    return <Skeleton className="h-10 w-48" />
  }

  return (
    <div className="flex items-center gap-4">
      <Select
        value={currentProvider || "anthropic"}
        onValueChange={(value) => updateMutation.mutate(value as LLMProvider)}
        disabled={updateMutation.isPending}
      >
        <SelectTrigger className="w-48">
          <SelectValue placeholder="Select provider" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="anthropic">Anthropic (Claude)</SelectItem>
          <SelectItem value="openai">OpenAI (GPT-4)</SelectItem>
          <SelectItem value="google">Google (Gemini)</SelectItem>
        </SelectContent>
      </Select>
      {updateMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
      {error && <span className="text-sm text-destructive">{error}</span>}
    </div>
  )
}

function ProviderCard({
  provider,
  status,
  orgId,
  teamId,
}: {
  provider: LLMProvider
  status?: APIKeyStatus
  orgId: string
  teamId: string
}) {
  const info = PROVIDER_INFO[provider]
  const isConfigured = status?.is_configured || false
  const level = status?.level

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted font-bold text-lg">
            {info.icon}
          </div>
          <div>
            <div className="text-sm font-medium">{info.name}</div>
            <div className="text-xs text-muted-foreground">{info.description}</div>
          </div>
        </div>
        <StatusBadge isConfigured={isConfigured} level={level} />
      </div>
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {isConfigured ? (
            level === "team" ? (
              <span className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                Configured at team level
              </span>
            ) : level === "org" ? (
              <span className="flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                Using organization key
              </span>
            ) : level === "environment" ? (
              <span className="flex items-center gap-2">
                <Sparkles className="h-4 w-4" />
                Using environment variable
              </span>
            ) : (
              "Configured"
            )
          ) : (
            "Not configured"
          )}
        </div>
        <div className="flex gap-2">
          <SetApiKeyDialog provider={provider} orgId={orgId} teamId={teamId} hasKey={level === "team"} />
          {level === "team" && <DeleteApiKeyButton provider={provider} orgId={orgId} teamId={teamId} />}
        </div>
      </div>
    </div>
  )
}

function StatusBadge({ isConfigured, level }: { isConfigured: boolean; level?: string | null }) {
  if (!isConfigured) {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        <X className="mr-1 h-3 w-3" />
        Not Set
      </Badge>
    )
  }

  if (level === "environment") {
    return (
      <Badge variant="secondary">
        <Sparkles className="mr-1 h-3 w-3" />
        Env Fallback
      </Badge>
    )
  }

  if (level === "org") {
    return (
      <Badge variant="secondary">
        <Building2 className="mr-1 h-3 w-3" />
        Org Key
      </Badge>
    )
  }

  return (
    <Badge variant="secondary" className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-0">
      <Check className="mr-1 h-3 w-3" />
      Configured
    </Badge>
  )
}

function SetApiKeyDialog({
  provider,
  orgId,
  teamId,
  hasKey,
}: {
  provider: LLMProvider
  orgId: string
  teamId: string
  hasKey: boolean
}) {
  const [open, setOpen] = useState(false)
  const [apiKey, setApiKey] = useState("")
  const [showKey, setShowKey] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: () => apiKeysApi.setTeamKey(orgId, teamId, { provider, api_key: apiKey }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-api-keys", orgId, teamId] })
      setOpen(false)
      setApiKey("")
      setError(null)
    },
    onError: (err: ApiError) => {
      setError((err.body as { detail?: string })?.detail || "Failed to save API key")
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!apiKey.trim()) {
      setError("API key is required")
      return
    }
    mutation.mutate()
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={hasKey ? "outline" : "default"} size="sm">
          {hasKey ? "Update" : "Set Key"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {hasKey ? "Update" : "Set"} {PROVIDER_INFO[provider].name} API Key
          </DialogTitle>
          <DialogDescription>
            Enter your {PROVIDER_INFO[provider].name} API key. It will be stored securely
            in Infisical and never saved to the database.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="api-key">API Key</Label>
              <div className="relative">
                <Input
                  id="api-key"
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => {
                    setApiKey(e.target.value)
                    setError(null)
                  }}
                  placeholder={`Enter your ${PROVIDER_INFO[provider].name} API key`}
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3"
                  onClick={() => setShowKey(!showKey)}
                >
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Key"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function DeleteApiKeyButton({ provider, orgId, teamId }: { provider: LLMProvider; orgId: string; teamId: string }) {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: () => apiKeysApi.deleteTeamKey(orgId, teamId, provider),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-api-keys", orgId, teamId] })
    },
  })

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" className="text-destructive hover:text-destructive">
          Delete
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete API Key</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete the {PROVIDER_INFO[provider].name} API key?
            The team will fall back to organization keys or environment variables.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => mutation.mutate()}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {mutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
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

// System Prompts Section
function SystemPromptsSection({ orgId, teamId }: { orgId: string; teamId: string }) {
  const { data: promptsData, isLoading } = useQuery({
    queryKey: ["team-prompts", orgId, teamId],
    queryFn: () => promptsApi.listTeamPrompts(orgId, teamId),
  })

  const prompts = promptsData?.data ?? []
  const systemPrompts = prompts.filter((p) => p.prompt_type === "system")

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end">
        <CreatePromptDialog orgId={orgId} teamId={teamId} defaultType="system" />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : systemPrompts.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title="No system prompts"
          description="System prompts configure the AI's behavior for all conversations in this team."
        />
      ) : (
        <div className="space-y-4">
          {systemPrompts.map((prompt) => (
            <PromptCard key={prompt.id} prompt={prompt} orgId={orgId} teamId={teamId} />
          ))}
        </div>
      )}
    </div>
  )
}

function TemplatesSection({ orgId, teamId }: { orgId: string; teamId: string }) {
  const { data: promptsData, isLoading } = useQuery({
    queryKey: ["team-prompts", orgId, teamId],
    queryFn: () => promptsApi.listTeamPrompts(orgId, teamId),
  })

  const prompts = promptsData?.data ?? []
  const templatePrompts = prompts.filter((p) => p.prompt_type === "template")

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end">
        <CreatePromptDialog orgId={orgId} teamId={teamId} defaultType="template" />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : templatePrompts.length === 0 ? (
        <EmptyState
          icon={MessageSquare}
          title="No templates"
          description="Templates are reusable text snippets that team members can insert into their messages."
        />
      ) : (
        <div className="space-y-4">
          {templatePrompts.map((prompt) => (
            <PromptCard key={prompt.id} prompt={prompt} orgId={orgId} teamId={teamId} />
          ))}
        </div>
      )}
    </div>
  )
}

function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  description: string
}) {
  return (
    <div className="rounded-lg border border-dashed p-8 text-center">
      <Icon className="mx-auto size-10 text-muted-foreground/50" />
      <h3 className="mt-4 text-lg font-medium">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{description}</p>
    </div>
  )
}

function PromptCard({ prompt, orgId, teamId }: { prompt: Prompt; orgId: string; teamId: string }) {
  const queryClient = useQueryClient()

  const activateMutation = useMutation({
    mutationFn: () => promptsApi.activateTeamPrompt(orgId, teamId, prompt.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-prompts", orgId, teamId] })
    },
  })

  const isSystem = prompt.prompt_type === "system"

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
            {isSystem ? (
              <Sparkles className="size-5 text-muted-foreground" />
            ) : (
              <MessageSquare className="size-5 text-muted-foreground" />
            )}
          </div>
          <div>
            <div className="text-sm font-medium flex items-center gap-2">
              {prompt.name}
              {isSystem && prompt.is_active && (
                <Badge variant="secondary" className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-0">
                  <Check className="mr-1 size-3" />
                  Active
                </Badge>
              )}
            </div>
            {prompt.description && (
              <div className="text-xs text-muted-foreground">{prompt.description}</div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isSystem && !prompt.is_active && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => activateMutation.mutate()}
              disabled={activateMutation.isPending}
            >
              {activateMutation.isPending ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Power className="mr-2 size-4" />
              )}
              Activate
            </Button>
          )}
          {isSystem && prompt.is_active && (
            <Badge variant="outline" className="text-muted-foreground">
              <PowerOff className="mr-1 size-3" />
              In Use
            </Badge>
          )}
          <EditPromptDialog prompt={prompt} orgId={orgId} teamId={teamId} />
          <DeletePromptButton prompt={prompt} orgId={orgId} teamId={teamId} />
        </div>
      </div>
      <div className="rounded-md bg-muted/50 p-3">
        <pre className="text-sm whitespace-pre-wrap font-mono text-muted-foreground">
          {prompt.content.length > 300
            ? `${prompt.content.slice(0, 300)}...`
            : prompt.content}
        </pre>
      </div>
    </div>
  )
}

function CreatePromptDialog({ orgId, teamId, defaultType = "template" }: { orgId: string; teamId: string; defaultType?: PromptType }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [content, setContent] = useState("")
  const [promptType, setPromptType] = useState<PromptType>(defaultType)
  const [error, setError] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const createMutation = useMutation({
    mutationFn: (data: PromptCreate) => promptsApi.createTeamPrompt(orgId, teamId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-prompts", orgId, teamId] })
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
    setPromptType(defaultType)
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
      prompt_type: promptType,
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Sparkles className="mr-2 size-4" />
          Create Prompt
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Prompt</DialogTitle>
          <DialogDescription>
            Create a new prompt for this team.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="prompt-type">Type</Label>
              <Select value={promptType} onValueChange={(v) => setPromptType(v as PromptType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="template">
                    <div className="flex items-center gap-2">
                      <MessageSquare className="size-4" />
                      Template
                    </div>
                  </SelectItem>
                  <SelectItem value="system">
                    <div className="flex items-center gap-2">
                      <Sparkles className="size-4" />
                      System Prompt
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {promptType === "system"
                  ? "System prompts configure the AI's behavior"
                  : "Templates are text snippets users can insert"}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value)
                  setError(null)
                }}
                placeholder="e.g., Code Review Assistant"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Input
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description of this prompt"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="content">Content</Label>
              <Textarea
                id="content"
                value={content}
                onChange={(e) => {
                  setContent(e.target.value)
                  setError(null)
                }}
                placeholder={
                  promptType === "system"
                    ? "You are a helpful assistant that..."
                    : "Enter the template text..."
                }
                rows={6}
                className="font-mono text-sm"
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={resetForm}>
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending && (
                <Loader2 className="mr-2 size-4 animate-spin" />
              )}
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function EditPromptDialog({ prompt, orgId, teamId }: { prompt: Prompt; orgId: string; teamId: string }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(prompt.name)
  const [description, setDescription] = useState(prompt.description ?? "")
  const [content, setContent] = useState(prompt.content)
  const [error, setError] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const updateMutation = useMutation({
    mutationFn: (data: PromptUpdate) => promptsApi.updateTeamPrompt(orgId, teamId, prompt.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-prompts", orgId, teamId] })
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
        <Button variant="ghost" size="icon">
          <Pencil className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Prompt</DialogTitle>
          <DialogDescription>Update the prompt details.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Name</Label>
              <Input
                id="edit-name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value)
                  setError(null)
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-description">Description (optional)</Label>
              <Input
                id="edit-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-content">Content</Label>
              <Textarea
                id="edit-content"
                value={content}
                onChange={(e) => {
                  setContent(e.target.value)
                  setError(null)
                }}
                rows={6}
                className="font-mono text-sm"
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={updateMutation.isPending}>
              {updateMutation.isPending && (
                <Loader2 className="mr-2 size-4 animate-spin" />
              )}
              Save Changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function DeletePromptButton({ prompt, orgId, teamId }: { prompt: Prompt; orgId: string; teamId: string }) {
  const queryClient = useQueryClient()

  const deleteMutation = useMutation({
    mutationFn: () => promptsApi.deleteTeamPrompt(orgId, teamId, prompt.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-prompts", orgId, teamId] })
    },
  })

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive">
          <Trash2 className="size-4" />
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
