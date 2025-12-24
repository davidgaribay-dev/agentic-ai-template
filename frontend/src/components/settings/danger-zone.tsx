import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Loader2,
  Trash2,
  LogOut,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { organizationsApi, teamsApi } from "@/lib/api";
import { workspaceKeys } from "@/lib/workspace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface OrgDangerZoneProps {
  orgId: string;
  orgName: string;
  isOwner: boolean;
  memberCount: number;
  onLeave: () => void;
  onDelete: () => void;
}

export function OrgDangerZone({
  orgId,
  orgName,
  isOwner,
  memberCount,
  onLeave,
  onDelete,
}: OrgDangerZoneProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [confirmName, setConfirmName] = useState("");
  const [dangerOpen, setDangerOpen] = useState(false);

  const leaveMutation = useMutation({
    mutationFn: () => organizationsApi.leaveOrganization(orgId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.organizations });
      onLeave();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => organizationsApi.deleteOrganization(orgId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.organizations });
      onDelete();
    },
  });

  return (
    <Collapsible open={dangerOpen} onOpenChange={setDangerOpen}>
      <CollapsibleTrigger className="flex items-center gap-2 text-xs text-muted-foreground hover:text-destructive py-2">
        {dangerOpen ? (
          <ChevronDown className="size-3" />
        ) : (
          <ChevronRight className="size-3" />
        )}
        <AlertTriangle className="size-3" />
        {t("danger_zone")}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-3 mt-2">
          {!isOwner && (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium">{t("danger_leave_org")}</p>
                <p className="text-[10px] text-muted-foreground">
                  {t("danger_leave_org_desc")}
                </p>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs border-destructive/50 text-destructive hover:bg-destructive hover:text-white"
                  >
                    <LogOut className="mr-1.5 size-3" />
                    {t("danger_leave")}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t("danger_leave_org")}</AlertDialogTitle>
                    <AlertDialogDescription>
                      {t("danger_leave_org_confirm", { name: orgName })}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t("com_cancel")}</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => leaveMutation.mutate()}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      {leaveMutation.isPending && (
                        <Loader2 className="mr-1.5 size-3 animate-spin" />
                      )}
                      {t("danger_leave")}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}

          {isOwner && (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium">{t("danger_delete_org")}</p>
                <p className="text-[10px] text-muted-foreground">
                  {t("danger_delete_org_desc")}
                </p>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="h-7 text-xs"
                  >
                    <Trash2 className="mr-1.5 size-3" />
                    {t("com_delete")}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2">
                      <AlertTriangle className="size-4 text-destructive" />
                      {t("danger_delete_org")}
                    </AlertDialogTitle>
                    <AlertDialogDescription className="space-y-3">
                      <p>
                        {t("danger_delete_org_confirm", {
                          name: orgName,
                          count: memberCount,
                        })}
                      </p>
                      <div>
                        <p className="text-xs mb-1">
                          {t("danger_type_confirm", { name: orgName })}
                        </p>
                        <Input
                          value={confirmName}
                          onChange={(e) => setConfirmName(e.target.value)}
                          placeholder={orgName}
                          className="h-8 text-sm"
                        />
                      </div>
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => setConfirmName("")}>
                      {t("com_cancel")}
                    </AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => deleteMutation.mutate()}
                      disabled={
                        confirmName !== orgName || deleteMutation.isPending
                      }
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      {deleteMutation.isPending && (
                        <Loader2 className="mr-1.5 size-3 animate-spin" />
                      )}
                      {t("com_delete")}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

interface TeamDangerZoneProps {
  orgId: string;
  teamId: string;
  teamName: string;
  canDelete: boolean;
  memberCount: number;
  onLeave: () => void;
  onDelete: () => void;
}

export function TeamDangerZone({
  orgId,
  teamId,
  teamName,
  canDelete,
  memberCount,
  onLeave,
  onDelete,
}: TeamDangerZoneProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [confirmName, setConfirmName] = useState("");
  const [dangerOpen, setDangerOpen] = useState(false);

  const leaveMutation = useMutation({
    mutationFn: () => teamsApi.leaveTeam(orgId, teamId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.teams(orgId) });
      queryClient.invalidateQueries({
        queryKey: ["team-members", orgId, teamId],
      });
      onLeave();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => teamsApi.deleteTeam(orgId, teamId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.teams(orgId) });
      onDelete();
    },
  });

  return (
    <Collapsible open={dangerOpen} onOpenChange={setDangerOpen}>
      <CollapsibleTrigger className="flex items-center gap-2 text-xs text-muted-foreground hover:text-destructive py-2">
        {dangerOpen ? (
          <ChevronDown className="size-3" />
        ) : (
          <ChevronRight className="size-3" />
        )}
        <AlertTriangle className="size-3" />
        {t("danger_zone")}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-3 mt-2">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium">{t("danger_leave_team")}</p>
              <p className="text-[10px] text-muted-foreground">
                {t("danger_leave_team_desc")}
              </p>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs border-destructive/50 text-destructive hover:bg-destructive hover:text-white"
                >
                  <LogOut className="mr-1.5 size-3" />
                  {t("danger_leave")}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t("danger_leave_team")}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {t("danger_leave_team_confirm", { name: teamName })}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t("com_cancel")}</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => leaveMutation.mutate()}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {leaveMutation.isPending && (
                      <Loader2 className="mr-1.5 size-3 animate-spin" />
                    )}
                    {t("danger_leave")}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>

          {canDelete && (
            <div className="flex items-center justify-between border-t border-destructive/20 pt-3">
              <div>
                <p className="text-xs font-medium">{t("danger_delete_team")}</p>
                <p className="text-[10px] text-muted-foreground">
                  {t("danger_delete_team_desc")}
                </p>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="h-7 text-xs"
                  >
                    <Trash2 className="mr-1.5 size-3" />
                    {t("com_delete")}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2">
                      <AlertTriangle className="size-4 text-destructive" />
                      {t("danger_delete_team")}
                    </AlertDialogTitle>
                    <AlertDialogDescription className="space-y-3">
                      <p>
                        {t("danger_delete_team_confirm", {
                          name: teamName,
                          count: memberCount,
                        })}
                      </p>
                      <div>
                        <p className="text-xs mb-1">
                          {t("danger_type_confirm", { name: teamName })}
                        </p>
                        <Input
                          value={confirmName}
                          onChange={(e) => setConfirmName(e.target.value)}
                          placeholder={teamName}
                          className="h-8 text-sm"
                        />
                      </div>
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => setConfirmName("")}>
                      {t("com_cancel")}
                    </AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => deleteMutation.mutate()}
                      disabled={
                        confirmName !== teamName || deleteMutation.isPending
                      }
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      {deleteMutation.isPending && (
                        <Loader2 className="mr-1.5 size-3 animate-spin" />
                      )}
                      {t("com_delete")}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
