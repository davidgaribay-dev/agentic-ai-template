import { useState, useRef, useEffect, memo, useCallback } from "react";
import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import {
  Home,
  MessageSquare,
  Building2,
  ChevronUp,
  LogOut,
  ChevronsUpDown,
  Users,
  Check,
  PanelLeft,
  Settings,
  Plus,
  Settings2,
  MoreHorizontal,
  Star,
  Pencil,
  Trash2,
  Info,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useWorkspace } from "@/lib/workspace";
import { useEffectiveSettings } from "@/lib/settings-context";
import { CreateTeamDialog } from "@/components/create-team-dialog";
import { type Conversation } from "@/lib/api";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn, getInitials, isValidImageUrl } from "@/lib/utils";
import {
  useConversations,
  useDeleteConversation,
  useStarConversation,
  useUpdateConversation,
} from "@/lib/queries";
import { useChatSelection } from "@/lib/chat-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
} from "@/components/ui/alert-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const navItems = [
  {
    title: "Home",
    url: "/",
    icon: Home,
  },
  {
    title: "Chats",
    url: "/search",
    icon: MessageSquare,
  },
];

function TeamSwitcher() {
  const { state, toggleSidebar } = useSidebar();
  const {
    currentOrg,
    currentOrgRole,
    currentTeam,
    teams,
    isLoadingOrgs,
    isLoadingTeams,
    switchTeam,
  } = useWorkspace();

  const [createTeamOpen, setCreateTeamOpen] = useState(false);

  const canCreateTeam =
    currentOrgRole === "owner" || currentOrgRole === "admin";

  if (isLoadingOrgs || !currentOrg) {
    return null;
  }

  return (
    <>
      <div
        className={cn(
          "flex items-center gap-1",
          state === "collapsed" && "flex-col",
        )}
      >
        <SidebarMenu className="flex-1">
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  tooltip={currentTeam?.name ?? "Select Team"}
                  className={cn(
                    "data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground h-8",
                    state === "collapsed" &&
                      "!size-8 !p-0 flex items-center justify-center",
                  )}
                >
                  {currentTeam && isValidImageUrl(currentTeam.logo_url) ? (
                    <img
                      src={currentTeam.logo_url}
                      alt={currentTeam.name}
                      className={cn(
                        "aspect-square size-6 rounded-md object-cover",
                        state === "collapsed" && "size-6",
                      )}
                    />
                  ) : (
                    <div
                      className={cn(
                        "flex aspect-square size-6 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground",
                        state === "collapsed" && "size-6",
                      )}
                    >
                      <Users className="size-3.5" />
                    </div>
                  )}
                  {state === "expanded" && (
                    <>
                      <span className="truncate text-sm font-medium">
                        {currentTeam?.name ?? "Select Team"}
                      </span>
                      <ChevronsUpDown className="ml-auto size-4" />
                    </>
                  )}
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="min-w-52 rounded-lg"
                align="start"
                side={state === "collapsed" ? "right" : "bottom"}
                sideOffset={4}
              >
                <DropdownMenuLabel className="text-xs text-muted-foreground">
                  Teams in {currentOrg.name}
                </DropdownMenuLabel>
                {isLoadingTeams ? (
                  <DropdownMenuItem disabled className="gap-2 p-2">
                    <span className="text-muted-foreground">
                      Loading teams...
                    </span>
                  </DropdownMenuItem>
                ) : (
                  teams.map((team) => (
                    <DropdownMenuItem
                      key={team.id}
                      onClick={() => switchTeam(team.id)}
                      className={cn(
                        "gap-2 p-2 group/team-item",
                        currentTeam?.id === team.id && "bg-accent",
                      )}
                    >
                      {isValidImageUrl(team.logo_url) ? (
                        <img
                          src={team.logo_url}
                          alt={team.name}
                          className="size-6 rounded-sm object-cover"
                        />
                      ) : (
                        <div className="flex size-6 items-center justify-center rounded-sm border">
                          <Users className="size-4 shrink-0" />
                        </div>
                      )}
                      <span className="flex-1 truncate">{team.name}</span>
                      {currentTeam?.id === team.id && (
                        <Check className="size-4 text-primary" />
                      )}
                      {canCreateTeam && (
                        <Link
                          to="/org/team/$teamId/settings"
                          params={{ teamId: team.id }}
                          onClick={(e) => e.stopPropagation()}
                          className="opacity-0 group-hover/team-item:opacity-100 transition-opacity p-1 hover:bg-accent rounded"
                        >
                          <Settings2 className="size-3.5 text-muted-foreground hover:text-foreground" />
                        </Link>
                      )}
                    </DropdownMenuItem>
                  ))
                )}
                {teams.length === 0 && !isLoadingTeams && (
                  <DropdownMenuItem disabled className="gap-2 p-2">
                    <span className="text-muted-foreground text-sm">
                      No teams yet
                    </span>
                  </DropdownMenuItem>
                )}
                {canCreateTeam && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => setCreateTeamOpen(true)}
                      className="gap-2 p-2"
                    >
                      <div className="flex size-6 items-center justify-center rounded-sm border bg-background">
                        <Plus className="size-4" />
                      </div>
                      <span className="text-muted-foreground">Create Team</span>
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
        <button
          onClick={toggleSidebar}
          className={cn(
            "flex size-8 items-center justify-center rounded-md hover:bg-sidebar-accent text-sidebar-foreground/70 hover:text-sidebar-foreground transition-colors",
            state === "collapsed" && "mt-1",
          )}
          title={state === "expanded" ? "Collapse sidebar" : "Expand sidebar"}
          aria-label={
            state === "expanded" ? "Collapse sidebar" : "Expand sidebar"
          }
          aria-expanded={state === "expanded"}
        >
          <PanelLeft className="size-4" />
        </button>
      </div>
      <CreateTeamDialog
        open={createTeamOpen}
        onOpenChange={setCreateTeamOpen}
      />
    </>
  );
}

function NavUser() {
  const { state } = useSidebar();
  const { user, logout } = useAuth();
  const { currentOrgRole } = useWorkspace();

  if (!user) return null;

  const initials = getInitials(user.full_name, user.email);
  const isAdmin = currentOrgRole === "owner" || currentOrgRole === "admin";

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              tooltip={user.full_name || user.email}
              className={cn(
                "data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground",
                state === "collapsed" &&
                  "!size-8 !p-0 flex items-center justify-center",
              )}
            >
              <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground text-xs font-medium overflow-hidden">
                {isValidImageUrl(user.profile_image_url) ? (
                  <img
                    src={user.profile_image_url}
                    alt={`${user.full_name || user.email}'s profile photo`}
                    loading="lazy"
                    className="size-full object-cover"
                  />
                ) : (
                  initials
                )}
              </div>
              {state === "expanded" && (
                <>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold">
                      {user.full_name || user.email}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {user.email}
                    </span>
                  </div>
                  <ChevronUp className="ml-auto size-4" />
                </>
              )}
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
            side={state === "collapsed" ? "right" : "top"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground text-xs font-medium overflow-hidden">
                  {isValidImageUrl(user.profile_image_url) ? (
                    <img
                      src={user.profile_image_url}
                      alt={`${user.full_name || user.email}'s profile photo`}
                      loading="lazy"
                      className="size-full object-cover"
                    />
                  ) : (
                    initials
                  )}
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">
                    {user.full_name || user.email}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {user.email}
                  </span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {isAdmin && (
              <DropdownMenuItem asChild>
                <Link to="/organizations" className="cursor-pointer">
                  <Building2 className="mr-2 size-4" />
                  Organizations
                </Link>
              </DropdownMenuItem>
            )}
            <DropdownMenuItem asChild>
              <Link to="/settings" className="cursor-pointer">
                <Settings className="mr-2 size-4" />
                Settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={logout} className="cursor-pointer">
              <LogOut className="mr-2 size-4" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

interface SidebarConversationItemProps {
  conversation: Conversation;
  isSelected: boolean;
  teamId?: string;
  onSelect: (id: string, title: string) => void;
  onRename: (conversation: Conversation) => void;
  onRequestDelete: (conversation: Conversation) => void;
}

const SidebarConversationItem = memo(function SidebarConversationItem({
  conversation,
  isSelected,
  teamId,
  onSelect,
  onRename,
  onRequestDelete,
}: SidebarConversationItemProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const starMutation = useStarConversation(teamId);

  const handleStar = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      starMutation.mutate({
        id: conversation.id,
        isStarred: !conversation.is_starred,
      });
      setActionsOpen(false);
    },
    [starMutation, conversation.id, conversation.is_starred],
  );

  const handleRename = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onRename(conversation);
      setActionsOpen(false);
    },
    [onRename, conversation],
  );

  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onRequestDelete(conversation);
      setActionsOpen(false);
    },
    [onRequestDelete, conversation],
  );

  const handleClick = useCallback(() => {
    onSelect(conversation.id, conversation.title);
  }, [onSelect, conversation.id, conversation.title]);

  const handleMouseEnter = useCallback(() => setIsHovered(true), []);
  const handleMouseLeave = useCallback(() => setIsHovered(false), []);
  const handleTriggerClick = useCallback(
    (e: React.MouseEvent) => e.stopPropagation(),
    [],
  );

  const showActions = isHovered || actionsOpen;

  return (
    <SidebarMenuItem
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <SidebarMenuButton
        onClick={handleClick}
        isActive={isSelected}
        className="text-sm pr-1"
      >
        <span className="flex items-center gap-1.5 truncate flex-1">
          {conversation.is_starred && (
            <Star className="size-3 shrink-0 fill-yellow-400 text-yellow-400" />
          )}
          <span className="truncate">{conversation.title}</span>
        </span>
        <DropdownMenu open={actionsOpen} onOpenChange={setActionsOpen}>
          <DropdownMenuTrigger asChild>
            <div
              role="button"
              tabIndex={0}
              className={cn(
                "shrink-0 rounded p-0.5 transition-opacity hover:bg-muted cursor-pointer",
                showActions ? "opacity-100" : "opacity-0",
              )}
              onClick={handleTriggerClick}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  setActionsOpen(true);
                }
              }}
              aria-label="Conversation actions"
            >
              <MoreHorizontal className="size-4 text-muted-foreground" />
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem onClick={handleStar}>
              <Star
                className={cn(
                  "mr-2 size-4",
                  conversation.is_starred && "fill-yellow-400 text-yellow-400",
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
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
});

function RecentChats() {
  const { state } = useSidebar();
  const navigate = useNavigate();
  const { currentTeam } = useWorkspace();
  const { selectedConversationId, setSelectedConversation } =
    useChatSelection();
  const [isOpen, setIsOpen] = useState(true);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [conversationToRename, setConversationToRename] =
    useState<Conversation | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [conversationToDelete, setConversationToDelete] =
    useState<Conversation | null>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  const teamId = currentTeam?.id;
  const { data: conversationsData, isLoading } = useConversations(teamId);
  const conversations = conversationsData?.data ?? [];
  const updateMutation = useUpdateConversation(teamId);
  const deleteMutation = useDeleteConversation(teamId);

  const starredConversations = conversations.filter((c) => c.is_starred);
  const recentConversations = conversations.filter((c) => !c.is_starred);

  const handleSelectConversation = (conversationId: string, title: string) => {
    setSelectedConversation(conversationId, title);
    navigate({ to: "/chat", search: { id: conversationId } });
  };

  const handleNewChat = () => {
    setSelectedConversation(null, null);
    navigate({ to: "/chat", search: {} });
  };

  const handleOpenRename = (conversation: Conversation) => {
    setConversationToRename(conversation);
    setNewTitle(conversation.title);
    setRenameDialogOpen(true);
  };

  const handleRename = () => {
    if (!conversationToRename || !newTitle.trim()) return;
    updateMutation.mutate(
      { id: conversationToRename.id, data: { title: newTitle.trim() } },
      {
        onSuccess: () => {
          if (selectedConversationId === conversationToRename.id) {
            setSelectedConversation(conversationToRename.id, newTitle.trim());
          }
          setRenameDialogOpen(false);
          setConversationToRename(null);
          setNewTitle("");
        },
      },
    );
  };

  const handleRequestDelete = (conversation: Conversation) => {
    setConversationToDelete(conversation);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = () => {
    if (!conversationToDelete) return;
    const conversationId = conversationToDelete.id;
    deleteMutation.mutate(conversationId, {
      onSuccess: () => {
        if (conversationId === selectedConversationId) {
          setSelectedConversation(null, null);
          navigate({ to: "/chat" });
        }
        setDeleteDialogOpen(false);
        setConversationToDelete(null);
      },
    });
  };

  useEffect(() => {
    if (renameDialogOpen && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renameDialogOpen]);

  if (state === "collapsed") {
    return (
      <SidebarGroup className="items-center px-0">
        <SidebarMenu className="items-center">
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="New Chat"
              onClick={handleNewChat}
              className="flex items-center justify-center"
            >
              <div className="flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Plus className="size-3" />
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Chats"
              asChild
              className="flex items-center justify-center"
            >
              <Link to="/chat">
                <MessageSquare className="size-4" />
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroup>
    );
  }

  return (
    <>
      <SidebarGroup>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={handleNewChat} className="gap-2">
              <div className="flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Plus className="size-3" />
              </div>
              <span>New Chat</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        {/* Starred section */}
        {starredConversations.length > 0 && (
          <div className="mt-2">
            <div className="flex items-center px-2 py-1">
              <span className="text-xs font-medium text-muted-foreground">
                Starred
              </span>
            </div>
            <SidebarMenu>
              {starredConversations.slice(0, 10).map((conversation) => (
                <SidebarConversationItem
                  key={conversation.id}
                  conversation={conversation}
                  isSelected={selectedConversationId === conversation.id}
                  teamId={teamId}
                  onSelect={handleSelectConversation}
                  onRename={handleOpenRename}
                  onRequestDelete={handleRequestDelete}
                />
              ))}
            </SidebarMenu>
          </div>
        )}

        {/* Recents section */}
        <Collapsible open={isOpen} onOpenChange={setIsOpen} className="mt-2">
          <div className="flex items-center justify-between px-2 py-1">
            <span className="text-xs font-medium text-muted-foreground">
              Recents
            </span>
            <CollapsibleTrigger asChild>
              <button className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                {isOpen ? "Hide" : "Show"}
              </button>
            </CollapsibleTrigger>
          </div>
          <CollapsibleContent>
            <SidebarMenu>
              {isLoading ? (
                <SidebarMenuItem>
                  <span className="px-2 py-1 text-xs text-muted-foreground">
                    Loading...
                  </span>
                </SidebarMenuItem>
              ) : recentConversations.length === 0 ? (
                <SidebarMenuItem>
                  <span className="px-2 py-1 text-xs text-muted-foreground">
                    {conversations.length === 0
                      ? "No conversations yet"
                      : "No recent conversations"}
                  </span>
                </SidebarMenuItem>
              ) : (
                recentConversations
                  .slice(0, 15)
                  .map((conversation) => (
                    <SidebarConversationItem
                      key={conversation.id}
                      conversation={conversation}
                      isSelected={selectedConversationId === conversation.id}
                      teamId={teamId}
                      onSelect={handleSelectConversation}
                      onRename={handleOpenRename}
                      onRequestDelete={handleRequestDelete}
                    />
                  ))
              )}
            </SidebarMenu>
          </CollapsibleContent>
        </Collapsible>
      </SidebarGroup>

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
                e.preventDefault();
                handleRename();
              }
            }}
            placeholder="Enter new title"
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRenameDialogOpen(false)}
            >
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
              This will delete "{conversationToDelete?.title}". This action
              cannot be undone.
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
  );
}

function DisabledChatSection() {
  const { state } = useSidebar();
  const effectiveSettings = useEffectiveSettings();
  const disabledBy = effectiveSettings.chat_disabled_by;

  const tooltipMessage =
    disabledBy === "org"
      ? "Chat disabled by organization"
      : disabledBy === "team"
        ? "Chat disabled by team"
        : "Chat disabled";

  if (state === "collapsed") {
    return (
      <SidebarGroup className="items-center px-0">
        <SidebarMenu className="items-center">
          <SidebarMenuItem>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center justify-center size-8 opacity-50 cursor-not-allowed">
                    <MessageSquare className="size-4 text-muted-foreground" />
                  </div>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p>{tooltipMessage}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroup>
    );
  }

  return (
    <SidebarGroup>
      <div className="px-2 py-3 text-sm text-muted-foreground flex items-center gap-2">
        <Info className="size-4" />
        <span>{tooltipMessage}</span>
      </div>
    </SidebarGroup>
  );
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const router = useRouterState();
  const currentPath = router.location.pathname;
  const { state } = useSidebar();
  const effectiveSettings = useEffectiveSettings();

  const chatEnabled = effectiveSettings.chat_enabled;

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader className={cn(state === "collapsed" && "items-center")}>
        <TeamSwitcher />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup
          className={cn(state === "collapsed" && "items-center px-0")}
        >
          <SidebarGroupContent>
            <SidebarMenu
              className={cn(state === "collapsed" && "items-center")}
            >
              {navItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={currentPath === item.url}
                    tooltip={item.title}
                    className={cn(
                      state === "collapsed" &&
                        "flex items-center justify-center",
                    )}
                  >
                    <Link to={item.url}>
                      <item.icon />
                      {state === "expanded" && <span>{item.title}</span>}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {chatEnabled ? <RecentChats /> : <DisabledChatSection />}
      </SidebarContent>
      <SidebarFooter className={cn(state === "collapsed" && "items-center")}>
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  );
}
