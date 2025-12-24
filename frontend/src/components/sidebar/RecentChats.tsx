/**
 * Recent chats section with starred and recent conversations.
 */

import { useState, useRef, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Plus } from "lucide-react";

import { useWorkspace } from "@/lib/workspace";
import { type Conversation } from "@/lib/api";
import {
  useConversations,
  useDeleteConversation,
  useUpdateConversation,
} from "@/lib/queries";
import { useChatSelection } from "@/lib/chat-store";
import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
import { SidebarConversationItem } from "./SidebarConversationItem";

export function RecentChats() {
  const { state, isMobile, setOpenMobile } = useSidebar();
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
    if (isMobile) setOpenMobile(false);
  };

  const handleNewChat = () => {
    setSelectedConversation(null, null);
    navigate({ to: "/chat", search: {} });
    if (isMobile) setOpenMobile(false);
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
