/**
 * Navigation items configuration for the sidebar.
 */

import { Home, MessageSquare } from "lucide-react";

export const baseNavItems = [
  {
    title: "Home",
    url: "/",
    icon: Home,
  },
];

export const chatNavItem = {
  title: "Chats",
  url: "/search",
  icon: MessageSquare,
};
