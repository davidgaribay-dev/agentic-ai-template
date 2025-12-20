import { useState, useRef, useMemo, useEffect } from "react"
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router"
import { z } from "zod"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Building2,
  Users,
  Trash2,
  Plus,
  Loader2,
  Copy,
  Check,
  Crown,
  Shield,
  User,
  UserMinus,
  LogOut,
  AlertTriangle,
  Settings2,
  Key,
  ChevronRight,
  FileText,
  MessageSquare,
  Sparkles,
  Power,
  PowerOff,
  Pencil,
  Eye,
  EyeOff,
  X,
  Camera,
  MoreHorizontal,
} from "lucide-react"
import { useAuth } from "@/lib/auth"
import {
  useWorkspace,
  useOrganizationMembers,
  workspaceKeys,
} from "@/lib/workspace"
import {
  organizationsApi,
  teamsApi,
  invitationsApi,
  promptsApi,
  apiKeysApi,
  type OrganizationUpdate,
  type TeamCreate,
  type InvitationCreate,
  type OrgRole,
  type ChatSettings as ChatSettingsType,
  type Prompt,
  type PromptCreate,
  type PromptUpdate,
  type PromptType,
  type APIKeyStatus,
  type LLMProvider,
  ApiError,
} from "@/lib/api"
import { useOrgChatSettings, useUpdateOrgChatSettings } from "@/lib/queries"
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { isValidImageUrl, getInitials } from "@/lib/utils"
import type { ColumnDef } from "@tanstack/react-table"
import { DataTable } from "@/components/ui/data-table"

const orgSettingsSearchSchema = z.object({
  tab: z.enum(["details", "members", "teams", "system-prompts", "templates", "api-keys", "preferences"]).optional(),
})

export const Route = createFileRoute("/org/settings")({
  beforeLoad: ({ context }) => {
    if (!context.auth.isAuthenticated && !context.auth.isLoading) {
      throw redirect({ to: "/login" })
    }
  },
  component: OrgSettingsPage,
  validateSearch: orgSettingsSearchSchema,
})

type OrgSettingsTab = z.infer<typeof orgSettingsSearchSchema>["tab"]

function OrgSettingsPage() {
  const navigate = useNavigate()
  const { tab: tabFromUrl } = Route.useSearch()
  const { currentOrg, currentOrgRole, teams, refresh, isLoadingTeams } = useWorkspace()
  const { data: membersData, isLoading: isLoadingMembers } = useOrganizationMembers(currentOrg?.id)
  const members = membersData?.data ?? []

  const currentTab = tabFromUrl || "details"

  const handleTabChange = (value: string) => {
    navigate({ to: "/org/settings", search: { tab: value as OrgSettingsTab }, replace: true })
  }

  const isOwner = currentOrgRole === "owner"
  const isAdmin = currentOrgRole === "owner" || currentOrgRole === "admin"

  if (!currentOrg || currentOrgRole === null) {
    return (
      <div className="bg-background min-h-screen">
        <div className="mx-auto max-w-4xl px-6 py-8">
          <div className="mb-8">
            <div className="flex items-center gap-3">
              <Skeleton className="h-12 w-12 rounded-lg" />
              <div className="space-y-2">
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-4 w-64" />
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

  if (!isAdmin) {
    return (
      <div className="bg-background min-h-screen">
        <div className="mx-auto max-w-4xl px-6 py-8">
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10 mb-4">
              <AlertTriangle className="h-8 w-8 text-destructive" />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight mb-2">Access Denied</h1>
            <p className="text-muted-foreground mb-6 max-w-md">
              You don't have permission to view organization settings.
              Only organization owners and admins can access this page.
            </p>
            <Button onClick={() => navigate({ to: "/" })}>
              Go to Home
            </Button>
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
          {isValidImageUrl(currentOrg.logo_url) ? (
            <img
              src={currentOrg.logo_url}
              alt={currentOrg.name}
              className="size-12 rounded-full object-cover ring-2 ring-border"
            />
          ) : (
            <div className="flex size-12 items-center justify-center rounded-full bg-gradient-to-br from-primary/80 to-primary ring-2 ring-border">
              <Building2 className="size-6 text-primary-foreground" />
            </div>
          )}
          <div>
            <h1 className="text-xl font-semibold">{currentOrg.name}</h1>
            <p className="text-sm text-muted-foreground">Organization settings</p>
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
                <Building2 className="mr-2 size-4" />
                Details
              </TabsTrigger>
              <TabsTrigger
                value="members"
                className="justify-start px-3 py-2 h-auto text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 data-[state=active]:bg-muted data-[state=active]:text-foreground rounded-md"
              >
                <Users className="mr-2 size-4" />
                Members
              </TabsTrigger>
              <TabsTrigger
                value="teams"
                className="justify-start px-3 py-2 h-auto text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 data-[state=active]:bg-muted data-[state=active]:text-foreground rounded-md"
              >
                <Users className="mr-2 size-4" />
                Teams
              </TabsTrigger>

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
            </TabsList>
          </div>

          {/* Main Content */}
          <div className="flex-1 min-w-0">
            <TabsContent value="details" className="mt-0 space-y-8">
              <OrgDetailsSection org={currentOrg} onUpdate={refresh} />
              <DangerZoneSection
                orgId={currentOrg.id}
                orgName={currentOrg.name}
                isOwner={isOwner}
                memberCount={members.length}
              />
            </TabsContent>

            <TabsContent value="members" className="mt-0 space-y-6">
              <MembersSection
                orgId={currentOrg.id}
                members={members}
                isLoading={isLoadingMembers}
                isAdmin={isAdmin}
                isOwner={isOwner}
                onUpdate={refresh}
              />
            </TabsContent>

            <TabsContent value="teams" className="mt-0 space-y-6">
              <TeamsSection
                orgId={currentOrg.id}
                teams={teams}
                isLoading={isLoadingTeams}
                isAdmin={isAdmin}
                onUpdate={refresh}
              />
            </TabsContent>

            <TabsContent value="system-prompts" className="mt-0 space-y-6">
              <SystemPromptsSection orgId={currentOrg.id} />
            </TabsContent>

            <TabsContent value="templates" className="mt-0 space-y-6">
              <TemplatesSection orgId={currentOrg.id} />
            </TabsContent>

            <TabsContent value="api-keys" className="mt-0 space-y-6">
              <ApiKeysSection orgId={currentOrg.id} />
            </TabsContent>

            <TabsContent value="preferences" className="mt-0 space-y-6">
              <ChatFeaturesSection orgId={currentOrg.id} />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  )
}

interface OrgDetailsSectionProps {
  org: { id: string; name: string; description: string | null; logo_url: string | null }
  onUpdate: () => void
}

function OrgDetailsSection({ org, onUpdate }: OrgDetailsSectionProps) {
  const queryClient = useQueryClient()
  const [name, setName] = useState(org.name)
  const [description, setDescription] = useState(org.description ?? "")
  const [error, setError] = useState<string | null>(null)
  const [logoError, setLogoError] = useState<string | null>(null)
  const [isUploadingLogo, setIsUploadingLogo] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const updateMutation = useMutation({
    mutationFn: (data: OrganizationUpdate) =>
      organizationsApi.updateOrganization(org.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.organizations })
      onUpdate()
      setError(null)
    },
    onError: (err: ApiError) => {
      const detail = (err.body as { detail?: string })?.detail
      setError(detail || "Failed to update organization")
    },
  })

  const uploadLogoMutation = useMutation({
    mutationFn: (file: File) => organizationsApi.uploadLogo(org.id, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.organizations })
      onUpdate()
      setLogoError(null)
    },
    onError: (err: ApiError) => {
      const detail = (err.body as { detail?: string })?.detail
      setLogoError(detail || "Failed to upload logo")
    },
  })

  const deleteLogoMutation = useMutation({
    mutationFn: () => organizationsApi.deleteLogo(org.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.organizations })
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

  const hasChanges = name !== org.name || description !== (org.description ?? "")
  const isLogoLoading = uploadLogoMutation.isPending || deleteLogoMutation.isPending

  return (
    <section>
      <div className="mb-4">
        <h2 className="text-lg font-semibold">Organization Details</h2>
        <p className="text-sm text-muted-foreground">
          Update your organization's basic information
        </p>
      </div>
      <div className="space-y-6">
        {/* Logo Upload */}
        <div className="space-y-2">
          <Label>Organization Logo</Label>
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
                  aria-label="Upload organization logo"
                >
                  {isValidImageUrl(org.logo_url) ? (
                    <img
                      src={org.logo_url}
                      alt="Organization logo"
                      className="size-full rounded-lg object-cover ring-2 ring-border"
                    />
                  ) : (
                    <div className="flex size-full items-center justify-center rounded-lg bg-gradient-to-br from-primary/80 to-primary ring-2 ring-border">
                      <Building2 className="size-8 text-primary-foreground" />
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
                  {org.logo_url ? "Change logo" : "Upload logo"}
                </DropdownMenuItem>
                {org.logo_url && (
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
          <Label htmlFor="org-name">Organization Name</Label>
          <Input
            id="org-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Organization name"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="org-description">Description</Label>
          <Textarea
            id="org-description"
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

type OrgMember = {
  id: string
  user_id: string
  role: OrgRole
  user_email: string
  user_full_name: string | null
  user_profile_image_url: string | null
}

interface MembersSectionProps {
  orgId: string
  members: OrgMember[]
  isLoading: boolean
  isAdmin: boolean
  isOwner: boolean
  onUpdate: () => void
}

function MembersSection({ orgId, members, isLoading, isAdmin, isOwner, onUpdate }: MembersSectionProps) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteRole, setInviteRole] = useState<OrgRole>("member")
  const [inviteLink, setInviteLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const inviteMutation = useMutation({
    mutationFn: (data: InvitationCreate) => invitationsApi.createInvitation(orgId, data),
    onSuccess: (data) => {
      const baseUrl = window.location.origin
      setInviteLink(`${baseUrl}/invite?token=${data.token}`)
      setError(null)
    },
    onError: (err: ApiError) => {
      const detail = (err.body as { detail?: string })?.detail
      setError(detail || "Failed to send invitation")
    },
  })

  const updateRoleMutation = useMutation({
    mutationFn: ({ memberId, role }: { memberId: string; role: OrgRole }) =>
      organizationsApi.updateMemberRole(orgId, memberId, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.membership(orgId) })
      onUpdate()
    },
  })

  const removeMemberMutation = useMutation({
    mutationFn: (memberId: string) => organizationsApi.removeMember(orgId, memberId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.membership(orgId) })
      onUpdate()
    },
  })

  const handleInvite = () => {
    setInviteLink(null)
    inviteMutation.mutate({ email: inviteEmail, org_role: inviteRole })
  }

  const handleCopyLink = () => {
    if (inviteLink) {
      navigator.clipboard.writeText(inviteLink)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const resetInviteDialog = () => {
    setInviteEmail("")
    setInviteRole("member")
    setInviteLink(null)
    setError(null)
    setInviteOpen(false)
  }

  const getRoleBadge = (role: OrgRole) => {
    switch (role) {
      case "owner":
        return (
          <Badge variant="secondary" className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-0">
            <Crown className="mr-1 size-3" />
            Owner
          </Badge>
        )
      case "admin":
        return (
          <Badge variant="secondary" className="bg-blue-500/15 text-blue-600 dark:text-blue-400 border-0">
            <Shield className="mr-1 size-3" />
            Admin
          </Badge>
        )
      default:
        return (
          <Badge variant="outline" className="text-muted-foreground">
            <User className="mr-1 size-3" />
            Member
          </Badge>
        )
    }
  }

  const columns: ColumnDef<OrgMember>[] = useMemo(
    () => [
      {
        accessorKey: "user_full_name",
        header: "Member",
        cell: ({ row }) => {
          const member = row.original
          const isCurrentUser = member.user_id === user?.id
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
        id: "actions",
        header: () => <div className="text-right">Actions</div>,
        cell: ({ row }) => {
          const member = row.original
          const isCurrentUser = member.user_id === user?.id
          const canManage = isAdmin && !isCurrentUser && member.role !== "owner"

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
                  {canManage ? (
                    <>
                      <DropdownMenuItem
                        onClick={() => updateRoleMutation.mutate({ memberId: member.id, role: "member" })}
                        disabled={member.role === "member"}
                      >
                        <User className="mr-2 size-4" />
                        Set as Member
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => updateRoleMutation.mutate({ memberId: member.id, role: "admin" })}
                        disabled={member.role === "admin"}
                      >
                        <Shield className="mr-2 size-4" />
                        Set as Admin
                      </DropdownMenuItem>
                      {isOwner && (
                        <DropdownMenuItem
                          onClick={() => updateRoleMutation.mutate({ memberId: member.id, role: "owner" })}
                          disabled={member.role === "owner"}
                        >
                          <Crown className="mr-2 size-4" />
                          Set as Owner
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onSelect={(e) => e.preventDefault()}
                          >
                            <UserMinus className="mr-2 size-4" />
                            Remove member
                          </DropdownMenuItem>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remove Member</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to remove {member.user_full_name || member.user_email} from this organization?
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
                    </>
                  ) : (
                    <DropdownMenuItem disabled>
                      {isCurrentUser ? "This is you" : "Cannot manage this member"}
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )
        },
      },
    ],
    [user?.id, isAdmin, isOwner, updateRoleMutation, removeMemberMutation]
  )

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold">Members</h2>
          <p className="text-sm text-muted-foreground">
            Manage who has access to this organization
          </p>
        </div>
        {isAdmin && (
          <Dialog open={inviteOpen} onOpenChange={(open) => open ? setInviteOpen(true) : resetInviteDialog()}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Invite Member
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Invite Member</DialogTitle>
                <DialogDescription>
                  Send an invitation to join this organization.
                </DialogDescription>
              </DialogHeader>
              {inviteLink ? (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Invitation created! Share this link with {inviteEmail}:
                  </p>
                  <div className="flex gap-2">
                    <Input value={inviteLink} readOnly className="text-xs" />
                    <Button variant="outline" size="icon" onClick={handleCopyLink}>
                      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                  <Button className="w-full" onClick={resetInviteDialog}>
                    Done
                  </Button>
                </div>
              ) : (
                <>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="invite-email">Email Address</Label>
                      <Input
                        id="invite-email"
                        type="email"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        placeholder="colleague@example.com"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Role</Label>
                      <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as OrgRole)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="member">Member</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                          {isOwner && <SelectItem value="owner">Owner</SelectItem>}
                        </SelectContent>
                      </Select>
                    </div>
                    {error && <p className="text-sm text-destructive">{error}</p>}
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={resetInviteDialog}>
                      Cancel
                    </Button>
                    <Button onClick={handleInvite} disabled={!inviteEmail || inviteMutation.isPending}>
                      {inviteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Send Invitation
                    </Button>
                  </DialogFooter>
                </>
              )}
            </DialogContent>
          </Dialog>
        )}
      </div>

      {isLoading ? (
        <div className="rounded-lg border border-border p-8">
          <div className="flex items-center justify-center">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        </div>
      ) : members.length === 0 ? (
        <div className="rounded-lg border border-dashed flex flex-col items-center justify-center py-12 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted mb-4">
            <Users className="size-6 text-muted-foreground" />
          </div>
          <h3 className="text-base font-medium">No members yet</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Invite members to collaborate in your organization
          </p>
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={members}
          searchKey="user_full_name"
          searchPlaceholder="Search members..."
        />
      )}
    </section>
  )
}

type Team = { id: string; name: string; description: string | null; logo_url: string | null }

interface TeamsSectionProps {
  orgId: string
  teams: Team[]
  isLoading: boolean
  isAdmin: boolean
  onUpdate: () => void
}

function TeamsSection({ orgId, teams, isLoading, isAdmin, onUpdate }: TeamsSectionProps) {
  const queryClient = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const [teamName, setTeamName] = useState("")
  const [teamDescription, setTeamDescription] = useState("")
  const [error, setError] = useState<string | null>(null)

  const createMutation = useMutation({
    mutationFn: (data: TeamCreate) => teamsApi.createTeam(orgId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.teams(orgId) })
      onUpdate()
      resetDialog()
    },
    onError: (err: ApiError) => {
      const detail = (err.body as { detail?: string })?.detail
      setError(detail || "Failed to create team")
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (teamId: string) => teamsApi.deleteTeam(orgId, teamId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.teams(orgId) })
      onUpdate()
    },
  })

  const handleCreate = () => {
    createMutation.mutate({ name: teamName, description: teamDescription || null })
  }

  const resetDialog = () => {
    setTeamName("")
    setTeamDescription("")
    setError(null)
    setCreateOpen(false)
  }

  const columns: ColumnDef<Team>[] = useMemo(
    () => [
      {
        accessorKey: "name",
        header: "Team",
        cell: ({ row }) => {
          const team = row.original
          return (
            <div className="flex items-center gap-3">
              {isValidImageUrl(team.logo_url) ? (
                <img
                  src={team.logo_url}
                  alt={team.name}
                  className="size-8 rounded-md object-cover ring-1 ring-border"
                />
              ) : (
                <div className="flex size-8 items-center justify-center rounded-md bg-muted">
                  <Users className="size-4 text-muted-foreground" />
                </div>
              )}
              <span className="font-medium">{team.name}</span>
            </div>
          )
        },
      },
      {
        accessorKey: "description",
        header: "Description",
        cell: ({ row }) => {
          const description = row.getValue("description") as string | null
          return description ? (
            <span className="text-muted-foreground line-clamp-1 max-w-[300px]">
              {description}
            </span>
          ) : (
            <span className="text-muted-foreground/50 italic">No description</span>
          )
        },
      },
      {
        id: "actions",
        header: () => <div className="text-right">Actions</div>,
        cell: ({ row }) => {
          const team = row.original
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
                  {isAdmin && (
                    <DropdownMenuItem asChild>
                      <Link to="/org/team/$teamId/settings" params={{ teamId: team.id }}>
                        <Settings2 className="mr-2 size-4" />
                        Settings
                      </Link>
                    </DropdownMenuItem>
                  )}
                  {isAdmin && (
                    <>
                      <DropdownMenuSeparator />
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onSelect={(e) => e.preventDefault()}
                          >
                            <Trash2 className="mr-2 size-4" />
                            Delete team
                          </DropdownMenuItem>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Team</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to delete "{team.name}"? This will remove all team members and cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deleteMutation.mutate(team.id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )
        },
      },
    ],
    [isAdmin, deleteMutation]
  )

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold">Teams</h2>
          <p className="text-sm text-muted-foreground">
            Organize members into teams for better collaboration
          </p>
        </div>
        {isAdmin && (
          <Dialog open={createOpen} onOpenChange={(open) => open ? setCreateOpen(true) : resetDialog()}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Create Team
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Team</DialogTitle>
                <DialogDescription>
                  Create a new team within this organization.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="team-name">Team Name</Label>
                  <Input
                    id="team-name"
                    value={teamName}
                    onChange={(e) => setTeamName(e.target.value)}
                    placeholder="Engineering"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="team-description">Description</Label>
                  <Textarea
                    id="team-description"
                    value={teamDescription}
                    onChange={(e) => setTeamDescription(e.target.value)}
                    placeholder="Optional description"
                    rows={2}
                  />
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={resetDialog}>
                  Cancel
                </Button>
                <Button onClick={handleCreate} disabled={!teamName || createMutation.isPending}>
                  {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Create Team
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {isLoading ? (
        <div className="rounded-lg border border-border p-8">
          <div className="flex items-center justify-center">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        </div>
      ) : teams.length === 0 ? (
        <div className="rounded-lg border border-dashed flex flex-col items-center justify-center py-12 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted mb-4">
            <Users className="size-6 text-muted-foreground" />
          </div>
          <h3 className="text-base font-medium">No teams yet</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Create a team to organize your members
          </p>
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={teams}
          searchKey="name"
          searchPlaceholder="Search teams..."
        />
      )}
    </section>
  )
}

function SystemPromptsSection({ orgId }: { orgId: string }) {
  const { data: promptsData, isLoading } = useQuery({
    queryKey: ["org-prompts", orgId],
    queryFn: () => promptsApi.listOrgPrompts(orgId),
  })

  const prompts = promptsData?.data ?? []
  const systemPrompts = prompts.filter((p) => p.prompt_type === "system")

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end">
        <CreatePromptDialog orgId={orgId} defaultType="system" />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : systemPrompts.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title="No system prompts"
          description="System prompts configure the AI's behavior for all conversations in this organization."
        />
      ) : (
        <div className="space-y-4">
          {systemPrompts.map((prompt) => (
            <PromptCard key={prompt.id} prompt={prompt} orgId={orgId} />
          ))}
        </div>
      )}
    </div>
  )
}

function TemplatesSection({ orgId }: { orgId: string }) {
  const { data: promptsData, isLoading } = useQuery({
    queryKey: ["org-prompts", orgId],
    queryFn: () => promptsApi.listOrgPrompts(orgId),
  })

  const prompts = promptsData?.data ?? []
  const templatePrompts = prompts.filter((p) => p.prompt_type === "template")

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end">
        <CreatePromptDialog orgId={orgId} defaultType="template" />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : templatePrompts.length === 0 ? (
        <EmptyState
          icon={MessageSquare}
          title="No templates"
          description="Templates are reusable text snippets that members can insert into their messages."
        />
      ) : (
        <div className="space-y-4">
          {templatePrompts.map((prompt) => (
            <PromptCard key={prompt.id} prompt={prompt} orgId={orgId} />
          ))}
        </div>
      )}
    </div>
  )
}

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

function ApiKeysSection({ orgId }: { orgId: string }) {
  const queryClient = useQueryClient()

  const { data: apiKeyStatuses, isLoading } = useQuery({
    queryKey: ["org-api-keys", orgId],
    queryFn: () => apiKeysApi.listOrgKeys(orgId),
  })

  const { data: defaultProvider, isLoading: isLoadingDefault } = useQuery({
    queryKey: ["org-default-provider", orgId],
    queryFn: () => apiKeysApi.getOrgDefaultProvider(orgId),
  })

  return (
    <div className="space-y-8">
      {/* Default Provider Selection */}
      <section>
        <h2 className="text-lg font-semibold mb-4">Default Provider</h2>
        <DefaultProviderSelector
          orgId={orgId}
          currentProvider={defaultProvider?.provider}
          isLoading={isLoadingDefault}
        />
      </section>

      {/* API Key Cards */}
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
  currentProvider,
  isLoading,
}: {
  orgId: string
  currentProvider?: string
  isLoading: boolean
}) {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)

  const updateMutation = useMutation({
    mutationFn: (provider: LLMProvider) =>
      apiKeysApi.setOrgDefaultProvider(orgId, { provider }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org-default-provider", orgId] })
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
}: {
  provider: LLMProvider
  status?: APIKeyStatus
  orgId: string
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
            level === "org" ? (
              <span className="flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                Configured at organization level
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
          <SetApiKeyDialog provider={provider} orgId={orgId} hasKey={level === "org"} />
          {level === "org" && <DeleteApiKeyButton provider={provider} orgId={orgId} />}
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
  hasKey,
}: {
  provider: LLMProvider
  orgId: string
  hasKey: boolean
}) {
  const [open, setOpen] = useState(false)
  const [apiKey, setApiKey] = useState("")
  const [showKey, setShowKey] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: () => apiKeysApi.setOrgKey(orgId, { provider, api_key: apiKey }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org-api-keys", orgId] })
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

function DeleteApiKeyButton({ provider, orgId }: { provider: LLMProvider; orgId: string }) {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: () => apiKeysApi.deleteOrgKey(orgId, provider),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org-api-keys", orgId] })
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
            Teams using this organization's key will fall back to environment variables.
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

interface DangerZoneSectionProps {
  orgId: string
  orgName: string
  isOwner: boolean
  memberCount: number
}

function DangerZoneSection({ orgId, orgName, isOwner, memberCount }: DangerZoneSectionProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [confirmName, setConfirmName] = useState("")

  const leaveMutation = useMutation({
    mutationFn: () => organizationsApi.leaveOrganization(orgId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.organizations })
      navigate({ to: "/" })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => organizationsApi.deleteOrganization(orgId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.organizations })
      navigate({ to: "/" })
    },
  })

  return (
    <section>
      <h2 className="text-lg font-semibold mb-4 text-destructive">Danger Zone</h2>
      <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-6 space-y-4">
        {/* Leave Organization */}
        {!isOwner && (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Leave Organization</p>
              <p className="text-xs text-muted-foreground">
                You will lose access to all organization resources.
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
                  <AlertDialogTitle>Leave Organization</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to leave {orgName}? You will lose access to all organization resources.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => leaveMutation.mutate()}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {leaveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Leave Organization
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}

        {/* Delete Organization (Owner only) */}
        {isOwner && (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Delete Organization</p>
              <p className="text-xs text-muted-foreground">
                Permanently delete this organization and all its data.
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
                    Delete Organization
                  </AlertDialogTitle>
                  <AlertDialogDescription className="space-y-2">
                    <p>
                      This action cannot be undone. This will permanently delete <strong>{orgName}</strong>, all teams, and remove {memberCount} member{memberCount !== 1 && "s"}.
                    </p>
                    <p className="text-sm">
                      Type <strong>{orgName}</strong> to confirm:
                    </p>
                    <Input
                      value={confirmName}
                      onChange={(e) => setConfirmName(e.target.value)}
                      placeholder={orgName}
                    />
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel onClick={() => setConfirmName("")}>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => deleteMutation.mutate()}
                    disabled={confirmName !== orgName || deleteMutation.isPending}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {deleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Delete Organization
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

interface ChatFeaturesSectionProps {
  orgId: string
}

function ChatFeaturesSection({ orgId }: ChatFeaturesSectionProps) {
  const { data: settings, isLoading } = useOrgChatSettings(orgId)
  const updateMutation = useUpdateOrgChatSettings(orgId)

  const handleChatEnabledChange = (enabled: boolean) => {
    updateMutation.mutate({ chat_enabled: enabled })
  }

  const handleChatPanelEnabledChange = (enabled: boolean) => {
    updateMutation.mutate({ chat_panel_enabled: enabled })
  }

  const currentSettings: ChatSettingsType = settings ?? {
    chat_enabled: true,
    chat_panel_enabled: true,
  }

  return (
    <div className="space-y-4">
      <ChatSettings
        settings={currentSettings}
        onChatEnabledChange={handleChatEnabledChange}
        onChatPanelEnabledChange={handleChatPanelEnabledChange}
        isLoading={isLoading || updateMutation.isPending}
        level="org"
      />
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

function PromptCard({ prompt, orgId }: { prompt: Prompt; orgId: string }) {
  const queryClient = useQueryClient()

  const activateMutation = useMutation({
    mutationFn: () => promptsApi.activateOrgPrompt(orgId, prompt.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org-prompts", orgId] })
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
          <EditPromptDialog prompt={prompt} orgId={orgId} />
          <DeletePromptButton prompt={prompt} orgId={orgId} />
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

function CreatePromptDialog({ orgId, defaultType = "template" }: { orgId: string; defaultType?: PromptType }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [content, setContent] = useState("")
  const [promptType, setPromptType] = useState<PromptType>(defaultType)
  const [error, setError] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const createMutation = useMutation({
    mutationFn: (data: PromptCreate) => promptsApi.createOrgPrompt(orgId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org-prompts", orgId] })
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
          <Plus className="mr-2 size-4" />
          Create Prompt
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Prompt</DialogTitle>
          <DialogDescription>
            Create a new prompt for your organization.
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

function EditPromptDialog({ prompt, orgId }: { prompt: Prompt; orgId: string }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(prompt.name)
  const [description, setDescription] = useState(prompt.description ?? "")
  const [content, setContent] = useState(prompt.content)
  const [error, setError] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const updateMutation = useMutation({
    mutationFn: (data: PromptUpdate) => promptsApi.updateOrgPrompt(orgId, prompt.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org-prompts", orgId] })
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

function DeletePromptButton({ prompt, orgId }: { prompt: Prompt; orgId: string }) {
  const queryClient = useQueryClient()

  const deleteMutation = useMutation({
    mutationFn: () => promptsApi.deleteOrgPrompt(orgId, prompt.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org-prompts", orgId] })
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
