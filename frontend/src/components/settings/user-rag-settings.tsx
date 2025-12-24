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
  User,
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
  useUserRAGSettings,
  useUpdateUserRAGSettings,
  useDocuments,
} from "@/lib/queries";
import { useWorkspace } from "@/lib/workspace";
import { useAuth } from "@/lib/auth";
import { DocumentUpload } from "@/components/documents/document-upload";
import { DocumentList } from "@/components/documents/document-list";
import type { UserRAGSettingsUpdate } from "@/lib/api";

const userRagSettingsSchema = z.object({
  rag_enabled: z.boolean(),
  chunks_per_query: z.number().min(1).max(20),
  similarity_threshold: z.number().min(0).max(1),
});

type UserRagSettingsFormData = z.infer<typeof userRagSettingsSchema>;

export function UserRAGSettings() {
  const { t } = useTranslation();
  const { data: userSettings, isLoading: isLoadingSettings } =
    useUserRAGSettings();
  const updateMutation = useUpdateUserRAGSettings();
  const { currentOrg, currentTeam } = useWorkspace();
  const { user } = useAuth();
  const { refetch: refetchDocuments } = useDocuments({
    organization_id: currentOrg?.id ?? "",
    team_id: currentTeam?.id,
  });
  const [documentsOpen, setDocumentsOpen] = useState(true);

  const form = useForm<UserRagSettingsFormData>({
    resolver: zodResolver(userRagSettingsSchema),
    defaultValues: {
      rag_enabled: true,
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

  useEffect(() => {
    if (userSettings) {
      reset({
        rag_enabled: userSettings.rag_enabled,
        chunks_per_query: userSettings.chunks_per_query,
        similarity_threshold: userSettings.similarity_threshold,
      });
    }
  }, [userSettings, reset]);

  const handleSave = form.handleSubmit((data) => {
    const updates: UserRAGSettingsUpdate = {};

    if (data.rag_enabled !== userSettings?.rag_enabled) {
      updates.rag_enabled = data.rag_enabled;
    }
    if (data.chunks_per_query !== userSettings?.chunks_per_query) {
      updates.chunks_per_query = data.chunks_per_query;
    }
    if (data.similarity_threshold !== userSettings?.similarity_threshold) {
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
    if (userSettings) {
      reset({
        rag_enabled: userSettings.rag_enabled,
        chunks_per_query: userSettings.chunks_per_query,
        similarity_threshold: userSettings.similarity_threshold,
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

  if (!userSettings) {
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
                <User className="h-5 w-5" />
                {t("rag_user_title")}
              </CardTitle>
              <CardDescription>{t("rag_user_desc")}</CardDescription>
            </div>
            <Switch
              checked={ragEnabled}
              onCheckedChange={(checked) =>
                setValue("rag_enabled", checked, { shouldDirty: true })
              }
              aria-label={t("rag_user_enable")}
            />
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Search Settings */}
          <div className="space-y-4">
            <h4 className="text-sm font-medium">
              {t("rag_search_preferences")}
            </h4>
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
                  : t("rag_personal_failed")}
              </AlertDescription>
            </Alert>
          )}

          {updateMutation.isSuccess && !isDirty && (
            <Alert>
              <AlertDescription>{t("rag_personal_updated")}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Personal Documents Section */}
      <Card>
        <CardHeader>
          <Collapsible open={documentsOpen} onOpenChange={setDocumentsOpen}>
            <CollapsibleTrigger className="flex w-full items-center justify-between">
              <div className="space-y-1 text-left">
                <CardTitle className="flex items-center gap-2">
                  <Upload className="h-5 w-5" />
                  {t("rag_personal_documents")}
                </CardTitle>
                <CardDescription>
                  {t("rag_personal_documents_desc")}
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
                {!currentOrg || !currentTeam ? (
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      {t("rag_select_org_team")}
                    </AlertDescription>
                  </Alert>
                ) : !ragEnabled ? (
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      {t("rag_enable_to_upload_personal")}
                    </AlertDescription>
                  </Alert>
                ) : (
                  <>
                    <DocumentUpload
                      orgId={currentOrg.id}
                      teamId={currentTeam.id}
                      fixedScope="user"
                      onUploadComplete={() => refetchDocuments()}
                    />
                    <div className="border-t pt-6">
                      <h4 className="text-sm font-medium mb-4">
                        {t("rag_your_documents")}
                      </h4>
                      <DocumentList
                        orgId={currentOrg.id}
                        teamId={currentTeam.id}
                        scope="user"
                        userId={user?.id}
                      />
                    </div>
                  </>
                )}
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </CardHeader>
      </Card>
    </div>
  );
}
