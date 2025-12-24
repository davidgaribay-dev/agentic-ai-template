import { useState, useEffect } from "react";
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
        <AlertDescription>Failed to load team RAG settings</AlertDescription>
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
                Team Document Search
              </CardTitle>
              <CardDescription>
                Customize document search settings for this team
              </CardDescription>
            </div>
            <Switch
              checked={ragEnabled}
              onCheckedChange={(checked) =>
                setValue("rag_enabled", checked, { shouldDirty: true })
              }
              aria-label="Enable RAG for team"
            />
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Customization Controls */}
          <div className="space-y-4">
            <h4 className="text-sm font-medium">Customization Controls</h4>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="rag-customization-enabled">
                    Allow RAG Customization
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Allow team members to customize their RAG settings
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
                    User Customization
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Allow users to customize their personal RAG preferences
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
            <h4 className="text-sm font-medium">Processing Settings</h4>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Label
                        htmlFor="chunk-size"
                        className="flex items-center gap-1"
                      >
                        Chunk Size
                        <Info className="h-3 w-3 text-muted-foreground" />
                      </Label>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-xs">
                        Number of characters per chunk (100-4000)
                      </p>
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
                        Chunk Overlap
                        <Info className="h-3 w-3 text-muted-foreground" />
                      </Label>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-xs">
                        Characters overlapping between chunks (0-1000)
                      </p>
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
            <h4 className="text-sm font-medium">Search Settings</h4>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Label
                        htmlFor="chunks-per-query"
                        className="flex items-center gap-1"
                      >
                        Results Per Query
                        <Info className="h-3 w-3 text-muted-foreground" />
                      </Label>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-xs">
                        Number of chunks to return per search (1-20)
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
                        Similarity Threshold
                        <Info className="h-3 w-3 text-muted-foreground" />
                      </Label>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-xs">
                        Minimum relevance score 0-1 (higher = more strict)
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
              Reset
            </Button>
            <Button
              onClick={handleSave}
              disabled={!isDirty || updateMutation.isPending}
            >
              {updateMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Save Changes
            </Button>
          </div>

          {updateMutation.isError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {updateMutation.error instanceof Error
                  ? updateMutation.error.message
                  : "Failed to update team RAG settings"}
              </AlertDescription>
            </Alert>
          )}

          {updateMutation.isSuccess && !isDirty && (
            <Alert>
              <AlertDescription>
                Team RAG settings updated successfully
              </AlertDescription>
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
                  Team Documents
                </CardTitle>
                <CardDescription>
                  Upload documents available to all team members
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
                        Uploaded Documents
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
                      Enable Document Search above to upload team documents.
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
