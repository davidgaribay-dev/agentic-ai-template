/**
 * Team switcher dropdown for the sidebar header.
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import {
  Plus,
  Users,
  Check,
  ChevronsUpDown,
  PanelLeft,
  Settings2,
} from "lucide-react";

import { useWorkspace } from "@/lib/workspace";
import { CreateTeamDialog } from "@/components/create-team-dialog";
import {
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
import { cn, isValidImageUrl } from "@/lib/utils";

export function TeamSwitcher() {
  const { t } = useTranslation();
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
                  tooltip={currentTeam?.name ?? t("team_select")}
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
                        {currentTeam?.name ?? t("team_select")}
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
                  {t("team_teams_in", { org: currentOrg.name })}
                </DropdownMenuLabel>
                {isLoadingTeams ? (
                  <DropdownMenuItem disabled className="gap-2 p-2">
                    <span className="text-muted-foreground">
                      {t("team_loading")}
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
                      {t("team_no_teams")}
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
                      <span className="text-muted-foreground">
                        {t("team_create")}
                      </span>
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
          title={
            state === "expanded" ? t("sidebar_collapse") : t("sidebar_expand")
          }
          aria-label={
            state === "expanded" ? t("sidebar_collapse") : t("sidebar_expand")
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
