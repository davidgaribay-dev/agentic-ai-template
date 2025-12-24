import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { PanelRight } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { UserMenu } from "./user-menu";
import { useSidePanel } from "./side-panel";
import { WorkspaceSwitcher } from "./workspace-switcher";

export function Navbar() {
  const { t } = useTranslation();
  const { isAuthenticated, isLoading } = useAuth();
  const { toggle } = useSidePanel();

  if (isLoading || !isAuthenticated) {
    return null;
  }

  return (
    <header className="z-50 shrink-0 border-b bg-background">
      <div className="flex h-12 items-center justify-between px-4">
        <div className="flex items-center gap-4">
          <Link to="/" className="text-sm font-semibold">
            {t("app_name")}
          </Link>
          <WorkspaceSwitcher />
        </div>
        <div className="flex items-center gap-2">
          <UserMenu />
          <button
            onClick={toggle}
            className="flex size-8 items-center justify-center rounded-md hover:bg-muted"
            aria-label={t("aria_toggle_panel")}
          >
            <PanelRight className="size-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
