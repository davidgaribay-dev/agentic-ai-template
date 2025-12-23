import { useState, useCallback } from "react"
import { Upload, FileText, X, Users, UserCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Progress } from "@/components/ui/progress"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { cn } from "@/lib/utils"
import { useUploadDocument } from "@/lib/queries"
import type { DocumentScope } from "@/lib/api"

interface DocumentUploadProps {
  orgId: string
  teamId?: string
  /** Fixed scope - hides scope selection when set */
  fixedScope?: DocumentScope
  defaultScope?: DocumentScope
  onUploadComplete?: () => void
}

interface FileWithProgress {
  file: File
  progress: number
  error?: string
}

export function DocumentUpload({ orgId, teamId, fixedScope, defaultScope = "user", onUploadComplete }: DocumentUploadProps) {
  const [dragActive, setDragActive] = useState(false)
  const [files, setFiles] = useState<FileWithProgress[]>([])
  const [scope, setScope] = useState<DocumentScope>(fixedScope ?? defaultScope)
  const uploadMutation = useUploadDocument()

  // Use fixed scope if provided, otherwise allow user selection
  const effectiveScope = fixedScope ?? scope

  const handleFiles = useCallback(
    (fileList: FileList | null) => {
      if (!fileList) return

      const newFiles = Array.from(fileList).map((file) => ({
        file,
        progress: 0,
      }))

      setFiles((prev) => [...prev, ...newFiles])

      newFiles.forEach(({ file }) => {
        uploadMutation.mutate(
          {
            file,
            organization_id: orgId,
            team_id: teamId,
            scope: effectiveScope,
          },
          {
            onSuccess: () => {
              setFiles((prev) =>
                prev.map((f) => (f.file === file ? { ...f, progress: 100 } : f))
              )
              setTimeout(() => {
                setFiles((prev) => prev.filter((f) => f.file !== file))
                onUploadComplete?.()
              }, 1500)
            },
            onError: (error) => {
              setFiles((prev) =>
                prev.map((f) =>
                  f.file === file
                    ? { ...f, error: error instanceof Error ? error.message : "Upload failed" }
                    : f
                )
              )
            },
          }
        )
      })
    },
    [orgId, teamId, effectiveScope, uploadMutation, onUploadComplete]
  )

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true)
    } else if (e.type === "dragleave") {
      setDragActive(false)
    }
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setDragActive(false)

      handleFiles(e.dataTransfer.files)
    },
    [handleFiles]
  )

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      e.preventDefault()
      handleFiles(e.target.files)
    },
    [handleFiles]
  )

  const removeFile = useCallback((fileToRemove: File) => {
    setFiles((prev) => prev.filter((f) => f.file !== fileToRemove))
  }, [])

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-6 space-y-6">
          {/* Only show scope selection when not using fixedScope and teamId is provided */}
          {!fixedScope && teamId && (
            <div className="space-y-3">
              <Label className="text-sm font-medium">Who can access these documents?</Label>
              <RadioGroup value={scope} onValueChange={(value) => setScope(value as DocumentScope)}>
                <div className="flex items-start space-x-3 space-y-0">
                  <RadioGroupItem value="team" id="scope-team" />
                  <div className="flex-1">
                    <Label htmlFor="scope-team" className="flex items-center gap-2 font-normal cursor-pointer">
                      <Users className="h-4 w-4" />
                      <span>Team</span>
                    </Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      Anyone in the team can search and view these documents
                    </p>
                  </div>
                </div>
                <div className="flex items-start space-x-3 space-y-0">
                  <RadioGroupItem value="user" id="scope-user" />
                  <div className="flex-1">
                    <Label htmlFor="scope-user" className="flex items-center gap-2 font-normal cursor-pointer">
                      <UserCircle className="h-4 w-4" />
                      <span>Personal</span>
                    </Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      Only you can search and view these documents
                    </p>
                  </div>
                </div>
              </RadioGroup>
            </div>
          )}

          <div
            className={cn(
              "border-2 border-dashed rounded-lg p-8 text-center transition-colors",
              dragActive
                ? "border-primary bg-primary/10"
                : "border-muted-foreground/25 hover:border-muted-foreground/50"
            )}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <Upload className="mx-auto h-12 w-12 text-muted-foreground" />
            <div className="mt-4 space-y-2">
              <p className="text-sm font-medium">Drag and drop files here, or click to select</p>
              <p className="text-xs text-muted-foreground">
                Supported: PDF, TXT, MD, DOCX, JSON, YAML, CSV, code files (max 50MB)
              </p>
            </div>

            <input
              type="file"
              multiple
              accept=".pdf,.txt,.md,.docx,.json,.yaml,.yml,.csv,.py,.js,.ts,.jsx,.tsx,.java,.cpp,.c,.h,.go,.rs,.rb,.php,.sh,.sql,.html,.css"
              className="hidden"
              id="file-upload"
              onChange={handleChange}
            />
            <Button asChild className="mt-4">
              <label htmlFor="file-upload" className="cursor-pointer">
                Select Files
              </label>
            </Button>
          </div>
        </CardContent>
      </Card>

      {files.length > 0 && (
        <div className="space-y-2">
          {files.map(({ file, progress, error }) => (
            <Card key={file.name}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <FileText className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{file.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {(file.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 flex-shrink-0"
                        onClick={() => removeFile(file)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>

                    {error ? (
                      <Alert variant="destructive" className="py-2">
                        <AlertDescription className="text-xs">{error}</AlertDescription>
                      </Alert>
                    ) : (
                      <Progress value={uploadMutation.isPending ? 50 : progress} className="h-1.5" />
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
