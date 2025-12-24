import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Trash2, Camera, Building2, Users } from "lucide-react";
import {
  organizationsApi,
  teamsApi,
  type OrganizationUpdate,
  type TeamUpdate,
} from "@/lib/api";
import { workspaceKeys } from "@/lib/workspace";
import { isValidImageUrl } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ErrorAlert } from "@/components/ui/error-alert";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const detailsSchema = z.object({
  name: z.string().min(1, "prompts_name_required"),
  description: z.string(),
});

type DetailsFormData = z.infer<typeof detailsSchema>;

interface OrgDetailsSectionProps {
  org: {
    id: string;
    name: string;
    description: string | null;
    logo_url: string | null;
  };
  onUpdate: () => void;
}

export function OrgDetailsSection({ org, onUpdate }: OrgDetailsSectionProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [logoError, setLogoError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const form = useForm<DetailsFormData>({
    resolver: zodResolver(detailsSchema),
    defaultValues: {
      name: org.name,
      description: org.description ?? "",
    },
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { isDirty, errors },
  } = form;

  useEffect(() => {
    reset({
      name: org.name,
      description: org.description ?? "",
    });
  }, [org, reset]);

  const updateMutation = useMutation({
    mutationFn: (data: OrganizationUpdate) =>
      organizationsApi.updateOrganization(org.id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.organizations });
      onUpdate();
      reset({
        name: variables.name ?? org.name,
        description: variables.description ?? "",
      });
    },
  });

  const uploadLogoMutation = useMutation({
    mutationFn: (file: File) => organizationsApi.uploadLogo(org.id, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.organizations });
      onUpdate();
      setLogoError(null);
    },
    onError: (err) => {
      const detail =
        (err as { body?: { detail?: string } }).body?.detail ??
        t("entity_failed_upload_logo");
      setLogoError(detail);
    },
  });

  const deleteLogoMutation = useMutation({
    mutationFn: () => organizationsApi.deleteLogo(org.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.organizations });
      onUpdate();
      setLogoError(null);
    },
    onError: (err) => {
      const detail =
        (err as { body?: { detail?: string } }).body?.detail ??
        t("entity_failed_delete_logo");
      setLogoError(detail);
    },
  });

  const onSubmit = handleSubmit((data) => {
    updateMutation.mutate({
      name: data.name,
      description: data.description || null,
    });
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setLogoError(null);
      uploadLogoMutation.mutate(file);
    }
    e.target.value = "";
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleDeleteLogo = () => {
    setLogoError(null);
    deleteLogoMutation.mutate();
  };

  const isLogoLoading =
    uploadLogoMutation.isPending || deleteLogoMutation.isPending;

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-4">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          onChange={handleFileSelect}
          className="hidden"
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="group relative size-16 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring flex-shrink-0"
              disabled={isLogoLoading}
            >
              {isValidImageUrl(org.logo_url) ? (
                <img
                  src={org.logo_url}
                  alt={t("entity_org_logo")}
                  className="size-full rounded-lg object-cover"
                />
              ) : (
                <div className="flex size-full items-center justify-center rounded-lg bg-gradient-to-br from-primary/80 to-primary">
                  <Building2 className="size-7 text-primary-foreground" />
                </div>
              )}
              <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity">
                {isLogoLoading ? (
                  <Loader2 className="size-5 animate-spin text-white" />
                ) : (
                  <Camera className="size-5 text-white" />
                )}
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-40">
            <DropdownMenuItem onClick={handleUploadClick}>
              <Camera className="mr-2 size-4" />
              {org.logo_url ? t("com_change") : t("com_upload")}
            </DropdownMenuItem>
            {org.logo_url && (
              <DropdownMenuItem
                onClick={handleDeleteLogo}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 size-4" />
                {t("com_remove")}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="flex-1 space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="org-name" className="text-xs">
              {t("com_name")}
            </Label>
            <Input
              id="org-name"
              {...register("name")}
              placeholder={t("entity_org_name")}
              className="h-8 text-sm"
            />
            {errors.name?.message && (
              <p className="text-xs text-destructive">
                {t(errors.name.message as "prompts_name_required")}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="org-description" className="text-xs">
              {t("com_description")}
            </Label>
            <Textarea
              id="org-description"
              {...register("description")}
              placeholder={t("entity_optional_description")}
              rows={2}
              className="text-sm resize-none"
            />
          </div>
        </div>
      </div>

      {updateMutation.isError && (
        <ErrorAlert
          error={updateMutation.error}
          fallback={t("entity_failed_update_org")}
        />
      )}

      {logoError && <p className="text-xs text-destructive">{logoError}</p>}

      <Button
        size="sm"
        onClick={onSubmit}
        disabled={!isDirty || updateMutation.isPending}
      >
        {updateMutation.isPending && (
          <Loader2 className="mr-1.5 size-3 animate-spin" />
        )}
        {t("com_save_changes")}
      </Button>
    </div>
  );
}

interface TeamDetailsSectionProps {
  orgId: string;
  team: {
    id: string;
    name: string;
    description: string | null;
    logo_url: string | null;
  };
  onUpdate: () => void;
}

export function TeamDetailsSection({
  orgId,
  team,
  onUpdate,
}: TeamDetailsSectionProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [logoError, setLogoError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const form = useForm<DetailsFormData>({
    resolver: zodResolver(detailsSchema),
    defaultValues: {
      name: team.name,
      description: team.description ?? "",
    },
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { isDirty, errors },
  } = form;

  useEffect(() => {
    reset({
      name: team.name,
      description: team.description ?? "",
    });
  }, [team, reset]);

  const updateMutation = useMutation({
    mutationFn: (data: TeamUpdate) => teamsApi.updateTeam(orgId, team.id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.teams(orgId) });
      onUpdate();
      reset({
        name: variables.name ?? team.name,
        description: variables.description ?? "",
      });
    },
  });

  const uploadLogoMutation = useMutation({
    mutationFn: (file: File) => teamsApi.uploadLogo(orgId, team.id, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.teams(orgId) });
      onUpdate();
      setLogoError(null);
    },
    onError: (err) => {
      const detail =
        (err as { body?: { detail?: string } }).body?.detail ??
        t("entity_failed_upload_logo");
      setLogoError(detail);
    },
  });

  const deleteLogoMutation = useMutation({
    mutationFn: () => teamsApi.deleteLogo(orgId, team.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.teams(orgId) });
      onUpdate();
      setLogoError(null);
    },
    onError: (err) => {
      const detail =
        (err as { body?: { detail?: string } }).body?.detail ??
        t("entity_failed_delete_logo");
      setLogoError(detail);
    },
  });

  const onSubmit = handleSubmit((data) => {
    updateMutation.mutate({
      name: data.name,
      description: data.description || null,
    });
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setLogoError(null);
      uploadLogoMutation.mutate(file);
    }
    e.target.value = "";
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleDeleteLogo = () => {
    setLogoError(null);
    deleteLogoMutation.mutate();
  };

  const isLogoLoading =
    uploadLogoMutation.isPending || deleteLogoMutation.isPending;

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-4">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          onChange={handleFileSelect}
          className="hidden"
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="group relative size-16 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring flex-shrink-0"
              disabled={isLogoLoading}
            >
              {isValidImageUrl(team.logo_url) ? (
                <img
                  src={team.logo_url}
                  alt={t("entity_team_logo")}
                  className="size-full rounded-lg object-cover"
                />
              ) : (
                <div className="flex size-full items-center justify-center rounded-lg bg-gradient-to-br from-primary/80 to-primary">
                  <Users className="size-7 text-primary-foreground" />
                </div>
              )}
              <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity">
                {isLogoLoading ? (
                  <Loader2 className="size-5 animate-spin text-white" />
                ) : (
                  <Camera className="size-5 text-white" />
                )}
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-40">
            <DropdownMenuItem onClick={handleUploadClick}>
              <Camera className="mr-2 size-4" />
              {team.logo_url ? t("com_change") : t("com_upload")}
            </DropdownMenuItem>
            {team.logo_url && (
              <DropdownMenuItem
                onClick={handleDeleteLogo}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 size-4" />
                {t("com_remove")}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="flex-1 space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="team-name" className="text-xs">
              {t("com_name")}
            </Label>
            <Input
              id="team-name"
              {...register("name")}
              placeholder={t("entity_team_name")}
              className="h-8 text-sm"
            />
            {errors.name?.message && (
              <p className="text-xs text-destructive">
                {t(errors.name.message as "prompts_name_required")}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="team-description" className="text-xs">
              {t("com_description")}
            </Label>
            <Textarea
              id="team-description"
              {...register("description")}
              placeholder={t("entity_optional_description")}
              rows={2}
              className="text-sm resize-none"
            />
          </div>
        </div>
      </div>

      {updateMutation.isError && (
        <ErrorAlert
          error={updateMutation.error}
          fallback={t("entity_failed_update_team")}
        />
      )}

      {logoError && <p className="text-xs text-destructive">{logoError}</p>}

      <Button
        size="sm"
        onClick={onSubmit}
        disabled={!isDirty || updateMutation.isPending}
      >
        {updateMutation.isPending && (
          <Loader2 className="mr-1.5 size-3 animate-spin" />
        )}
        {t("com_save_changes")}
      </Button>
    </div>
  );
}
