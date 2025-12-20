import { useState, useEffect, useRef } from "react"
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router"
import { z } from "zod"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Loader2,
  Mail,
  Pencil,
  Trash2,
  User,
  Check,
  X,
  MessageSquare,
  Sparkles,
  Plus,
  Power,
  PowerOff,
  Settings2,
  Camera,
} from "lucide-react"
import { useAuth, authKeys } from "@/lib/auth"
import {
  authApi,
  promptsApi,
  ApiError,
  type ChatSettings as ChatSettingsType,
  type Prompt,
  type PromptCreate,
  type PromptUpdate,
  type PromptType,
} from "@/lib/api"
import { useWorkspace } from "@/lib/workspace"
import {
  useOrgChatSettings,
  useTeamChatSettings,
  useUserChatSettings,
  useUpdateUserChatSettings,
} from "@/lib/queries"
import { ChatSettings } from "@/components/chat-settings"
import { getInitials, isValidImageUrl } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
} from "@/components/ui/alert-dialog"

const settingsSearchSchema = z.object({
  tab: z.enum(["profile", "account", "system-prompts", "templates", "preferences"]).optional(),
})

type SettingsTab = z.infer<typeof settingsSearchSchema>["tab"]

export const Route = createFileRoute("/settings")({
  beforeLoad: ({ context }) => {
    if (!context.auth.isAuthenticated && !context.auth.isLoading) {
      throw redirect({ to: "/login" })
    }
  },
  component: SettingsPage,
  validateSearch: settingsSearchSchema,
})

function SettingsPage() {
  const navigate = useNavigate()
  const { tab: tabFromUrl } = Route.useSearch()
  const { user } = useAuth()

  const currentTab = tabFromUrl || "profile"

  const handleTabChange = (value: string) => {
    navigate({ to: "/settings", search: { tab: value as SettingsTab }, replace: true })
  }

  return (
    <div className="bg-background min-h-screen">
      <div className="mx-auto max-w-6xl px-6 py-8">
        {/* Header */}
        <div className="mb-8 flex items-center gap-4">
          {user?.profile_image_url && isValidImageUrl(user.profile_image_url) ? (
            <img
              src={user.profile_image_url}
              alt={user.full_name || "Profile"}
              className="size-12 rounded-full object-cover ring-2 ring-border"
            />
          ) : (
            <div className="flex size-12 items-center justify-center rounded-full bg-gradient-to-br from-primary/80 to-primary ring-2 ring-border">
              <span className="text-lg font-medium text-primary-foreground">
                {user ? getInitials(user.full_name, user.email) : "?"}
              </span>
            </div>
          )}
          <div>
            <h1 className="text-xl font-semibold">{user?.full_name || user?.email || "Your Account"}</h1>
            <p className="text-sm text-muted-foreground">Personal settings</p>
          </div>
        </div>

        <Tabs value={currentTab} onValueChange={handleTabChange} orientation="vertical" className="flex gap-8">
          {/* Left Sidebar */}
          <div className="w-56 flex-shrink-0">
            <TabsList className="flex flex-col items-stretch h-auto bg-transparent p-0 space-y-1">
              <TabsTrigger
                value="profile"
                className="justify-start px-3 py-2 h-auto text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 data-[state=active]:bg-muted data-[state=active]:text-foreground rounded-md"
              >
                <User className="mr-2 size-4" />
                Profile
              </TabsTrigger>
              <TabsTrigger
                value="account"
                className="justify-start px-3 py-2 h-auto text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 data-[state=active]:bg-muted data-[state=active]:text-foreground rounded-md"
              >
                <Mail className="mr-2 size-4" />
                Account
              </TabsTrigger>

              <div className="pt-4 pb-2">
                <span className="px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  AI Configuration
                </span>
              </div>
              <TabsTrigger
                value="system-prompts"
                className="justify-start px-3 py-2 h-auto text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 data-[state=active]:bg-muted data-[state=active]:text-foreground rounded-md"
              >
                <Sparkles className="mr-2 size-4" />
                System Prompts
              </TabsTrigger>
              <TabsTrigger
                value="templates"
                className="justify-start px-3 py-2 h-auto text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 data-[state=active]:bg-muted data-[state=active]:text-foreground rounded-md"
              >
                <MessageSquare className="mr-2 size-4" />
                Templates
              </TabsTrigger>
              <TabsTrigger
                value="preferences"
                className="justify-start px-3 py-2 h-auto text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 data-[state=active]:bg-muted data-[state=active]:text-foreground rounded-md"
              >
                <Settings2 className="mr-2 size-4" />
                Preferences
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Main Content */}
          <div className="flex-1 min-w-0">
            <TabsContent value="profile" className="mt-0 space-y-6">
              <ProfileSection />
            </TabsContent>

            <TabsContent value="account" className="mt-0 space-y-6">
              <AccountSection />
            </TabsContent>

            <TabsContent value="system-prompts" className="mt-0 space-y-6">
              <SystemPromptsSection />
            </TabsContent>

            <TabsContent value="templates" className="mt-0 space-y-6">
              <TemplatesSection />
            </TabsContent>

            <TabsContent value="preferences" className="mt-0 space-y-6">
              <PreferencesSection />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  )
}

function ProfileSection() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [isEditingName, setIsEditingName] = useState(false)
  const [isEditingEmail, setIsEditingEmail] = useState(false)
  const [editName, setEditName] = useState(user?.full_name || "")
  const [editEmail, setEditEmail] = useState(user?.email || "")
  const [profileError, setProfileError] = useState<string | null>(null)

  useEffect(() => {
    if (user) {
      setEditName(user.full_name || "")
      setEditEmail(user.email || "")
    }
  }, [user])

  const updateProfileMutation = useMutation({
    mutationFn: authApi.updateMe,
    onSuccess: (updatedUser) => {
      queryClient.setQueryData(authKeys.user, updatedUser)
      setProfileError(null)
      setIsEditingName(false)
      setIsEditingEmail(false)
    },
    onError: (err: ApiError) => {
      const detail = (err.body as { detail?: string })?.detail
      setProfileError(detail || "Failed to update profile")
    },
  })

  const uploadImageMutation = useMutation({
    mutationFn: authApi.uploadProfileImage,
    onSuccess: (updatedUser) => {
      queryClient.setQueryData(authKeys.user, updatedUser)
      setProfileError(null)
    },
    onError: (err: ApiError) => {
      const detail = (err.body as { detail?: string })?.detail
      setProfileError(detail || "Failed to upload image")
    },
  })

  const deleteImageMutation = useMutation({
    mutationFn: authApi.deleteProfileImage,
    onSuccess: (updatedUser) => {
      queryClient.setQueryData(authKeys.user, updatedUser)
      setProfileError(null)
    },
    onError: (err: ApiError) => {
      const detail = (err.body as { detail?: string })?.detail
      setProfileError(detail || "Failed to delete image")
    },
  })

  const handleSaveName = () => {
    setProfileError(null)
    updateProfileMutation.mutate({ full_name: editName || null })
  }

  const handleCancelName = () => {
    setEditName(user?.full_name || "")
    setIsEditingName(false)
    setProfileError(null)
  }

  const handleSaveEmail = () => {
    if (!editEmail.trim()) {
      setProfileError("Email is required")
      return
    }
    setProfileError(null)
    updateProfileMutation.mutate({ email: editEmail })
  }

  const handleCancelEmail = () => {
    setEditEmail(user?.email || "")
    setIsEditingEmail(false)
    setProfileError(null)
  }

  const handleImageClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        setProfileError("Image must be less than 10MB")
        return
      }
      if (!file.type.startsWith("image/")) {
        setProfileError("Please select an image file")
        return
      }
      uploadImageMutation.mutate(file)
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  const handleDeleteImage = () => {
    deleteImageMutation.mutate()
  }

  const isImageLoading = uploadImageMutation.isPending || deleteImageMutation.isPending

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Profile</h2>
        <p className="text-sm text-muted-foreground">
          Your profile information
        </p>
      </div>

      {profileError && (
        <p className="text-sm text-destructive">{profileError}</p>
      )}

      <div className="flex items-center gap-4">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="hidden"
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              disabled={isImageLoading}
              className="relative group cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-full"
            >
              {user?.profile_image_url && isValidImageUrl(user.profile_image_url) ? (
                <img
                  src={user.profile_image_url}
                  alt={user.full_name || "Profile"}
                  className="size-16 rounded-full object-cover ring-2 ring-border"
                />
              ) : (
                <div className="flex size-16 items-center justify-center rounded-full bg-gradient-to-br from-primary/80 to-primary ring-2 ring-border">
                  <span className="text-xl font-medium text-primary-foreground">
                    {user ? getInitials(user.full_name, user.email) : "?"}
                  </span>
                </div>
              )}
              <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity">
                {isImageLoading ? (
                  <Loader2 className="size-5 text-white animate-spin" />
                ) : (
                  <Camera className="size-5 text-white" />
                )}
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            <DropdownMenuItem onClick={handleImageClick}>
              <Camera className="mr-2 size-4" />
              {user?.profile_image_url ? "Change photo" : "Upload photo"}
            </DropdownMenuItem>
            {user?.profile_image_url && (
              <DropdownMenuItem onClick={handleDeleteImage} className="text-destructive focus:text-destructive">
                <Trash2 className="mr-2 size-4" />
                Remove photo
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="flex-1 min-w-0">
          {isEditingName ? (
            <div className="flex items-center gap-2">
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Enter your name"
                className="max-w-xs"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveName()
                  if (e.key === "Escape") handleCancelName()
                }}
              />
              <Button
                size="icon"
                variant="ghost"
                className="size-8 shrink-0"
                onClick={handleSaveName}
                disabled={updateProfileMutation.isPending}
              >
                {updateProfileMutation.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Check className="size-4 text-green-600" />
                )}
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="size-8 shrink-0"
                onClick={handleCancelName}
                disabled={updateProfileMutation.isPending}
              >
                <X className="size-4 text-muted-foreground" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium">{user?.full_name || "No name set"}</p>
              <Button
                size="icon"
                variant="ghost"
                className="size-6 shrink-0"
                onClick={() => setIsEditingName(true)}
              >
                <Pencil className="size-3 text-muted-foreground" />
              </Button>
            </div>
          )}
          {isEditingEmail ? (
            <div className="flex items-center gap-2 mt-1">
              <Input
                type="email"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                placeholder="Enter your email"
                className="max-w-xs h-7 text-sm"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveEmail()
                  if (e.key === "Escape") handleCancelEmail()
                }}
              />
              <Button
                size="icon"
                variant="ghost"
                className="size-6 shrink-0"
                onClick={handleSaveEmail}
                disabled={updateProfileMutation.isPending}
              >
                {updateProfileMutation.isPending ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <Check className="size-3 text-green-600" />
                )}
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="size-6 shrink-0"
                onClick={handleCancelEmail}
                disabled={updateProfileMutation.isPending}
              >
                <X className="size-3 text-muted-foreground" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <p className="text-sm text-muted-foreground">{user?.email}</p>
              <Button
                size="icon"
                variant="ghost"
                className="size-5 shrink-0"
                onClick={() => setIsEditingEmail(true)}
              >
                <Pencil className="size-2.5 text-muted-foreground" />
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function AccountSection() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const [isEditingName, setIsEditingName] = useState(false)
  const [isEditingEmail, setIsEditingEmail] = useState(false)
  const [editName, setEditName] = useState(user?.full_name || "")
  const [editEmail, setEditEmail] = useState(user?.email || "")
  const [profileError, setProfileError] = useState<string | null>(null)

  useEffect(() => {
    if (user) {
      setEditName(user.full_name || "")
      setEditEmail(user.email || "")
    }
  }, [user])

  const updateProfileMutation = useMutation({
    mutationFn: authApi.updateMe,
    onSuccess: (updatedUser) => {
      queryClient.setQueryData(authKeys.user, updatedUser)
      setProfileError(null)
      setIsEditingName(false)
      setIsEditingEmail(false)
    },
    onError: (err: ApiError) => {
      const detail = (err.body as { detail?: string })?.detail
      setProfileError(detail || "Failed to update profile")
    },
  })

  const handleSaveName = () => {
    setProfileError(null)
    updateProfileMutation.mutate({ full_name: editName || null })
  }

  const handleSaveEmail = () => {
    if (!editEmail.trim()) {
      setProfileError("Email is required")
      return
    }
    setProfileError(null)
    updateProfileMutation.mutate({ email: editEmail })
  }

  const handleCancelName = () => {
    setEditName(user?.full_name || "")
    setIsEditingName(false)
    setProfileError(null)
  }

  const handleCancelEmail = () => {
    setEditEmail(user?.email || "")
    setIsEditingEmail(false)
    setProfileError(null)
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Account Details</h2>
        <p className="text-sm text-muted-foreground">
          Manage your account information
        </p>
      </div>

      {profileError && (
        <p className="text-sm text-destructive">{profileError}</p>
      )}

      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-[200px_1fr] items-start">
          <div>
            <Label className="text-sm font-medium">Full Name</Label>
            <p className="text-xs text-muted-foreground mt-1">
              Your display name
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isEditingName ? (
              <>
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Enter your name"
                  className="max-w-sm"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveName()
                    if (e.key === "Escape") handleCancelName()
                  }}
                />
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-8 shrink-0"
                  onClick={handleSaveName}
                  disabled={updateProfileMutation.isPending}
                >
                  {updateProfileMutation.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Check className="size-4 text-green-600" />
                  )}
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-8 shrink-0"
                  onClick={handleCancelName}
                  disabled={updateProfileMutation.isPending}
                >
                  <X className="size-4 text-muted-foreground" />
                </Button>
              </>
            ) : (
              <>
                <div className="flex items-center gap-3 rounded-lg border border-input bg-background px-4 py-2.5 max-w-sm w-full">
                  <User className="size-4 text-muted-foreground" />
                  <span className="text-sm">
                    {user?.full_name || <span className="text-muted-foreground italic">Not set</span>}
                  </span>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-8 shrink-0"
                  onClick={() => setIsEditingName(true)}
                >
                  <Pencil className="size-4 text-muted-foreground" />
                </Button>
              </>
            )}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-[200px_1fr] items-start">
          <div>
            <Label className="text-sm font-medium">Email</Label>
            <p className="text-xs text-muted-foreground mt-1">
              Your email address
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isEditingEmail ? (
              <>
                <Input
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  placeholder="Enter your email"
                  className="max-w-sm"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveEmail()
                    if (e.key === "Escape") handleCancelEmail()
                  }}
                />
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-8 shrink-0"
                  onClick={handleSaveEmail}
                  disabled={updateProfileMutation.isPending}
                >
                  {updateProfileMutation.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Check className="size-4 text-green-600" />
                  )}
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-8 shrink-0"
                  onClick={handleCancelEmail}
                  disabled={updateProfileMutation.isPending}
                >
                  <X className="size-4 text-muted-foreground" />
                </Button>
              </>
            ) : (
              <>
                <div className="flex items-center gap-3 rounded-lg border border-input bg-background px-4 py-2.5 max-w-sm w-full">
                  <Mail className="size-4 text-muted-foreground" />
                  <span className="text-sm">{user?.email}</span>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-8 shrink-0"
                  onClick={() => setIsEditingEmail(true)}
                >
                  <Pencil className="size-4 text-muted-foreground" />
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function SystemPromptsSection() {
  const { data: promptsData, isLoading } = useQuery({
    queryKey: ["user-prompts"],
    queryFn: () => promptsApi.listUserPrompts(),
  })

  const prompts = promptsData?.data ?? []
  const systemPrompts = prompts.filter((p) => p.prompt_type === "system")

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end">
        <CreatePromptDialog defaultType="system" />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : systemPrompts.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title="No system prompts"
          description="Personal system prompts add to the AI's behavior on top of organization and team prompts."
        />
      ) : (
        <div className="space-y-4">
          {systemPrompts.map((prompt) => (
            <PromptCard key={prompt.id} prompt={prompt} />
          ))}
        </div>
      )}
    </div>
  )
}

function TemplatesSection() {
  const { data: promptsData, isLoading } = useQuery({
    queryKey: ["user-prompts"],
    queryFn: () => promptsApi.listUserPrompts(),
  })

  const prompts = promptsData?.data ?? []
  const templatePrompts = prompts.filter((p) => p.prompt_type === "template")

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end">
        <CreatePromptDialog defaultType="template" />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : templatePrompts.length === 0 ? (
        <EmptyState
          icon={MessageSquare}
          title="No templates"
          description="Personal templates are text snippets only you can see and use in conversations."
        />
      ) : (
        <div className="space-y-4">
          {templatePrompts.map((prompt) => (
            <PromptCard key={prompt.id} prompt={prompt} />
          ))}
        </div>
      )}
    </div>
  )
}

function PreferencesSection() {
  const { currentOrg, currentTeam } = useWorkspace()
  const { data: orgSettings, isLoading: isLoadingOrg } = useOrgChatSettings(currentOrg?.id)
  const { data: teamSettings, isLoading: isLoadingTeam } = useTeamChatSettings(
    currentOrg?.id,
    currentTeam?.id
  )
  const { data: userSettings, isLoading: isLoadingUser } = useUserChatSettings()
  const updateMutation = useUpdateUserChatSettings()

  const handleChatEnabledChange = (enabled: boolean) => {
    updateMutation.mutate({ chat_enabled: enabled })
  }

  const handleChatPanelEnabledChange = (enabled: boolean) => {
    updateMutation.mutate({ chat_panel_enabled: enabled })
  }

  const currentSettings: ChatSettingsType = userSettings ?? {
    chat_enabled: true,
    chat_panel_enabled: true,
  }

  const chatDisabledByOrg = orgSettings ? !orgSettings.chat_enabled : false
  const chatDisabledByTeam = teamSettings ? !teamSettings.chat_enabled : false
  const chatPanelDisabledByOrg = orgSettings ? !orgSettings.chat_panel_enabled : false
  const chatPanelDisabledByTeam = teamSettings ? !teamSettings.chat_panel_enabled : false

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <MessageSquare className="size-5" />
          Chat Features
        </h2>
        <p className="text-sm text-muted-foreground">
          Control whether chat features are visible for you
        </p>
      </div>

      <div className="space-y-6">
        <p className="text-sm text-muted-foreground mb-6">
          Organization and team settings take precedence over your preferences.
        </p>
        <ChatSettings
          settings={currentSettings}
          onChatEnabledChange={handleChatEnabledChange}
          onChatPanelEnabledChange={handleChatPanelEnabledChange}
          chatDisabledByOrg={chatDisabledByOrg}
          chatDisabledByTeam={chatDisabledByTeam}
          chatPanelDisabledByOrg={chatPanelDisabledByOrg}
          chatPanelDisabledByTeam={chatPanelDisabledByTeam}
          isLoading={isLoadingOrg || isLoadingTeam || isLoadingUser || updateMutation.isPending}
          level="user"
        />
      </div>
    </div>
  )
}

function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  description: string
}) {
  return (
    <div className="rounded-lg border border-dashed p-8 text-center">
      <Icon className="mx-auto size-10 text-muted-foreground/50" />
      <h3 className="mt-4 text-lg font-medium">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{description}</p>
    </div>
  )
}

function PromptCard({ prompt }: { prompt: Prompt }) {
  const queryClient = useQueryClient()

  const activateMutation = useMutation({
    mutationFn: () => promptsApi.activateUserPrompt(prompt.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-prompts"] })
    },
  })

  const isSystem = prompt.prompt_type === "system"

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
            {isSystem ? (
              <Sparkles className="size-5 text-muted-foreground" />
            ) : (
              <MessageSquare className="size-5 text-muted-foreground" />
            )}
          </div>
          <div>
            <div className="text-sm font-medium flex items-center gap-2">
              {prompt.name}
              {isSystem && prompt.is_active && (
                <Badge variant="secondary" className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-0">
                  <Check className="mr-1 size-3" />
                  Active
                </Badge>
              )}
            </div>
            {prompt.description && (
              <div className="text-xs text-muted-foreground">{prompt.description}</div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isSystem && !prompt.is_active && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => activateMutation.mutate()}
              disabled={activateMutation.isPending}
            >
              {activateMutation.isPending ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Power className="mr-2 size-4" />
              )}
              Activate
            </Button>
          )}
          {isSystem && prompt.is_active && (
            <Badge variant="outline" className="text-muted-foreground">
              <PowerOff className="mr-1 size-3" />
              In Use
            </Badge>
          )}
          <EditPromptDialog prompt={prompt} />
          <DeletePromptButton prompt={prompt} />
        </div>
      </div>
      <div className="rounded-md bg-muted/50 p-3">
        <pre className="text-sm whitespace-pre-wrap font-mono text-muted-foreground">
          {prompt.content.length > 300
            ? `${prompt.content.slice(0, 300)}...`
            : prompt.content}
        </pre>
      </div>
    </div>
  )
}

function CreatePromptDialog({ defaultType = "template" }: { defaultType?: PromptType }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [content, setContent] = useState("")
  const [promptType, setPromptType] = useState<PromptType>(defaultType)
  const [error, setError] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const createMutation = useMutation({
    mutationFn: (data: PromptCreate) => promptsApi.createUserPrompt(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-prompts"] })
      resetForm()
    },
    onError: (err: ApiError) => {
      setError((err.body as { detail?: string })?.detail || "Failed to create prompt")
    },
  })

  const resetForm = () => {
    setName("")
    setDescription("")
    setContent("")
    setPromptType(defaultType)
    setError(null)
    setOpen(false)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !content.trim()) {
      setError("Name and content are required")
      return
    }
    createMutation.mutate({
      name: name.trim(),
      description: description.trim() || null,
      content: content.trim(),
      prompt_type: promptType,
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 size-4" />
          Create Prompt
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Personal Prompt</DialogTitle>
          <DialogDescription>
            Create a new prompt for your personal use.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="prompt-type">Type</Label>
              <Select value={promptType} onValueChange={(v) => setPromptType(v as PromptType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="template">
                    <div className="flex items-center gap-2">
                      <MessageSquare className="size-4" />
                      Template
                    </div>
                  </SelectItem>
                  <SelectItem value="system">
                    <div className="flex items-center gap-2">
                      <Sparkles className="size-4" />
                      System Prompt
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {promptType === "system"
                  ? "System prompts add to the AI's behavior (combined with org/team prompts)"
                  : "Templates are text snippets you can insert into messages"}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value)
                  setError(null)
                }}
                placeholder="e.g., My Writing Style"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Input
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description of this prompt"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="content">Content</Label>
              <Textarea
                id="content"
                value={content}
                onChange={(e) => {
                  setContent(e.target.value)
                  setError(null)
                }}
                placeholder={
                  promptType === "system"
                    ? "Always respond in a concise manner..."
                    : "Enter the template text..."
                }
                rows={6}
                className="font-mono text-sm"
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={resetForm}>
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending && (
                <Loader2 className="mr-2 size-4 animate-spin" />
              )}
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function EditPromptDialog({ prompt }: { prompt: Prompt }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(prompt.name)
  const [description, setDescription] = useState(prompt.description ?? "")
  const [content, setContent] = useState(prompt.content)
  const [error, setError] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const updateMutation = useMutation({
    mutationFn: (data: PromptUpdate) => promptsApi.updateUserPrompt(prompt.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-prompts"] })
      setOpen(false)
      setError(null)
    },
    onError: (err: ApiError) => {
      setError((err.body as { detail?: string })?.detail || "Failed to update prompt")
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !content.trim()) {
      setError("Name and content are required")
      return
    }
    updateMutation.mutate({
      name: name.trim(),
      description: description.trim() || null,
      content: content.trim(),
    })
  }

  const resetForm = () => {
    setName(prompt.name)
    setDescription(prompt.description ?? "")
    setContent(prompt.content)
    setError(null)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        setOpen(isOpen)
        if (!isOpen) resetForm()
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon">
          <Pencil className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Prompt</DialogTitle>
          <DialogDescription>Update the prompt details.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Name</Label>
              <Input
                id="edit-name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value)
                  setError(null)
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-description">Description (optional)</Label>
              <Input
                id="edit-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-content">Content</Label>
              <Textarea
                id="edit-content"
                value={content}
                onChange={(e) => {
                  setContent(e.target.value)
                  setError(null)
                }}
                rows={6}
                className="font-mono text-sm"
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={updateMutation.isPending}>
              {updateMutation.isPending && (
                <Loader2 className="mr-2 size-4 animate-spin" />
              )}
              Save Changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function DeletePromptButton({ prompt }: { prompt: Prompt }) {
  const queryClient = useQueryClient()

  const deleteMutation = useMutation({
    mutationFn: () => promptsApi.deleteUserPrompt(prompt.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-prompts"] })
    },
  })

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive">
          <Trash2 className="size-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Prompt</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete "{prompt.name}"? This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => deleteMutation.mutate()}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {deleteMutation.isPending ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Deleting...
              </>
            ) : (
              "Delete"
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
