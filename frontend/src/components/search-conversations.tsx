import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Search,
  X,
  Loader2,
  MessageSquare,
  Star,
  ExternalLink,
  PanelRightOpen,
  MoreHorizontal,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useConversations } from "@/lib/queries";
import { useDebounce } from "@/hooks/useDebounce";
import { useWorkspace } from "@/lib/workspace";
import { useChatSelection } from "@/lib/chat-store";
import { useSettings } from "@/lib/settings-context";
import { formatRelativeTime } from "@/lib/utils";
import { useSidePanel } from "@/components/side-panel";

export function SearchConversations() {
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedQuery = useDebounce(searchQuery, 300);
  const { currentTeam } = useWorkspace();
  const navigate = useNavigate();
  const { setSelectedConversation } = useChatSelection();
  const { effectiveSettings } = useSettings();
  const { openChat } = useSidePanel();

  const { data, isLoading, error } = useConversations(
    currentTeam?.id,
    debouncedQuery.trim() || undefined,
    0,
    50,
  );

  const hasSearched = debouncedQuery.trim().length > 0;
  const conversations = data?.data || [];
  const showResults = conversations.length > 0;

  const chatEnabled = effectiveSettings?.chat_enabled ?? true;
  const chatPanelEnabled = effectiveSettings?.chat_panel_enabled ?? true;

  const handleRowClick = (conversationId: string) => {
    // Always navigate to chat page for default click
    navigate({ to: "/chat", search: { id: conversationId } });
  };

  const handleOpenInPanel = (conversationId: string, title: string) => {
    // Set the selected conversation and open the panel
    // The side panel watches for selectedConversationId changes and will load it
    setSelectedConversation(conversationId, title);
    openChat();
  };

  const handleOpenStandalone = (conversationId: string) => {
    navigate({ to: "/chat", search: { id: conversationId } });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search conversations..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9 pr-9"
          autoFocus
        />
        {searchQuery && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2"
            onClick={() => setSearchQuery("")}
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Clear search</span>
          </Button>
        )}
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">
            {hasSearched ? "Searching..." : "Loading conversations..."}
          </span>
        </div>
      )}

      {error && (
        <div className="rounded-md border border-destructive bg-destructive/10 p-4">
          <p className="text-sm text-destructive">
            Failed to load conversations. Please try again.
          </p>
        </div>
      )}

      {!isLoading && !showResults && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <MessageSquare className="h-12 w-12 text-muted-foreground/50" />
          <h3 className="mt-4 text-lg font-semibold">
            {hasSearched ? "No conversations found" : "No conversations yet"}
          </h3>
          <p className="mt-2 text-sm text-muted-foreground">
            {hasSearched
              ? "Try adjusting your search query"
              : "Start a new chat to begin"}
          </p>
        </div>
      )}

      {!isLoading && showResults && (
        <div className="flex flex-col gap-4">
          {hasSearched && (
            <p className="text-sm text-muted-foreground">
              Found {data?.count || 0}{" "}
              {data?.count === 1 ? "conversation" : "conversations"}
            </p>
          )}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12"></TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead className="w-48">Last Updated</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {conversations.map((conversation) => (
                  <TableRow
                    key={conversation.id}
                    className="cursor-pointer"
                    onClick={() => handleRowClick(conversation.id)}
                  >
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      {conversation.is_starred && (
                        <Star className="h-4 w-4 fill-yellow-500 text-yellow-500" />
                      )}
                    </TableCell>
                    <TableCell>{conversation.title}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {formatRelativeTime(conversation.updated_at)}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                            <span className="sr-only">Actions</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {chatEnabled && (
                            <DropdownMenuItem
                              onClick={() =>
                                handleOpenStandalone(conversation.id)
                              }
                            >
                              <ExternalLink className="mr-2 h-4 w-4" />
                              Open in Page
                            </DropdownMenuItem>
                          )}
                          {chatPanelEnabled && (
                            <DropdownMenuItem
                              onClick={() =>
                                handleOpenInPanel(
                                  conversation.id,
                                  conversation.title,
                                )
                              }
                            >
                              <PanelRightOpen className="mr-2 h-4 w-4" />
                              Open in Panel
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}
