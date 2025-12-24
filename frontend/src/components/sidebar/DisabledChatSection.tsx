/**
 * Placeholder section shown when chat is disabled.
 */

import { MessageSquare, Info } from "lucide-react";

import { useEffectiveSettings } from "@/lib/settings-context";
import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function DisabledChatSection() {
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
