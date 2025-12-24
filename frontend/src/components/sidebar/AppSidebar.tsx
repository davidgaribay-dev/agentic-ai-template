/**
 * Main sidebar shell component that composes all sidebar sections.
 */

import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Link, useRouterState, useLocation } from "@tanstack/react-router";

import { useEffectiveSettings } from "@/lib/settings-context";
import { cn } from "@/lib/utils";
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
import { baseNavItems, chatNavItem } from "./navigation-items";
import { TeamSwitcher } from "./TeamSwitcher";
import { NavUser } from "./NavUser";
import { RecentChats } from "./RecentChats";
import { DisabledChatSection } from "./DisabledChatSection";

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { t } = useTranslation();
  const router = useRouterState();
  const currentPath = router.location.pathname;
  const location = useLocation();
  const { state, isMobile, setOpenMobile } = useSidebar();
  const effectiveSettings = useEffectiveSettings();

  // Close mobile drawer on navigation
  useEffect(() => {
    if (isMobile) {
      setOpenMobile(false);
    }
  }, [location.pathname, isMobile, setOpenMobile]);

  const chatEnabled = effectiveSettings.chat_enabled;

  const navItems = chatEnabled ? [...baseNavItems, chatNavItem] : baseNavItems;

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
                <SidebarMenuItem key={item.titleKey}>
                  <SidebarMenuButton
                    asChild
                    isActive={currentPath === item.url}
                    tooltip={t(item.titleKey)}
                    className={cn(
                      state === "collapsed" &&
                        "flex items-center justify-center",
                    )}
                  >
                    <Link to={item.url}>
                      <item.icon />
                      {state === "expanded" && <span>{t(item.titleKey)}</span>}
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
