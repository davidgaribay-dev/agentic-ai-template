/**
 * Individual conversation item in the sidebar with actions dropdown.
 */

import { useState, useCallback, memo } from "react";
import { MoreHorizontal, Star, Pencil, Trash2 } from "lucide-react";

import { type Conversation } from "@/lib/api";
import { useStarConversation } from "@/lib/queries";
import { SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface SidebarConversationItemProps {
  conversation: Conversation;
  isSelected: boolean;
  teamId?: string;
  onSelect: (id: string, title: string) => void;
  onRename: (conversation: Conversation) => void;
  onRequestDelete: (conversation: Conversation) => void;
}

export const SidebarConversationItem = memo(function SidebarConversationItem({
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
