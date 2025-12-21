import { useState, useRef, useEffect } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import {
  Loader2,
  Trash2,
  Camera,
  Building2,
  Users,
} from "lucide-react"
import { organizationsApi, teamsApi, type OrganizationUpdate, type TeamUpdate, ApiError } from "@/lib/api"
import { workspaceKeys } from "@/lib/workspace"
import { isValidImageUrl } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface OrgDetailsSectionProps {
  org: { id: string; name: string; description: string | null; logo_url: string | null }
  onUpdate: () => void
}

export function OrgDetailsSection({ org, onUpdate }: OrgDetailsSectionProps) {
  const queryClient = useQueryClient()
  const [name, setName] = useState(org.name)
  const [description, setDescription] = useState(org.description ?? "")
  const [error, setError] = useState<string | null>(null)
  const [logoError, setLogoError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const updateMutation = useMutation({
    mutationFn: (data: OrganizationUpdate) =>
      organizationsApi.updateOrganization(org.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.organizations })
      onUpdate()
      setError(null)
    },
    onError: (err: ApiError) => {
      const detail = (err.body as { detail?: string })?.detail
      setError(detail || "Failed to update organization")
    },
  })

  const uploadLogoMutation = useMutation({
    mutationFn: (file: File) => organizationsApi.uploadLogo(org.id, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.organizations })
      onUpdate()
      setLogoError(null)
    },
    onError: (err: ApiError) => {
      const detail = (err.body as { detail?: string })?.detail
      setLogoError(detail || "Failed to upload logo")
    },
  })

  const deleteLogoMutation = useMutation({
    mutationFn: () => organizationsApi.deleteLogo(org.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.organizations })
      onUpdate()
      setLogoError(null)
    },
    onError: (err: ApiError) => {
      const detail = (err.body as { detail?: string })?.detail
      setLogoError(detail || "Failed to delete logo")
    },
  })

  const handleSave = () => {
    updateMutation.mutate({ name, description: description || null })
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setLogoError(null)
      uploadLogoMutation.mutate(file)
    }
    e.target.value = ""
  }

  const handleUploadClick = () => {
    fileInputRef.current?.click()
  }

  const handleDeleteLogo = () => {
    setLogoError(null)
    deleteLogoMutation.mutate()
  }

  const hasChanges = name !== org.name || description !== (org.description ?? "")
  const isLogoLoading = uploadLogoMutation.isPending || deleteLogoMutation.isPending

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
                  alt="Organization logo"
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
              {org.logo_url ? "Change" : "Upload"}
            </DropdownMenuItem>
            {org.logo_url && (
              <DropdownMenuItem onClick={handleDeleteLogo} className="text-destructive focus:text-destructive">
                <Trash2 className="mr-2 size-4" />
                Remove
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="flex-1 space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="org-name" className="text-xs">Name</Label>
            <Input
              id="org-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Organization name"
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="org-description" className="text-xs">Description</Label>
            <Textarea
              id="org-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
              rows={2}
              className="text-sm resize-none"
            />
          </div>
        </div>
      </div>

      {(error || logoError) && (
        <p className="text-xs text-destructive">{error || logoError}</p>
      )}

      <Button
        size="sm"
        onClick={handleSave}
        disabled={!hasChanges || updateMutation.isPending}
      >
        {updateMutation.isPending && <Loader2 className="mr-1.5 size-3 animate-spin" />}
        Save Changes
      </Button>
    </div>
  )
}

interface TeamDetailsSectionProps {
  orgId: string
  team: { id: string; name: string; description: string | null; logo_url: string | null }
  onUpdate: () => void
}

export function TeamDetailsSection({ orgId, team, onUpdate }: TeamDetailsSectionProps) {
  const queryClient = useQueryClient()
  const [name, setName] = useState(team.name)
  const [description, setDescription] = useState(team.description ?? "")
  const [error, setError] = useState<string | null>(null)
  const [logoError, setLogoError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setName(team.name)
    setDescription(team.description ?? "")
  }, [team])

  const updateMutation = useMutation({
    mutationFn: (data: TeamUpdate) => teamsApi.updateTeam(orgId, team.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.teams(orgId) })
      onUpdate()
      setError(null)
    },
    onError: (err: ApiError) => {
      const detail = (err.body as { detail?: string })?.detail
      setError(detail || "Failed to update team")
    },
  })

  const uploadLogoMutation = useMutation({
    mutationFn: (file: File) => teamsApi.uploadLogo(orgId, team.id, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.teams(orgId) })
      onUpdate()
      setLogoError(null)
    },
    onError: (err: ApiError) => {
      const detail = (err.body as { detail?: string })?.detail
      setLogoError(detail || "Failed to upload logo")
    },
  })

  const deleteLogoMutation = useMutation({
    mutationFn: () => teamsApi.deleteLogo(orgId, team.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.teams(orgId) })
      onUpdate()
      setLogoError(null)
    },
    onError: (err: ApiError) => {
      const detail = (err.body as { detail?: string })?.detail
      setLogoError(detail || "Failed to delete logo")
    },
  })

  const handleSave = () => {
    updateMutation.mutate({ name, description: description || null })
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setLogoError(null)
      uploadLogoMutation.mutate(file)
    }
    e.target.value = ""
  }

  const handleUploadClick = () => {
    fileInputRef.current?.click()
  }

  const handleDeleteLogo = () => {
    setLogoError(null)
    deleteLogoMutation.mutate()
  }

  const hasChanges = name !== team.name || description !== (team.description ?? "")
  const isLogoLoading = uploadLogoMutation.isPending || deleteLogoMutation.isPending

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
                  alt="Team logo"
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
              {team.logo_url ? "Change" : "Upload"}
            </DropdownMenuItem>
            {team.logo_url && (
              <DropdownMenuItem onClick={handleDeleteLogo} className="text-destructive focus:text-destructive">
                <Trash2 className="mr-2 size-4" />
                Remove
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="flex-1 space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="team-name" className="text-xs">Name</Label>
            <Input
              id="team-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Team name"
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="team-description" className="text-xs">Description</Label>
            <Textarea
              id="team-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
              rows={2}
              className="text-sm resize-none"
            />
          </div>
        </div>
      </div>

      {(error || logoError) && (
        <p className="text-xs text-destructive">{error || logoError}</p>
      )}

      <Button
        size="sm"
        onClick={handleSave}
        disabled={!hasChanges || updateMutation.isPending}
      >
        {updateMutation.isPending && <Loader2 className="mr-1.5 size-3 animate-spin" />}
        Save Changes
      </Button>
    </div>
  )
}
