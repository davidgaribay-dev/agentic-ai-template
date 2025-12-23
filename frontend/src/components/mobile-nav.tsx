import { Link, useLocation } from "@tanstack/react-router";
import { Home, Search, Settings, Building2, PanelLeft } from "lucide-react";
import { useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  matchPaths?: string[];
}

const navItems: NavItem[] = [
  {
    href: "/",
    icon: Home,
    label: "Home",
    matchPaths: ["/", "/chat"],
  },
  {
    href: "/search",
    icon: Search,
    label: "Search",
    matchPaths: ["/search"],
  },
  {
    href: "/organizations",
    icon: Building2,
    label: "Orgs",
    matchPaths: ["/organizations", "/org/settings", "/org/team"],
  },
  {
    href: "/settings",
    icon: Settings,
    label: "Settings",
    matchPaths: ["/settings"],
  },
];

export function MobileBottomNav() {
  const location = useLocation();

  const isActive = (item: NavItem) => {
    if (item.matchPaths) {
      return item.matchPaths.some(
        (path) =>
          location.pathname === path ||
          location.pathname.startsWith(path + "/"),
      );
    }
    return location.pathname === item.href;
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:hidden">
      <div className="flex h-16 items-center justify-around px-2">
        {navItems.map((item) => {
          const active = isActive(item);
          return (
            <Link
              key={item.href}
              to={item.href}
              className={cn(
                "flex flex-col items-center justify-center gap-1 rounded-lg px-4 py-2 transition-colors min-w-[64px]",
                active
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <item.icon className={cn("size-5", active && "text-primary")} />
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
      {/* Safe area for iOS devices */}
      <div className="h-[env(safe-area-inset-bottom)]" />
    </nav>
  );
}

export function MobileHeader() {
  const { toggleSidebar } = useSidebar();

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-4 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:hidden">
      <button
        onClick={toggleSidebar}
        className="flex size-10 items-center justify-center rounded-lg hover:bg-muted active:bg-muted/80"
        aria-label="Open menu"
      >
        <PanelLeft className="size-5" />
      </button>
    </header>
  );
}
