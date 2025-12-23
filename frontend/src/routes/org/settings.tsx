import { useState, useMemo } from "react";
import {
  createFileRoute,
  Link,
  redirect,
  useNavigate,
} from "@tanstack/react-router";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  AlertTriangle,
  Settings2,
  Key,
  MessageSquare,
  Sparkles,
  MoreHorizontal,
  ChevronDown,
  ChevronRight,
  Brain,
  Plug,
  Palette,
  FileSearch,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import {
  useWorkspace,
  useOrganizationMembers,
  workspaceKeys,
} from "@/lib/workspace";
import {
  teamsApi,
  promptsApi,
  apiKeysApi,
  invitationsApi,
  organizationsApi,
  type TeamCreate,
  type InvitationCreate,
  type OrgRole,
  type OrganizationChatSettings,
  type LLMProvider,
  ApiError,
} from "@/lib/api";
import { useOrgChatSettings, useUpdateOrgChatSettings } from "@/lib/queries";
import { ChatSettings } from "@/components/chat-settings";
import { MemorySettings } from "@/components/settings/memory-settings";
import {
  PromptRow,
  CreatePromptDialog,
  ProviderRow,
  DefaultProviderSelector,
  OrgDangerZone,
  OrgDetailsSection,
  MCPSettings,
  MCPServersList,
} from "@/components/settings";
import { OrgThemeSettings } from "@/components/settings/org-theme-settings";
import { OrgRAGSettings } from "@/components/settings/org-rag-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { isValidImageUrl, getInitials } from "@/lib/utils";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/ui/data-table";

const orgSettingsSearchSchema = z.object({
  tab: z
    .enum(["general", "people", "ai", "preferences", "theme", "rag"])
    .optional(),
});

export const Route = createFileRoute("/org/settings")({
  beforeLoad: ({ context }) => {
    if (!context.auth.isAuthenticated && !context.auth.isLoading) {
      throw redirect({ to: "/login" });
    }
  },
  component: OrgSettingsPage,
  validateSearch: orgSettingsSearchSchema,
});

type OrgSettingsTab = z.infer<typeof orgSettingsSearchSchema>["tab"];

function OrgSettingsPage() {
  const navigate = useNavigate();
  const { tab: tabFromUrl } = Route.useSearch();
  const { currentOrg, currentOrgRole, teams, refresh, isLoadingTeams } =
    useWorkspace();
  const { data: membersData, isLoading: isLoadingMembers } =
    useOrganizationMembers(currentOrg?.id);
  const members = membersData?.data ?? [];

  const currentTab = tabFromUrl || "general";

  const handleTabChange = (value: string) => {
    navigate({
      to: "/org/settings",
      search: { tab: value as OrgSettingsTab },
      replace: true,
    });
  };

  const isOwner = currentOrgRole === "owner";
  const isAdmin = currentOrgRole === "owner" || currentOrgRole === "admin";

  const tabs = [
    { value: "general", label: "General", icon: Building2 },
    { value: "people", label: "People", icon: Users },
    { value: "ai", label: "AI Configuration", icon: Sparkles },
    { value: "preferences", label: "Preferences", icon: Settings2 },
    { value: "theme", label: "Theme", icon: Palette },
    { value: "rag", label: "Document Search", icon: FileSearch },
  ];

  if (!currentOrg || currentOrgRole === null) {
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
    );
  }

  if (!isAdmin) {
    return (
      <div className="bg-background min-h-screen">
        <div className="mx-auto max-w-5xl px-6 py-8">
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="flex size-14 items-center justify-center rounded-full bg-destructive/10 mb-4">
              <AlertTriangle className="size-7 text-destructive" />
            </div>
            <h1 className="text-xl font-semibold mb-2">Access Denied</h1>
            <p className="text-sm text-muted-foreground mb-6 max-w-sm">
              Only organization owners and admins can access settings.
            </p>
            <Button size="sm" onClick={() => navigate({ to: "/" })}>
              Go to Home
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-background min-h-screen">
      <div className="mx-auto max-w-5xl px-4 md:px-6 py-4 md:py-8">
        <h1 className="text-lg font-semibold mb-4 md:mb-6">Organization Settings</h1>
        <Tabs
          value={currentTab}
          onValueChange={handleTabChange}
          orientation="vertical"
          className="flex flex-col md:flex-row gap-4 md:gap-6"
        >
          {/* Mobile: horizontal scrollable tabs */}
          {/* Desktop: vertical sidebar tabs */}
          <div className="w-full md:w-48 flex-shrink-0">
            <div className="md:sticky md:top-6 relative">
              {/* Fade hint on right edge for mobile scroll affordance */}
              <div className="absolute right-0 top-0 bottom-2 w-8 bg-gradient-to-l from-background to-transparent pointer-events-none md:hidden z-10" />
              <div className="overflow-x-auto md:overflow-visible scrollbar-none -mx-4 md:mx-0">
                <TabsList className="inline-flex md:flex flex-row md:flex-col items-stretch h-auto bg-transparent p-0 px-4 md:px-0 gap-2 md:gap-0 md:space-y-0.5 pb-2 md:pb-0 min-w-full">
                  {tabs.map((tab) => (
                    <TabsTrigger
                      key={tab.value}
                      value={tab.value}
                      className="justify-start px-3 py-2 md:px-2.5 md:py-1.5 h-auto text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 data-[state=active]:bg-muted data-[state=active]:text-foreground rounded-md whitespace-nowrap flex-shrink-0 min-h-[44px] md:min-h-0"
                    >
                      <tab.icon className="mr-2 size-4 md:size-3.5" />
                      {tab.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <TabsContent value="general" className="mt-0 space-y-6">
              <OrgDetailsSection org={currentOrg} onUpdate={refresh} />
              <OrgDangerZone
                orgId={currentOrg.id}
                orgName={currentOrg.name}
                isOwner={isOwner}
                memberCount={members.length}
                onLeave={() => navigate({ to: "/" })}
                onDelete={() => navigate({ to: "/" })}
              />
            </TabsContent>

            <TabsContent value="people" className="mt-0 space-y-4">
              <PeopleSection
                orgId={currentOrg.id}
                members={members}
                teams={teams}
                isLoadingMembers={isLoadingMembers}
                isLoadingTeams={isLoadingTeams}
                isAdmin={isAdmin}
                isOwner={isOwner}
                onUpdate={refresh}
              />
            </TabsContent>

            <TabsContent value="ai" className="mt-0 space-y-4">
              <AIConfigurationSection orgId={currentOrg.id} />
            </TabsContent>

            <TabsContent value="preferences" className="mt-0 space-y-4">
              <ChatFeaturesSection orgId={currentOrg.id} />
            </TabsContent>

            <TabsContent value="theme" className="mt-0">
              <OrgThemeSettings orgId={currentOrg.id} />
            </TabsContent>

            <TabsContent value="rag" className="mt-0">
              <OrgRAGSettings orgId={currentOrg.id} />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
}

type OrgMember = {
  id: string;
  user_id: string;
  role: OrgRole;
  user_email: string;
  user_full_name: string | null;
  user_profile_image_url: string | null;
};

type Team = {
  id: string;
  name: string;
  description: string | null;
  logo_url: string | null;
};

interface PeopleSectionProps {
  orgId: string;
  members: OrgMember[];
  teams: Team[];
  isLoadingMembers: boolean;
  isLoadingTeams: boolean;
  isAdmin: boolean;
  isOwner: boolean;
  onUpdate: () => void;
}

function PeopleSection({
  orgId,
  members,
  teams,
  isLoadingMembers,
  isLoadingTeams,
  isAdmin,
  isOwner,
  onUpdate,
}: PeopleSectionProps) {
  const [membersOpen, setMembersOpen] = useState(true);
  const [teamsOpen, setTeamsOpen] = useState(true);

  return (
    <div className="space-y-4">
      <Collapsible open={membersOpen} onOpenChange={setMembersOpen}>
        <div className="flex items-center justify-between py-2">
          <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium hover:text-foreground/80">
            {membersOpen ? (
              <ChevronDown className="size-4" />
            ) : (
              <ChevronRight className="size-4" />
            )}
            <Users className="size-4" />
            Members
            <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
              {members.length}
            </Badge>
          </CollapsibleTrigger>
          {isAdmin && <InviteMemberDialog orgId={orgId} isOwner={isOwner} />}
        </div>
        <CollapsibleContent>
          <MembersTable
            orgId={orgId}
            members={members}
            isLoading={isLoadingMembers}
            isAdmin={isAdmin}
            isOwner={isOwner}
            onUpdate={onUpdate}
          />
        </CollapsibleContent>
      </Collapsible>

      <div className="border-t" />

      <Collapsible open={teamsOpen} onOpenChange={setTeamsOpen}>
        <div className="flex items-center justify-between py-2">
          <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium hover:text-foreground/80">
            {teamsOpen ? (
              <ChevronDown className="size-4" />
            ) : (
              <ChevronRight className="size-4" />
            )}
            <Users className="size-4" />
            Teams
            <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
              {teams.length}
            </Badge>
          </CollapsibleTrigger>
          {isAdmin && <CreateTeamDialog orgId={orgId} onUpdate={onUpdate} />}
        </div>
        <CollapsibleContent>
          <TeamsTable
            orgId={orgId}
            teams={teams}
            isLoading={isLoadingTeams}
            isAdmin={isAdmin}
            onUpdate={onUpdate}
          />
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

function InviteMemberDialog({
  orgId,
  isOwner,
}: {
  orgId: string;
  isOwner: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<OrgRole>("member");
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inviteMutation = useMutation({
    mutationFn: (data: InvitationCreate) =>
      invitationsApi.createInvitation(orgId, data),
    onSuccess: (data) => {
      const baseUrl = window.location.origin;
      setInviteLink(`${baseUrl}/invite?token=${data.token}`);
      setError(null);
    },
    onError: (err: ApiError) => {
      const detail = (err.body as { detail?: string })?.detail;
      setError(detail || "Failed to send invitation");
    },
  });

  const handleInvite = () => {
    setInviteLink(null);
    inviteMutation.mutate({ email, org_role: role });
  };

  const handleCopyLink = () => {
    if (inviteLink) {
      navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const resetDialog = () => {
    setEmail("");
    setRole("member");
    setInviteLink(null);
    setError(null);
    setOpen(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => (o ? setOpen(true) : resetDialog())}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 text-xs">
          <Plus className="size-3 mr-1" />
          Invite
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Invite Member</DialogTitle>
          <DialogDescription className="text-xs">
            Send an invitation to join this organization.
          </DialogDescription>
        </DialogHeader>
        {inviteLink ? (
          <div className="space-y-3 py-3">
            <p className="text-xs text-muted-foreground">
              Share this link with {email}:
            </p>
            <div className="flex gap-2">
              <Input value={inviteLink} readOnly className="h-8 text-xs" />
              <Button
                variant="outline"
                size="icon"
                className="size-8"
                onClick={handleCopyLink}
              >
                {copied ? (
                  <Check className="size-3.5" />
                ) : (
                  <Copy className="size-3.5" />
                )}
              </Button>
            </div>
            <Button size="sm" className="w-full" onClick={resetDialog}>
              Done
            </Button>
          </div>
        ) : (
          <>
            <div className="space-y-3 py-3">
              <div className="space-y-1.5">
                <Label htmlFor="invite-email" className="text-xs">
                  Email
                </Label>
                <Input
                  id="invite-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="colleague@example.com"
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Role</Label>
                <Select
                  value={role}
                  onValueChange={(v) => setRole(v as OrgRole)}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="member">Member</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                    {isOwner && <SelectItem value="owner">Owner</SelectItem>}
                  </SelectContent>
                </Select>
              </div>
              {error && <p className="text-xs text-destructive">{error}</p>}
            </div>
            <DialogFooter>
              <Button variant="ghost" size="sm" onClick={resetDialog}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleInvite}
                disabled={!email || inviteMutation.isPending}
              >
                {inviteMutation.isPending && (
                  <Loader2 className="mr-1.5 size-3 animate-spin" />
                )}
                Send Invitation
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function MembersTable({
  orgId,
  members,
  isLoading,
  isAdmin,
  isOwner,
  onUpdate,
}: {
  orgId: string;
  members: OrgMember[];
  isLoading: boolean;
  isAdmin: boolean;
  isOwner: boolean;
  onUpdate: () => void;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const updateRoleMutation = useMutation({
    mutationFn: ({ memberId, role }: { memberId: string; role: OrgRole }) =>
      organizationsApi.updateMemberRole(orgId, memberId, role),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: workspaceKeys.membership(orgId),
      });
      onUpdate();
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: (memberId: string) =>
      organizationsApi.removeMember(orgId, memberId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: workspaceKeys.membership(orgId),
      });
      onUpdate();
    },
  });

  const getRoleBadge = (role: OrgRole) => {
    switch (role) {
      case "owner":
        return (
          <Badge
            variant="secondary"
            className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-0 text-xs h-5"
          >
            <Crown className="mr-1 size-2.5" />
            Owner
          </Badge>
        );
      case "admin":
        return (
          <Badge
            variant="secondary"
            className="bg-blue-500/15 text-blue-600 dark:text-blue-400 border-0 text-xs h-5"
          >
            <Shield className="mr-1 size-2.5" />
            Admin
          </Badge>
        );
      default:
        return (
          <Badge
            variant="outline"
            className="text-muted-foreground text-xs h-5"
          >
            <User className="mr-1 size-2.5" />
            Member
          </Badge>
        );
    }
  };

  const columns: ColumnDef<OrgMember>[] = useMemo(
    () => [
      {
        accessorKey: "user_full_name",
        header: "Member",
        cell: ({ row }) => {
          const member = row.original;
          const isCurrentUser = member.user_id === user?.id;
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
                  {isCurrentUser && (
                    <span className="text-xs text-muted-foreground">(you)</span>
                  )}
                </div>
                {member.user_full_name && (
                  <div className="text-xs text-muted-foreground truncate">
                    {member.user_email}
                  </div>
                )}
              </div>
            </div>
          );
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
          const member = row.original;
          const isCurrentUser = member.user_id === user?.id;
          const canManage =
            isAdmin && !isCurrentUser && member.role !== "owner";

          if (!canManage) return null;

          return (
            <div className="flex justify-end">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-7">
                    <MoreHorizontal className="size-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40">
                  <DropdownMenuItem
                    onClick={() =>
                      updateRoleMutation.mutate({
                        memberId: member.id,
                        role: "member",
                      })
                    }
                    disabled={member.role === "member"}
                  >
                    <User className="mr-2 size-3.5" />
                    Member
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() =>
                      updateRoleMutation.mutate({
                        memberId: member.id,
                        role: "admin",
                      })
                    }
                    disabled={member.role === "admin"}
                  >
                    <Shield className="mr-2 size-3.5" />
                    Admin
                  </DropdownMenuItem>
                  {isOwner && (
                    <DropdownMenuItem
                      onClick={() =>
                        updateRoleMutation.mutate({
                          memberId: member.id,
                          role: "owner",
                        })
                      }
                      disabled={member.role === "owner"}
                    >
                      <Crown className="mr-2 size-3.5" />
                      Owner
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onSelect={(e) => e.preventDefault()}
                      >
                        <UserMinus className="mr-2 size-3.5" />
                        Remove
                      </DropdownMenuItem>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Remove Member</AlertDialogTitle>
                        <AlertDialogDescription>
                          Remove {member.user_full_name || member.user_email}{" "}
                          from this organization?
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
          );
        },
      },
    ],
    [user?.id, isAdmin, isOwner, updateRoleMutation, removeMemberMutation],
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (members.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4 text-center">
        No members yet
      </p>
    );
  }

  return (
    <DataTable
      columns={columns}
      data={members}
      searchKey="user_full_name"
      searchPlaceholder="Search members..."
    />
  );
}

function CreateTeamDialog({
  orgId,
  onUpdate,
}: {
  orgId: string;
  onUpdate: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: (data: TeamCreate) => teamsApi.createTeam(orgId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.teams(orgId) });
      onUpdate();
      resetDialog();
    },
    onError: (err: ApiError) => {
      const detail = (err.body as { detail?: string })?.detail;
      setError(detail || "Failed to create team");
    },
  });

  const resetDialog = () => {
    setName("");
    setDescription("");
    setError(null);
    setOpen(false);
  };

  const handleCreate = () => {
    createMutation.mutate({ name, description: description || null });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => (o ? setOpen(true) : resetDialog())}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 text-xs">
          <Plus className="size-3 mr-1" />
          Create
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Create Team</DialogTitle>
          <DialogDescription className="text-xs">
            Create a new team within this organization.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-3">
          <div className="space-y-1.5">
            <Label htmlFor="team-name" className="text-xs">
              Name
            </Label>
            <Input
              id="team-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Engineering"
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="team-description" className="text-xs">
              Description
            </Label>
            <Textarea
              id="team-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
              rows={2}
              className="text-sm resize-none"
            />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={resetDialog}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleCreate}
            disabled={!name || createMutation.isPending}
          >
            {createMutation.isPending && (
              <Loader2 className="mr-1.5 size-3 animate-spin" />
            )}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TeamsTable({
  orgId,
  teams,
  isLoading,
  isAdmin,
  onUpdate,
}: {
  orgId: string;
  teams: Team[];
  isLoading: boolean;
  isAdmin: boolean;
  onUpdate: () => void;
}) {
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: (teamId: string) => teamsApi.deleteTeam(orgId, teamId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.teams(orgId) });
      onUpdate();
    },
  });

  const columns: ColumnDef<Team>[] = useMemo(
    () => [
      {
        accessorKey: "name",
        header: "Team",
        cell: ({ row }) => {
          const team = row.original;
          return (
            <div className="flex items-center gap-2.5">
              {isValidImageUrl(team.logo_url) ? (
                <img
                  src={team.logo_url}
                  alt={team.name}
                  className="size-7 rounded-md object-cover"
                />
              ) : (
                <div className="flex size-7 items-center justify-center rounded-md bg-muted">
                  <Users className="size-3.5 text-muted-foreground" />
                </div>
              )}
              <span className="text-sm font-medium">{team.name}</span>
            </div>
          );
        },
      },
      {
        accessorKey: "description",
        header: "Description",
        cell: ({ row }) => {
          const description = row.getValue("description") as string | null;
          return description ? (
            <span className="text-xs text-muted-foreground line-clamp-1">
              {description}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground/50 italic">
              No description
            </span>
          );
        },
      },
      {
        id: "actions",
        header: () => <div className="text-right">Actions</div>,
        cell: ({ row }) => {
          const team = row.original;
          return (
            <div className="flex justify-end gap-1">
              {isAdmin && (
                <Button variant="ghost" size="icon" className="size-7" asChild>
                  <Link
                    to="/org/team/$teamId/settings"
                    params={{ teamId: team.id }}
                  >
                    <Settings2 className="size-3.5" />
                  </Link>
                </Button>
              )}
              {isAdmin && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete Team</AlertDialogTitle>
                      <AlertDialogDescription>
                        Delete "{team.name}"? This will remove all team members.
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
              )}
            </div>
          );
        },
      },
    ],
    [isAdmin, deleteMutation],
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (teams.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4 text-center">
        No teams yet
      </p>
    );
  }

  return (
    <DataTable
      columns={columns}
      data={teams}
      searchKey="name"
      searchPlaceholder="Search teams..."
    />
  );
}

function AIConfigurationSection({ orgId }: { orgId: string }) {
  const [promptsOpen, setPromptsOpen] = useState(true);
  const [apiKeysOpen, setApiKeysOpen] = useState(true);

  return (
    <div className="space-y-4">
      <Collapsible open={promptsOpen} onOpenChange={setPromptsOpen}>
        <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium hover:text-foreground/80 py-2">
          {promptsOpen ? (
            <ChevronDown className="size-4" />
          ) : (
            <ChevronRight className="size-4" />
          )}
          <Sparkles className="size-4" />
          Prompts & Templates
        </CollapsibleTrigger>
        <CollapsibleContent>
          <PromptsSection orgId={orgId} />
        </CollapsibleContent>
      </Collapsible>

      <div className="border-t" />

      <Collapsible open={apiKeysOpen} onOpenChange={setApiKeysOpen}>
        <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium hover:text-foreground/80 py-2">
          {apiKeysOpen ? (
            <ChevronDown className="size-4" />
          ) : (
            <ChevronRight className="size-4" />
          )}
          <Key className="size-4" />
          API Keys
        </CollapsibleTrigger>
        <CollapsibleContent>
          <ApiKeysSection orgId={orgId} />
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

function PromptsSection({ orgId }: { orgId: string }) {
  const { data: promptsData, isLoading } = useQuery({
    queryKey: ["org-prompts", orgId],
    queryFn: () => promptsApi.listOrgPrompts(orgId),
  });

  const prompts = promptsData?.data ?? [];
  const systemPrompts = prompts.filter((p) => p.prompt_type === "system");
  const templatePrompts = prompts.filter((p) => p.prompt_type === "template");

  const [systemOpen, setSystemOpen] = useState(true);
  const [templatesOpen, setTemplatesOpen] = useState(true);

  const scope = { type: "org" as const, orgId };

  return (
    <div className="pl-6 space-y-3">
      <Collapsible open={systemOpen} onOpenChange={setSystemOpen}>
        <div className="flex items-center justify-between py-1">
          <CollapsibleTrigger className="flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground">
            {systemOpen ? (
              <ChevronDown className="size-3" />
            ) : (
              <ChevronRight className="size-3" />
            )}
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
            <p className="text-xs text-muted-foreground py-2 text-center">
              No system prompts
            </p>
          ) : (
            systemPrompts.map((prompt) => (
              <PromptRow
                key={prompt.id}
                prompt={prompt}
                scope={scope}
                compact
              />
            ))
          )}
        </CollapsibleContent>
      </Collapsible>

      <Collapsible open={templatesOpen} onOpenChange={setTemplatesOpen}>
        <div className="flex items-center justify-between py-1">
          <CollapsibleTrigger className="flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground">
            {templatesOpen ? (
              <ChevronDown className="size-3" />
            ) : (
              <ChevronRight className="size-3" />
            )}
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
            <p className="text-xs text-muted-foreground py-2 text-center">
              No templates
            </p>
          ) : (
            templatePrompts.map((prompt) => (
              <PromptRow
                key={prompt.id}
                prompt={prompt}
                scope={scope}
                compact
              />
            ))
          )}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

function ApiKeysSection({ orgId }: { orgId: string }) {
  const { data: apiKeyStatuses, isLoading } = useQuery({
    queryKey: ["org-api-keys", orgId],
    queryFn: () => apiKeysApi.listOrgKeys(orgId),
  });
  const { data: defaultProvider, isLoading: isLoadingDefault } = useQuery({
    queryKey: ["org-default-provider", orgId],
    queryFn: () => apiKeysApi.getOrgDefaultProvider(orgId),
  });

  const scope = { type: "org" as const, orgId };

  return (
    <div className="pl-6 space-y-4">
      <div className="flex items-center gap-3">
        <Label className="text-xs text-muted-foreground">Default:</Label>
        <DefaultProviderSelector
          scope={scope}
          currentProvider={defaultProvider?.provider}
          isLoading={isLoadingDefault}
        />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-2">
          {(["openai", "anthropic", "google"] as LLMProvider[]).map(
            (provider) => {
              const status = apiKeyStatuses?.find(
                (s) => s.provider === provider,
              );
              return (
                <ProviderRow
                  key={provider}
                  provider={provider}
                  status={status}
                  scope={scope}
                />
              );
            },
          )}
        </div>
      )}
    </div>
  );
}

function ChatFeaturesSection({ orgId }: { orgId: string }) {
  const { data: settings, isLoading } = useOrgChatSettings(orgId);
  const updateMutation = useUpdateOrgChatSettings(orgId);

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 py-2">
          <MessageSquare className="size-4" />
          <span className="text-sm font-medium">Chat Features</span>
        </div>
        <ChatSettings
          settings={
            settings ?? {
              chat_enabled: true,
              chat_panel_enabled: true,
              memory_enabled: true,
              mcp_enabled: true,
              disabled_mcp_servers: [],
              disabled_tools: [],
            }
          }
          onChatEnabledChange={(enabled) =>
            updateMutation.mutate({ chat_enabled: enabled })
          }
          onChatPanelEnabledChange={(enabled) =>
            updateMutation.mutate({ chat_panel_enabled: enabled })
          }
          isLoading={isLoading || updateMutation.isPending}
          level="org"
        />
      </div>

      <div className="border-t pt-4">
        <div className="flex items-center gap-2 py-2">
          <Brain className="size-4" />
          <span className="text-sm font-medium">Memory</span>
        </div>
        <p className="text-xs text-muted-foreground mb-2">
          When disabled, memory will be turned off for all teams and users in
          this organization.
        </p>
        <MemorySettings
          memoryEnabled={settings?.memory_enabled ?? true}
          onMemoryEnabledChange={(enabled) =>
            updateMutation.mutate({ memory_enabled: enabled })
          }
          isLoading={isLoading || updateMutation.isPending}
          level="org"
        />
      </div>

      <div className="border-t pt-4">
        <MCPSection
          orgId={orgId}
          settings={settings}
          updateMutation={updateMutation}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
}

function MCPSection({
  orgId,
  settings,
  updateMutation,
  isLoading,
}: {
  orgId: string;
  settings: OrganizationChatSettings | undefined;
  updateMutation: ReturnType<typeof useUpdateOrgChatSettings>;
  isLoading: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 py-2">
        <Plug className="size-4" />
        <span className="text-sm font-medium">MCP Integration</span>
      </div>
      <p className="text-xs text-muted-foreground">
        Configure Model Context Protocol (MCP) servers to extend AI capabilities
        with external tools.
      </p>

      <MCPSettings
        mcpEnabled={settings?.mcp_enabled ?? true}
        mcpAllowCustomServers={settings?.mcp_allow_custom_servers ?? true}
        onMCPEnabledChange={(enabled) =>
          updateMutation.mutate({ mcp_enabled: enabled })
        }
        onMCPAllowCustomServersChange={(allowed) =>
          updateMutation.mutate({ mcp_allow_custom_servers: allowed })
        }
        isLoading={isLoading || updateMutation.isPending}
        level="org"
      />

      <div className="mt-4">
        <MCPServersList scope={{ type: "org", orgId }} />
      </div>
    </div>
  );
}
