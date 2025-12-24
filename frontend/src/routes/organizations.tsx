import { useState, useRef, useMemo, useCallback } from "react";
import {
  createFileRoute,
  redirect,
  Link,
  useNavigate,
} from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef, Row } from "@tanstack/react-table";
import {
  Building2,
  Plus,
  Loader2,
  Check,
  Settings,
  Users,
  AlertTriangle,
  Camera,
  Trash2,
  ArrowUpDown,
  MoreHorizontal,
  ArrowRightLeft,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useWorkspace, workspaceKeys } from "@/lib/workspace";
import {
  organizationsApi,
  teamsApi,
  type OrganizationCreate,
  type TeamCreate,
  type Organization,
  ApiError,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { isValidImageUrl } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const Route = createFileRoute("/organizations")({
  beforeLoad: ({ context }) => {
    if (!context.auth.isAuthenticated && !context.auth.isLoading) {
      throw redirect({ to: "/login" });
    }
  },
  component: OrganizationsPage,
});

function OrganizationsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const {
    currentOrg,
    currentOrgRole,
    organizations,
    isLoadingOrgs,
    switchOrganization,
    refresh,
  } = useWorkspace();

  const isPlatformAdmin = user?.is_platform_admin ?? false;
  const isCurrentOrgAdmin =
    currentOrgRole === "owner" || currentOrgRole === "admin";

  if (!isLoadingOrgs && currentOrg && currentOrgRole === null) {
    return (
      <div className="bg-background min-h-screen">
        <div className="mx-auto max-w-4xl px-6 py-8">
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </div>
      </div>
    );
  }

  if (!isLoadingOrgs && currentOrgRole === "member") {
    return (
      <div className="bg-background min-h-screen">
        <div className="mx-auto max-w-4xl px-6 py-8">
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10 mb-4">
              <AlertTriangle className="h-8 w-8 text-destructive" />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight mb-2">
              {t("error_access_denied")}
            </h1>
            <p className="text-muted-foreground mb-6 max-w-md">
              {t("error_no_permission_org_settings")}
            </p>
            <Button onClick={() => navigate({ to: "/" })}>
              {t("error_go_home")}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-background min-h-screen">
      <div className="mx-auto max-w-4xl px-6 py-8">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex size-12 items-center justify-center rounded-full bg-gradient-to-br from-primary/80 to-primary ring-2 ring-border">
              <Building2 className="size-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-xl font-semibold">{t("org_title")}</h1>
              <p className="text-sm text-muted-foreground">
                {isPlatformAdmin ? t("org_manage") : t("org_view_switch")}
              </p>
            </div>
          </div>
          <CreateOrganizationDialog onSuccess={refresh} />
        </div>

        {/* Organizations Table */}
        {isLoadingOrgs ? (
          <div className="rounded-lg border border-border p-8">
            <div className="flex items-center justify-center">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          </div>
        ) : organizations.length === 0 ? (
          <div className="rounded-lg border border-dashed flex flex-col items-center justify-center py-16 text-center">
            <div className="flex size-14 items-center justify-center rounded-full bg-muted mb-4">
              <Building2 className="size-7 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium">{t("org_no_orgs")}</h3>
            <p className="text-sm text-muted-foreground mt-1 mb-6 max-w-sm">
              {t("org_create_first")}
            </p>
            <CreateOrganizationDialog onSuccess={refresh} />
          </div>
        ) : (
          <OrganizationsDataTable
            data={organizations}
            currentOrgId={currentOrg?.id}
            isCurrentOrgAdmin={isCurrentOrgAdmin}
            onSwitch={switchOrganization}
          />
        )}
      </div>
    </div>
  );
}

interface OrganizationsDataTableProps {
  data: Organization[];
  currentOrgId?: string;
  isCurrentOrgAdmin: boolean;
  onSwitch: (orgId: string) => void;
}

function OrganizationsDataTable({
  data,
  currentOrgId,
  isCurrentOrgAdmin,
  onSwitch,
}: OrganizationsDataTableProps) {
  const { t } = useTranslation();
  const columns: ColumnDef<Organization>[] = useMemo(
    () => [
      {
        accessorKey: "name",
        header: ({ column }) => {
          return (
            <Button
              variant="ghost"
              className="-ml-4"
              onClick={() =>
                column.toggleSorting(column.getIsSorted() === "asc")
              }
            >
              {t("org_title")}
              <ArrowUpDown className="ml-2 size-4" />
            </Button>
          );
        },
        cell: ({ row }) => {
          const org = row.original;
          return (
            <div className="flex items-center gap-3">
              {isValidImageUrl(org.logo_url) ? (
                <img
                  src={org.logo_url}
                  alt={org.name}
                  className="size-10 rounded-lg object-cover ring-1 ring-border"
                />
              ) : (
                <div className="flex size-10 items-center justify-center rounded-lg bg-gradient-to-br from-primary/20 to-primary/10 ring-1 ring-border">
                  <Building2 className="size-5 text-primary/70" />
                </div>
              )}
              <span className="font-medium">{org.name}</span>
            </div>
          );
        },
      },
      {
        accessorKey: "description",
        header: t("com_description"),
        cell: ({ row }) => {
          const description = row.getValue("description") as string | null;
          return description ? (
            <span className="text-muted-foreground line-clamp-1 max-w-[300px]">
              {description}
            </span>
          ) : (
            <span className="text-muted-foreground/50 italic">
              {t("com_no_description")}
            </span>
          );
        },
      },
      {
        id: "status",
        header: t("com_status"),
        cell: ({ row }) => {
          const isCurrentOrg = row.original.id === currentOrgId;
          return isCurrentOrg ? (
            <Badge
              variant="secondary"
              className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-0"
            >
              <Check className="mr-1 size-3" />
              {t("com_active")}
            </Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground">
              {t("com_inactive")}
            </Badge>
          );
        },
      },
      {
        id: "actions",
        header: () => <div className="text-right">{t("com_actions")}</div>,
        cell: ({ row }) => {
          const org = row.original;
          const isCurrentOrg = org.id === currentOrgId;
          return (
            <div className="flex justify-end">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-8">
                    <MoreHorizontal className="size-4" />
                    <span className="sr-only">{t("com_open_menu")}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  {!isCurrentOrg && (
                    <DropdownMenuItem onClick={() => onSwitch(org.id)}>
                      <ArrowRightLeft className="mr-2 size-4" />
                      {t("org_switch_to")}
                    </DropdownMenuItem>
                  )}
                  {isCurrentOrg && (
                    <DropdownMenuItem disabled>
                      <Check className="mr-2 size-4" />
                      {t("org_current")}
                    </DropdownMenuItem>
                  )}
                  {isCurrentOrgAdmin && isCurrentOrg && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem asChild>
                        <Link to="/org/settings">
                          <Settings className="mr-2 size-4" />
                          {t("com_settings")}
                        </Link>
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        },
      },
    ],
    [currentOrgId, isCurrentOrgAdmin, onSwitch, t],
  );

  const renderMobileCard = useCallback(
    (row: Row<Organization>) => {
      const org = row.original;
      const isCurrentOrg = org.id === currentOrgId;

      return (
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              {isValidImageUrl(org.logo_url) ? (
                <img
                  src={org.logo_url}
                  alt={org.name}
                  className="size-10 rounded-lg object-cover ring-1 ring-border flex-shrink-0"
                />
              ) : (
                <div className="flex size-10 items-center justify-center rounded-lg bg-gradient-to-br from-primary/20 to-primary/10 ring-1 ring-border flex-shrink-0">
                  <Building2 className="size-5 text-primary/70" />
                </div>
              )}
              <div className="min-w-0">
                <span className="font-medium block truncate">{org.name}</span>
                {org.description && (
                  <span className="text-sm text-muted-foreground line-clamp-1">
                    {org.description}
                  </span>
                )}
              </div>
            </div>
            {isCurrentOrg ? (
              <Badge
                variant="secondary"
                className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-0 flex-shrink-0"
              >
                <Check className="mr-1 size-3" />
                {t("com_active")}
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="text-muted-foreground flex-shrink-0"
              >
                {t("com_inactive")}
              </Badge>
            )}
          </div>
          <div className="flex gap-2">
            {!isCurrentOrg && (
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => onSwitch(org.id)}
              >
                <ArrowRightLeft className="mr-2 size-3.5" />
                {t("com_switch")}
              </Button>
            )}
            {isCurrentOrgAdmin && isCurrentOrg && (
              <Button variant="outline" size="sm" className="flex-1" asChild>
                <Link to="/org/settings">
                  <Settings className="mr-2 size-3.5" />
                  {t("com_settings")}
                </Link>
              </Button>
            )}
          </div>
        </div>
      );
    },
    [currentOrgId, isCurrentOrgAdmin, onSwitch, t],
  );

  return (
    <DataTable
      columns={columns}
      data={data}
      searchKey="name"
      searchPlaceholder={t("org_search")}
      mobileCardView
      renderMobileCard={renderMobileCard}
    />
  );
}

interface CreateOrganizationDialogProps {
  onSuccess: () => void;
}

type OnboardingStep = "org" | "team";

function CreateOrganizationDialog({
  onSuccess,
}: CreateOrganizationDialogProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { switchOrganization, switchTeam } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<OnboardingStep>("org");

  const [orgName, setOrgName] = useState("");
  const [orgDescription, setOrgDescription] = useState("");
  const [orgError, setOrgError] = useState<string | null>(null);
  const [createdOrgId, setCreatedOrgId] = useState<string | null>(null);
  const [orgLogoFile, setOrgLogoFile] = useState<File | null>(null);
  const [orgLogoPreview, setOrgLogoPreview] = useState<string | null>(null);
  const orgFileInputRef = useRef<HTMLInputElement>(null);

  const [teamName, setTeamName] = useState("");
  const [teamDescription, setTeamDescription] = useState("");
  const [teamError, setTeamError] = useState<string | null>(null);
  const [teamLogoFile, setTeamLogoFile] = useState<File | null>(null);
  const [teamLogoPreview, setTeamLogoPreview] = useState<string | null>(null);
  const teamFileInputRef = useRef<HTMLInputElement>(null);

  const [isUploadingOrgLogo, setIsUploadingOrgLogo] = useState(false);
  const [isUploadingTeamLogo, setIsUploadingTeamLogo] = useState(false);

  const createOrgMutation = useMutation({
    mutationFn: (data: OrganizationCreate) =>
      organizationsApi.createOrganization(data),
    onSuccess: async (newOrg) => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.organizations });
      switchOrganization(newOrg.id);
      setCreatedOrgId(newOrg.id);

      // Upload org logo if selected
      if (orgLogoFile) {
        setIsUploadingOrgLogo(true);
        try {
          await organizationsApi.uploadLogo(newOrg.id, orgLogoFile);
          queryClient.invalidateQueries({
            queryKey: workspaceKeys.organizations,
          });
        } catch (err) {
          console.error("Failed to upload org logo:", err);
        } finally {
          setIsUploadingOrgLogo(false);
        }
      }

      setStep("team");
      setOrgError(null);
    },
    onError: (err: ApiError) => {
      const detail = (err.body as { detail?: string })?.detail;
      setOrgError(detail || t("entity_failed_update_org"));
    },
  });

  const createTeamMutation = useMutation({
    mutationFn: (data: TeamCreate) => teamsApi.createTeam(createdOrgId!, data),
    onSuccess: async (newTeam) => {
      queryClient.invalidateQueries({
        queryKey: workspaceKeys.teams(createdOrgId!),
      });
      switchTeam(newTeam.id);

      // Upload team logo if selected
      if (teamLogoFile) {
        setIsUploadingTeamLogo(true);
        try {
          await teamsApi.uploadLogo(createdOrgId!, newTeam.id, teamLogoFile);
          queryClient.invalidateQueries({
            queryKey: workspaceKeys.teams(createdOrgId!),
          });
        } catch (err) {
          console.error("Failed to upload team logo:", err);
        } finally {
          setIsUploadingTeamLogo(false);
        }
      }

      onSuccess();
      resetDialog();
    },
    onError: (err: ApiError) => {
      const detail = (err.body as { detail?: string })?.detail;
      setTeamError(detail || t("team_failed_create"));
    },
  });

  const handleOrgLogoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setOrgLogoFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setOrgLogoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
    e.target.value = "";
  };

  const handleTeamLogoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setTeamLogoFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setTeamLogoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
    e.target.value = "";
  };

  const handleCreateOrg = () => {
    setOrgError(null);
    createOrgMutation.mutate({
      name: orgName,
      description: orgDescription || null,
    });
  };

  const handleCreateTeam = () => {
    if (!createdOrgId) return;
    setTeamError(null);
    createTeamMutation.mutate({
      name: teamName,
      description: teamDescription || null,
    });
  };

  const handleSkipTeam = () => {
    onSuccess();
    resetDialog();
  };

  const resetDialog = () => {
    setOrgName("");
    setOrgDescription("");
    setOrgError(null);
    setOrgLogoFile(null);
    setOrgLogoPreview(null);
    setTeamName("");
    setTeamDescription("");
    setTeamError(null);
    setTeamLogoFile(null);
    setTeamLogoPreview(null);
    setCreatedOrgId(null);
    setStep("org");
    setOpen(false);
  };

  const isCreatingOrg = createOrgMutation.isPending || isUploadingOrgLogo;
  const isCreatingTeam = createTeamMutation.isPending || isUploadingTeamLogo;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => (o ? setOpen(true) : resetDialog())}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          {t("org_new")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        {step === "org" ? (
          <>
            <DialogHeader>
              <DialogTitle>{t("org_create")}</DialogTitle>
              <DialogDescription>{t("org_create_desc")}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {/* Organization Logo Upload */}
              <div className="space-y-2">
                <Label>{t("com_logo_optional")}</Label>
                <div className="flex items-center gap-4">
                  <input
                    ref={orgFileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp"
                    onChange={handleOrgLogoSelect}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => orgFileInputRef.current?.click()}
                    className="group relative size-16 rounded-lg border-2 border-dashed border-border hover:border-primary/50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={t("org_logo_upload_aria")}
                  >
                    {orgLogoPreview ? (
                      <img
                        src={orgLogoPreview}
                        alt={t("com_logo_preview")}
                        className="size-full rounded-lg object-cover"
                      />
                    ) : (
                      <div className="flex size-full items-center justify-center rounded-lg bg-muted">
                        <Building2 className="size-6 text-muted-foreground" />
                      </div>
                    )}
                    <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/60 opacity-0 transition-all duration-200 group-hover:opacity-100">
                      <Camera className="size-5 text-white" />
                    </div>
                  </button>
                  {orgLogoFile && (
                    <div className="flex flex-col gap-1">
                      <span className="text-sm text-muted-foreground">
                        {orgLogoFile.name}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-auto p-0 text-destructive hover:text-destructive"
                        onClick={() => {
                          setOrgLogoFile(null);
                          setOrgLogoPreview(null);
                        }}
                      >
                        <Trash2 className="mr-1 size-3" />
                        {t("com_remove")}
                      </Button>
                    </div>
                  )}
                  {!orgLogoFile && (
                    <span className="text-sm text-muted-foreground">
                      {t("com_click_upload_logo")}
                    </span>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="org-name">{t("org_name_label")}</Label>
                <Input
                  id="org-name"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  placeholder={t("org_name_placeholder")}
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="org-description">
                  {t("org_description_optional")}
                </Label>
                <Textarea
                  id="org-description"
                  value={orgDescription}
                  onChange={(e) => setOrgDescription(e.target.value)}
                  placeholder={t("org_description_placeholder")}
                  rows={3}
                />
              </div>
              {orgError && (
                <p className="text-sm text-destructive">{orgError}</p>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={resetDialog}>
                {t("com_cancel")}
              </Button>
              <Button
                onClick={handleCreateOrg}
                disabled={!orgName.trim() || isCreatingOrg}
              >
                {isCreatingOrg && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {t("com_continue")}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{t("team_create_first_title")}</DialogTitle>
              <DialogDescription>
                {t("team_create_first_desc")}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {/* Team Logo Upload */}
              <div className="space-y-2">
                <Label>{t("com_logo_optional")}</Label>
                <div className="flex items-center gap-4">
                  <input
                    ref={teamFileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp"
                    onChange={handleTeamLogoSelect}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => teamFileInputRef.current?.click()}
                    className="group relative size-16 rounded-lg border-2 border-dashed border-border hover:border-primary/50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={t("team_logo_upload_aria")}
                  >
                    {teamLogoPreview ? (
                      <img
                        src={teamLogoPreview}
                        alt={t("com_logo_preview")}
                        className="size-full rounded-lg object-cover"
                      />
                    ) : (
                      <div className="flex size-full items-center justify-center rounded-lg bg-muted">
                        <Users className="size-6 text-muted-foreground" />
                      </div>
                    )}
                    <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/60 opacity-0 transition-all duration-200 group-hover:opacity-100">
                      <Camera className="size-5 text-white" />
                    </div>
                  </button>
                  {teamLogoFile && (
                    <div className="flex flex-col gap-1">
                      <span className="text-sm text-muted-foreground">
                        {teamLogoFile.name}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-auto p-0 text-destructive hover:text-destructive"
                        onClick={() => {
                          setTeamLogoFile(null);
                          setTeamLogoPreview(null);
                        }}
                      >
                        <Trash2 className="mr-1 size-3" />
                        {t("com_remove")}
                      </Button>
                    </div>
                  )}
                  {!teamLogoFile && (
                    <span className="text-sm text-muted-foreground">
                      {t("com_click_upload_logo")}
                    </span>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="team-name">{t("team_name_label")}</Label>
                <Input
                  id="team-name"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  placeholder={t("team_name_placeholder")}
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="team-description">
                  {t("team_description_optional")}
                </Label>
                <Textarea
                  id="team-description"
                  value={teamDescription}
                  onChange={(e) => setTeamDescription(e.target.value)}
                  placeholder={t("team_description_placeholder")}
                  rows={3}
                />
              </div>
              {teamError && (
                <p className="text-sm text-destructive">{teamError}</p>
              )}
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={handleSkipTeam}>
                {t("com_skip")}
              </Button>
              <Button
                onClick={handleCreateTeam}
                disabled={!teamName.trim() || isCreatingTeam}
              >
                {isCreatingTeam && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {t("team_create")}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
