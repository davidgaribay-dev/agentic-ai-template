/**
 * Navigation items configuration for the sidebar.
 */

import { Home, MessageSquare } from "lucide-react";

export const baseNavItems = [
  {
    titleKey: "nav_home" as const,
    url: "/",
    icon: Home,
  },
];

export const chatNavItem = {
  titleKey: "nav_chats" as const,
  url: "/search",
  icon: MessageSquare,
};
