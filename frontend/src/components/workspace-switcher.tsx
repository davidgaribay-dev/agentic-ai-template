/**
 * Team Switcher Component.
 *
 * Allows users to switch between teams within the current organization.
 * Displays in the navbar for easy access.
 * Organization switching is done via the Organizations page.
 */

import { useState } from "react"
import { Check, ChevronDown, Users, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { useWorkspace } from "@/lib/workspace"
import { CreateTeamDialog } from "@/components/create-team-dialog"
import { cn, isValidImageUrl, getInitials } from "@/lib/utils"

export function WorkspaceSwitcher() {
  const {
    currentOrg,
    currentOrgRole,
    currentTeam,
    teams,
    isLoadingOrgs,
    isLoadingTeams,
    switchTeam,
  } = useWorkspace()

  const [open, setOpen] = useState(false)
  const [createTeamOpen, setCreateTeamOpen] = useState(false)

  const canCreateTeam = currentOrgRole === "owner" || currentOrgRole === "admin"

  if (isLoadingOrgs || !currentOrg) {
    return (
      <Button variant="ghost" size="sm" disabled className="gap-2">
        <Users className="h-4 w-4" />
        <span className="text-muted-foreground">Loading...</span>
      </Button>
    )
  }

  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-2 max-w-[200px]">
            {currentTeam && isValidImageUrl(currentTeam.logo_url) ? (
              <Avatar className="h-4 w-4 shrink-0">
                <AvatarImage src={currentTeam.logo_url!} alt={currentTeam.name} />
                <AvatarFallback className="text-[8px]">{getInitials(currentTeam.name)}</AvatarFallback>
              </Avatar>
            ) : (
              <Users className="h-4 w-4 shrink-0" />
            )}
            <span className="truncate">
              {currentTeam?.name ?? "All Teams"}
            </span>
            <span className="text-muted-foreground text-xs truncate">
              ({currentOrg.name})
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[240px]">
          <DropdownMenuLabel>Teams in {currentOrg.name}</DropdownMenuLabel>
          {isLoadingTeams ? (
            <DropdownMenuItem disabled>
              <span className="text-muted-foreground">Loading teams...</span>
            </DropdownMenuItem>
          ) : (
            <>
              <DropdownMenuItem
                onClick={() => {
                  switchTeam(null)
                  setOpen(false)
                }}
                className={cn("gap-2", !currentTeam && "bg-accent")}
              >
                <Users className="h-4 w-4" />
                <span className="flex-1">All Teams</span>
                {!currentTeam && <Check className="h-4 w-4 text-primary" />}
              </DropdownMenuItem>
              {teams.length > 0 && <DropdownMenuSeparator />}
              {teams.map((team) => (
                <DropdownMenuItem
                  key={team.id}
                  onClick={() => {
                    switchTeam(team.id)
                    setOpen(false)
                  }}
                  className={cn("gap-2", currentTeam?.id === team.id && "bg-accent")}
                >
                  {isValidImageUrl(team.logo_url) ? (
                    <Avatar className="h-4 w-4">
                      <AvatarImage src={team.logo_url!} alt={team.name} />
                      <AvatarFallback className="text-[8px]">{getInitials(team.name)}</AvatarFallback>
                    </Avatar>
                  ) : (
                    <Users className="h-4 w-4" />
                  )}
                  <span className="flex-1 truncate">{team.name}</span>
                  {currentTeam?.id === team.id && (
                    <Check className="h-4 w-4 text-primary" />
                  )}
                </DropdownMenuItem>
              ))}
              {teams.length === 0 && (
                <DropdownMenuItem disabled>
                  <span className="text-muted-foreground">No teams yet</span>
                </DropdownMenuItem>
              )}
            </>
          )}
          {canCreateTeam && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => {
                  setOpen(false)
                  setCreateTeamOpen(true)
                }}
                className="gap-2"
              >
                <Plus className="h-4 w-4" />
                <span className="text-muted-foreground">Create Team</span>
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <CreateTeamDialog
        open={createTeamOpen}
        onOpenChange={setCreateTeamOpen}
      />
    </>
  )
}

/**
 * Compact version of team switcher for mobile or small screens.
 */
export function WorkspaceSwitcherCompact() {
  const { currentOrg, currentOrgRole, currentTeam, teams, isLoadingTeams, switchTeam } = useWorkspace()
  const [createTeamOpen, setCreateTeamOpen] = useState(false)

  const canCreateTeam = currentOrgRole === "owner" || currentOrgRole === "admin"

  if (!currentOrg) {
    return null
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon">
            {currentTeam && isValidImageUrl(currentTeam.logo_url) ? (
              <Avatar className="h-5 w-5">
                <AvatarImage src={currentTeam.logo_url!} alt={currentTeam.name} />
                <AvatarFallback className="text-[10px]">{getInitials(currentTeam.name)}</AvatarFallback>
              </Avatar>
            ) : (
              <Users className="h-5 w-5" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuLabel className="flex items-center gap-2">
            {currentTeam && isValidImageUrl(currentTeam.logo_url) && (
              <Avatar className="h-4 w-4">
                <AvatarImage src={currentTeam.logo_url!} alt={currentTeam.name} />
                <AvatarFallback className="text-[8px]">{getInitials(currentTeam.name)}</AvatarFallback>
              </Avatar>
            )}
            {currentTeam?.name ?? "All Teams"}
            <span className="text-xs text-muted-foreground">
              ({currentOrg.name})
            </span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {isLoadingTeams ? (
            <DropdownMenuItem disabled>
              <span className="text-muted-foreground">Loading...</span>
            </DropdownMenuItem>
          ) : (
            <>
              <DropdownMenuItem
                onClick={() => switchTeam(null)}
                className={cn("gap-2", !currentTeam && "bg-accent")}
              >
                <Users className="h-4 w-4" />
                <span className="truncate">All Teams</span>
                {!currentTeam && <Check className="h-4 w-4 text-primary" />}
              </DropdownMenuItem>
              {teams.map((team) => (
                <DropdownMenuItem
                  key={team.id}
                  onClick={() => switchTeam(team.id)}
                  className={cn("gap-2", currentTeam?.id === team.id && "bg-accent")}
                >
                  {isValidImageUrl(team.logo_url) ? (
                    <Avatar className="h-4 w-4">
                      <AvatarImage src={team.logo_url!} alt={team.name} />
                      <AvatarFallback className="text-[8px]">{getInitials(team.name)}</AvatarFallback>
                    </Avatar>
                  ) : (
                    <Users className="h-4 w-4" />
                  )}
                  <span className="truncate">{team.name}</span>
                  {currentTeam?.id === team.id && (
                    <Check className="h-4 w-4 text-primary" />
                  )}
                </DropdownMenuItem>
              ))}
            </>
          )}
          {canCreateTeam && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setCreateTeamOpen(true)}
                className="gap-2"
              >
                <Plus className="h-4 w-4" />
                <span className="text-muted-foreground">Create Team</span>
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <CreateTeamDialog
        open={createTeamOpen}
        onOpenChange={setCreateTeamOpen}
      />
    </>
  )
}
