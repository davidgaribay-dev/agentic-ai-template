import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2, AlertCircle, User, Info, Upload, ChevronDown, ChevronRight } from "lucide-react"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { useUserRAGSettings, useUpdateUserRAGSettings, useDocuments } from "@/lib/queries"
import { useWorkspace } from "@/lib/workspace"
import { useAuth } from "@/lib/auth"
import { DocumentUpload } from "@/components/documents/document-upload"
import { DocumentList } from "@/components/documents/document-list"
import type { UserRAGSettingsUpdate } from "@/lib/api"

export function UserRAGSettings() {
  const { data: userSettings, isLoading: isLoadingSettings } = useUserRAGSettings()
  const updateMutation = useUpdateUserRAGSettings()
  const { currentOrg, currentTeam } = useWorkspace()
  const { user } = useAuth()
  const { refetch: refetchDocuments } = useDocuments({
    organization_id: currentOrg?.id ?? "",
    team_id: currentTeam?.id,
  })

  const [ragEnabled, setRagEnabled] = useState(true)
  const [chunksPerQuery, setChunksPerQuery] = useState(4)
  const [similarityThreshold, setSimilarityThreshold] = useState(0.7)
  const [hasChanges, setHasChanges] = useState(false)
  const [documentsOpen, setDocumentsOpen] = useState(true)

  useEffect(() => {
    if (userSettings) {
      setRagEnabled(userSettings.rag_enabled)
      setChunksPerQuery(userSettings.chunks_per_query)
      setSimilarityThreshold(userSettings.similarity_threshold)
      setHasChanges(false)
    }
  }, [userSettings])

  const handleSave = () => {
    const updates: UserRAGSettingsUpdate = {}

    if (ragEnabled !== userSettings?.rag_enabled) {
      updates.rag_enabled = ragEnabled
    }
    if (chunksPerQuery !== userSettings?.chunks_per_query) {
      updates.chunks_per_query = chunksPerQuery
    }
    if (similarityThreshold !== userSettings?.similarity_threshold) {
      updates.similarity_threshold = similarityThreshold
    }

    if (Object.keys(updates).length > 0) {
      updateMutation.mutate(updates, {
        onSuccess: () => {
          setHasChanges(false)
        },
      })
    }
  }

  const handleReset = () => {
    if (userSettings) {
      setRagEnabled(userSettings.rag_enabled)
      setChunksPerQuery(userSettings.chunks_per_query)
      setSimilarityThreshold(userSettings.similarity_threshold)
      setHasChanges(false)
    }
  }

  useEffect(() => {
    if (userSettings) {
      const changed =
        ragEnabled !== userSettings.rag_enabled ||
        chunksPerQuery !== userSettings.chunks_per_query ||
        similarityThreshold !== userSettings.similarity_threshold
      setHasChanges(changed)
    }
  }, [ragEnabled, chunksPerQuery, similarityThreshold, userSettings])

  if (isLoadingSettings) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!userSettings) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>Failed to load user RAG settings</AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Personal Document Search Preferences
              </CardTitle>
              <CardDescription>
                Customize your personal document search settings
              </CardDescription>
            </div>
            <Switch
              checked={ragEnabled}
              onCheckedChange={(checked) => {
                setRagEnabled(checked)
              }}
              aria-label="Enable RAG for yourself"
            />
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Search Settings */}
          <div className="space-y-4">
            <h4 className="text-sm font-medium">Search Preferences</h4>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Label htmlFor="chunks-per-query" className="flex items-center gap-1">
                        Results Per Query
                        <Info className="h-3 w-3 text-muted-foreground" />
                      </Label>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-xs">Number of document chunks to return per search (1-20)</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <Input
                  id="chunks-per-query"
                  type="number"
                  min={1}
                  max={20}
                  value={chunksPerQuery}
                  onChange={(e) => setChunksPerQuery(Number(e.target.value))}
                  disabled={!ragEnabled}
                />
              </div>

              <div className="space-y-2">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Label htmlFor="similarity-threshold" className="flex items-center gap-1">
                        Similarity Threshold
                        <Info className="h-3 w-3 text-muted-foreground" />
                      </Label>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-xs">Minimum relevance score 0-1 (higher = more strict)</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <Input
                  id="similarity-threshold"
                  type="number"
                  min={0}
                  max={1}
                  step={0.1}
                  value={similarityThreshold}
                  onChange={(e) => setSimilarityThreshold(Number(e.target.value))}
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
              disabled={!hasChanges || updateMutation.isPending}
            >
              Reset
            </Button>
            <Button onClick={handleSave} disabled={!hasChanges || updateMutation.isPending}>
              {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </div>

          {updateMutation.isError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {updateMutation.error instanceof Error
                  ? updateMutation.error.message
                  : "Failed to update user RAG settings"}
              </AlertDescription>
            </Alert>
          )}

          {updateMutation.isSuccess && !hasChanges && (
            <Alert>
              <AlertDescription>Personal RAG preferences updated successfully</AlertDescription>
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
                  Personal Documents
                </CardTitle>
                <CardDescription>
                  Upload documents for your personal use only
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
                      Please select an organization and team to upload personal documents.
                    </AlertDescription>
                  </Alert>
                ) : !ragEnabled ? (
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      Enable Document Search above to upload personal documents.
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
                      <h4 className="text-sm font-medium mb-4">Your Documents</h4>
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
  )
}
