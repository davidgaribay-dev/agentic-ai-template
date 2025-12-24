import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Loader2,
  AlertCircle,
  FileSearch,
  Info,
  Upload,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  useTeamRAGSettings,
  useUpdateTeamRAGSettings,
  useDocuments,
} from "@/lib/queries";
import { DocumentUpload } from "@/components/documents/document-upload";
import { DocumentList } from "@/components/documents/document-list";
import type { TeamRAGSettingsUpdate } from "@/lib/api";

const teamRagSettingsSchema = z.object({
  rag_enabled: z.boolean(),
  rag_customization_enabled: z.boolean(),
  allow_user_customization: z.boolean(),
  chunk_size: z.number().min(100).max(4000),
  chunk_overlap: z.number().min(0).max(1000),
  chunks_per_query: z.number().min(1).max(20),
  similarity_threshold: z.number().min(0).max(1),
});

type TeamRagSettingsFormData = z.infer<typeof teamRagSettingsSchema>;

interface TeamRAGSettingsProps {
  orgId: string;
  teamId: string;
}

export function TeamRAGSettings({ orgId, teamId }: TeamRAGSettingsProps) {
  const { t } = useTranslation();
  const { data: teamSettings, isLoading: isLoadingSettings } =
    useTeamRAGSettings(orgId, teamId);
  const updateMutation = useUpdateTeamRAGSettings(orgId, teamId);
  const { refetch: refetchDocuments } = useDocuments({
    organization_id: orgId,
    team_id: teamId,
  });
  const [documentsOpen, setDocumentsOpen] = useState(true);

  const form = useForm<TeamRagSettingsFormData>({
    resolver: zodResolver(teamRagSettingsSchema),
    defaultValues: {
      rag_enabled: true,
      rag_customization_enabled: true,
      allow_user_customization: true,
      chunk_size: 1000,
      chunk_overlap: 200,
      chunks_per_query: 4,
      similarity_threshold: 0.7,
    },
  });

  const {
    formState: { isDirty },
    reset,
    register,
    watch,
    setValue,
  } = form;

  const ragEnabled = watch("rag_enabled");
  const ragCustomizationEnabled = watch("rag_customization_enabled");

  useEffect(() => {
    if (teamSettings) {
      reset({
        rag_enabled: teamSettings.rag_enabled,
        rag_customization_enabled: teamSettings.rag_customization_enabled,
        allow_user_customization: teamSettings.allow_user_customization,
        chunk_size: teamSettings.chunk_size,
        chunk_overlap: teamSettings.chunk_overlap,
        chunks_per_query: teamSettings.chunks_per_query,
        similarity_threshold: teamSettings.similarity_threshold,
      });
    }
  }, [teamSettings, reset]);

  const handleSave = form.handleSubmit((data) => {
    const updates: TeamRAGSettingsUpdate = {};

    if (data.rag_enabled !== teamSettings?.rag_enabled) {
      updates.rag_enabled = data.rag_enabled;
    }
    if (
      data.rag_customization_enabled !== teamSettings?.rag_customization_enabled
    ) {
      updates.rag_customization_enabled = data.rag_customization_enabled;
    }
    if (
      data.allow_user_customization !== teamSettings?.allow_user_customization
    ) {
      updates.allow_user_customization = data.allow_user_customization;
    }
    if (data.chunk_size !== teamSettings?.chunk_size) {
      updates.chunk_size = data.chunk_size;
    }
    if (data.chunk_overlap !== teamSettings?.chunk_overlap) {
      updates.chunk_overlap = data.chunk_overlap;
    }
    if (data.chunks_per_query !== teamSettings?.chunks_per_query) {
      updates.chunks_per_query = data.chunks_per_query;
    }
    if (data.similarity_threshold !== teamSettings?.similarity_threshold) {
      updates.similarity_threshold = data.similarity_threshold;
    }

    if (Object.keys(updates).length > 0) {
      updateMutation.mutate(updates, {
        onSuccess: () => {
          reset(data);
        },
      });
    }
  });

  const handleReset = () => {
    if (teamSettings) {
      reset({
        rag_enabled: teamSettings.rag_enabled,
        rag_customization_enabled: teamSettings.rag_customization_enabled,
        allow_user_customization: teamSettings.allow_user_customization,
        chunk_size: teamSettings.chunk_size,
        chunk_overlap: teamSettings.chunk_overlap,
        chunks_per_query: teamSettings.chunks_per_query,
        similarity_threshold: teamSettings.similarity_threshold,
      });
    }
  };

  if (isLoadingSettings) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!teamSettings) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{t("rag_failed_load")}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2">
                <FileSearch className="h-5 w-5" />
                {t("rag_team_title")}
              </CardTitle>
              <CardDescription>{t("rag_team_desc")}</CardDescription>
            </div>
            <Switch
              checked={ragEnabled}
              onCheckedChange={(checked) =>
                setValue("rag_enabled", checked, { shouldDirty: true })
              }
              aria-label={t("rag_team_enable")}
            />
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Customization Controls */}
          <div className="space-y-4">
            <h4 className="text-sm font-medium">
              {t("rag_customization_controls")}
            </h4>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="rag-customization-enabled">
                    {t("rag_allow_customization")}
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    {t("rag_team_user_desc")}
                  </p>
                </div>
                <Switch
                  id="rag-customization-enabled"
                  checked={ragCustomizationEnabled}
                  onCheckedChange={(checked) =>
                    setValue("rag_customization_enabled", checked, {
                      shouldDirty: true,
                    })
                  }
                  disabled={!ragEnabled}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="allow-user-customization">
                    {t("rag_user_customization")}
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    {t("rag_user_customization_desc")}
                  </p>
                </div>
                <Switch
                  id="allow-user-customization"
                  checked={watch("allow_user_customization")}
                  onCheckedChange={(checked) =>
                    setValue("allow_user_customization", checked, {
                      shouldDirty: true,
                    })
                  }
                  disabled={!ragEnabled || !ragCustomizationEnabled}
                />
              </div>
            </div>
          </div>

          {/* Processing Settings */}
          <div className="space-y-4">
            <h4 className="text-sm font-medium">
              {t("rag_processing_settings")}
            </h4>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Label
                        htmlFor="chunk-size"
                        className="flex items-center gap-1"
                      >
                        {t("rag_chunk_size")}
                        <Info className="h-3 w-3 text-muted-foreground" />
                      </Label>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-xs">{t("rag_chunk_size_desc")}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <Input
                  id="chunk-size"
                  type="number"
                  min={100}
                  max={4000}
                  {...register("chunk_size", { valueAsNumber: true })}
                  disabled={!ragEnabled}
                />
              </div>

              <div className="space-y-2">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Label
                        htmlFor="chunk-overlap"
                        className="flex items-center gap-1"
                      >
                        {t("rag_chunk_overlap")}
                        <Info className="h-3 w-3 text-muted-foreground" />
                      </Label>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-xs">{t("rag_chunk_overlap_desc")}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <Input
                  id="chunk-overlap"
                  type="number"
                  min={0}
                  max={1000}
                  {...register("chunk_overlap", { valueAsNumber: true })}
                  disabled={!ragEnabled}
                />
              </div>
            </div>
          </div>

          {/* Search Settings */}
          <div className="space-y-4">
            <h4 className="text-sm font-medium">{t("rag_search_settings")}</h4>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Label
                        htmlFor="chunks-per-query"
                        className="flex items-center gap-1"
                      >
                        {t("rag_results_per_query")}
                        <Info className="h-3 w-3 text-muted-foreground" />
                      </Label>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-xs">
                        {t("rag_results_per_query_desc")}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <Input
                  id="chunks-per-query"
                  type="number"
                  min={1}
                  max={20}
                  {...register("chunks_per_query", { valueAsNumber: true })}
                  disabled={!ragEnabled}
                />
              </div>

              <div className="space-y-2">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Label
                        htmlFor="similarity-threshold"
                        className="flex items-center gap-1"
                      >
                        {t("rag_similarity_threshold")}
                        <Info className="h-3 w-3 text-muted-foreground" />
                      </Label>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-xs">
                        {t("rag_similarity_threshold_desc")}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <Input
                  id="similarity-threshold"
                  type="number"
                  min={0}
                  max={1}
                  step={0.1}
                  {...register("similarity_threshold", { valueAsNumber: true })}
                  disabled={!ragEnabled}
                />
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2 pt-4">
            <Button
              variant="outline"
              onClick={handleReset}
              disabled={!isDirty || updateMutation.isPending}
            >
              {t("com_reset")}
            </Button>
            <Button
              onClick={handleSave}
              disabled={!isDirty || updateMutation.isPending}
            >
              {updateMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {t("com_save_changes")}
            </Button>
          </div>

          {updateMutation.isError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {updateMutation.error instanceof Error
                  ? updateMutation.error.message
                  : t("rag_failed_update")}
              </AlertDescription>
            </Alert>
          )}

          {updateMutation.isSuccess && !isDirty && (
            <Alert>
              <AlertDescription>{t("rag_settings_updated")}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Team Documents Section */}
      <Card>
        <CardHeader>
          <Collapsible open={documentsOpen} onOpenChange={setDocumentsOpen}>
            <CollapsibleTrigger className="flex w-full items-center justify-between">
              <div className="space-y-1 text-left">
                <CardTitle className="flex items-center gap-2">
                  <Upload className="h-5 w-5" />
                  {t("rag_team_documents")}
                </CardTitle>
                <CardDescription>
                  {t("rag_team_documents_desc")}
                </CardDescription>
              </div>
              {documentsOpen ? (
                <ChevronDown className="h-5 w-5 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              )}
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="pt-6 space-y-6">
                {ragEnabled ? (
                  <>
                    <DocumentUpload
                      orgId={orgId}
                      teamId={teamId}
                      fixedScope="team"
                      onUploadComplete={() => refetchDocuments()}
                    />
                    <div className="border-t pt-6">
                      <h4 className="text-sm font-medium mb-4">
                        {t("rag_uploaded_documents")}
                      </h4>
                      <DocumentList
                        orgId={orgId}
                        teamId={teamId}
                        scope="team"
                      />
                    </div>
                  </>
                ) : (
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      {t("rag_enable_to_upload", {
                        scope: t("com_team").toLowerCase(),
                      })}
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </CardHeader>
      </Card>
    </div>
  );
}
