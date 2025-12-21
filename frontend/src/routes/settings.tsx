import { useState, useEffect, useRef } from "react"
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router"
import { z } from "zod"
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
  Settings2,
  Camera,
  ChevronDown,
  ChevronRight,
  Brain,
} from "lucide-react"
import { useAuth, authKeys } from "@/lib/auth"
import {
  authApi,
  promptsApi,
  ApiError,
  type ChatSettings as ChatSettingsType,
} from "@/lib/api"
import { useWorkspace } from "@/lib/workspace"
import {
  useOrgChatSettings,
  useTeamChatSettings,
  useUserChatSettings,
  useUpdateUserChatSettings,
} from "@/lib/queries"
import { ChatSettings } from "@/components/chat-settings"
import { MemorySettings } from "@/components/settings/memory-settings"
import { MemoryViewer } from "@/components/settings/memory-viewer"
import { PromptRow, CreatePromptDialog } from "@/components/settings"
import { getInitials, isValidImageUrl } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"

const settingsSearchSchema = z.object({
  tab: z.enum(["profile", "ai", "memory", "preferences"]).optional(),
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

  const currentTab = tabFromUrl || "profile"

  const handleTabChange = (value: string) => {
    navigate({ to: "/settings", search: { tab: value as SettingsTab }, replace: true })
  }

  const tabs = [
    { value: "profile", label: "Profile", icon: User },
    { value: "ai", label: "AI Configuration", icon: Sparkles },
    { value: "memory", label: "Memory", icon: Brain },
    { value: "preferences", label: "Preferences", icon: Settings2 },
  ]

  return (
    <div className="bg-background min-h-screen">
      <div className="mx-auto max-w-5xl px-6 py-8">
        <h1 className="text-lg font-semibold mb-6">Profile Settings</h1>
        <Tabs value={currentTab} onValueChange={handleTabChange} orientation="vertical" className="flex gap-6">
          <div className="w-48 flex-shrink-0">
            <div className="sticky top-6">
              <TabsList className="flex flex-col items-stretch h-auto bg-transparent p-0 space-y-0.5">
                {tabs.map((tab) => (
                  <TabsTrigger
                    key={tab.value}
                    value={tab.value}
                    className="justify-start px-2.5 py-1.5 h-auto text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 data-[state=active]:bg-muted data-[state=active]:text-foreground rounded-md"
                  >
                    <tab.icon className="mr-2 size-3.5" />
                    {tab.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <TabsContent value="profile" className="mt-0">
              <ProfileSection />
            </TabsContent>

            <TabsContent value="ai" className="mt-0">
              <AIConfigurationSection />
            </TabsContent>

            <TabsContent value="memory" className="mt-0">
              <MemorySection />
            </TabsContent>

            <TabsContent value="preferences" className="mt-0">
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
      {profileError && (
        <p className="text-sm text-destructive">{profileError}</p>
      )}

      <div className="flex items-start gap-4">
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
              className="relative group cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-full flex-shrink-0"
            >
              {user?.profile_image_url && isValidImageUrl(user.profile_image_url) ? (
                <img
                  src={user.profile_image_url}
                  alt={user.full_name || "Profile"}
                  className="size-16 rounded-full object-cover"
                />
              ) : (
                <div className="flex size-16 items-center justify-center rounded-full bg-gradient-to-br from-primary/80 to-primary">
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
          <DropdownMenuContent align="start" className="w-40">
            <DropdownMenuItem onClick={handleImageClick}>
              <Camera className="mr-2 size-4" />
              {user?.profile_image_url ? "Change" : "Upload"}
            </DropdownMenuItem>
            {user?.profile_image_url && (
              <DropdownMenuItem onClick={handleDeleteImage} className="text-destructive focus:text-destructive">
                <Trash2 className="mr-2 size-4" />
                Remove
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="flex-1 min-w-0 space-y-3">
          <div>
            {isEditingName ? (
              <div className="flex items-center gap-2">
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Enter your name"
                  className="h-8 max-w-xs"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveName()
                    if (e.key === "Escape") handleCancelName()
                  }}
                />
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7"
                  onClick={handleSaveName}
                  disabled={updateProfileMutation.isPending}
                >
                  {updateProfileMutation.isPending ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Check className="size-3.5 text-green-600" />
                  )}
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7"
                  onClick={handleCancelName}
                  disabled={updateProfileMutation.isPending}
                >
                  <X className="size-3.5" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 group">
                <span className="font-medium">{user?.full_name || "No name set"}</span>
                <button
                  onClick={() => setIsEditingName(true)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-muted rounded"
                >
                  <Pencil className="size-3 text-muted-foreground" />
                </button>
              </div>
            )}
          </div>

          <div>
            {isEditingEmail ? (
              <div className="flex items-center gap-2">
                <Input
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  placeholder="Enter your email"
                  className="h-7 max-w-xs text-sm"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveEmail()
                    if (e.key === "Escape") handleCancelEmail()
                  }}
                />
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-6"
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
                  className="size-6"
                  onClick={handleCancelEmail}
                  disabled={updateProfileMutation.isPending}
                >
                  <X className="size-3" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 group">
                <Mail className="size-3.5 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">{user?.email}</span>
                <button
                  onClick={() => setIsEditingEmail(true)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-muted rounded"
                >
                  <Pencil className="size-2.5 text-muted-foreground" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function AIConfigurationSection() {
  const { data: promptsData, isLoading } = useQuery({
    queryKey: ["user-prompts"],
    queryFn: () => promptsApi.listUserPrompts(),
  })

  const prompts = promptsData?.data ?? []
  const systemPrompts = prompts.filter((p) => p.prompt_type === "system")
  const templatePrompts = prompts.filter((p) => p.prompt_type === "template")

  const [systemPromptsOpen, setSystemPromptsOpen] = useState(true)
  const [templatesOpen, setTemplatesOpen] = useState(true)

  return (
    <div className="space-y-4">
      <Collapsible open={systemPromptsOpen} onOpenChange={setSystemPromptsOpen}>
        <div className="flex items-center justify-between py-2">
          <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium hover:text-foreground/80">
            {systemPromptsOpen ? (
              <ChevronDown className="size-4" />
            ) : (
              <ChevronRight className="size-4" />
            )}
            <Sparkles className="size-4" />
            System Prompts
            <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
              {systemPrompts.length}
            </Badge>
          </CollapsibleTrigger>
          <CreatePromptDialog scope={{ type: "user" }} defaultType="system" />
        </div>
        <CollapsibleContent className="space-y-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : systemPrompts.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No system prompts yet
            </p>
          ) : (
            systemPrompts.map((prompt) => (
              <PromptRow key={prompt.id} prompt={prompt} scope={{ type: "user" }} />
            ))
          )}
        </CollapsibleContent>
      </Collapsible>

      <div className="border-t" />

      <Collapsible open={templatesOpen} onOpenChange={setTemplatesOpen}>
        <div className="flex items-center justify-between py-2">
          <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium hover:text-foreground/80">
            {templatesOpen ? (
              <ChevronDown className="size-4" />
            ) : (
              <ChevronRight className="size-4" />
            )}
            <MessageSquare className="size-4" />
            Templates
            <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
              {templatePrompts.length}
            </Badge>
          </CollapsibleTrigger>
          <CreatePromptDialog scope={{ type: "user" }} defaultType="template" />
        </div>
        <CollapsibleContent className="space-y-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : templatePrompts.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No templates yet
            </p>
          ) : (
            templatePrompts.map((prompt) => (
              <PromptRow key={prompt.id} prompt={prompt} scope={{ type: "user" }} />
            ))
          )}
        </CollapsibleContent>
      </Collapsible>
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
    <div className="space-y-4">
      <div className="flex items-center gap-2 py-2">
        <MessageSquare className="size-4" />
        <span className="text-sm font-medium">Chat Features</span>
      </div>
      <p className="text-xs text-muted-foreground">
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
  )
}

function MemorySection() {
  const { currentOrg, currentTeam } = useWorkspace()
  const { data: orgSettings, isLoading: isLoadingOrg } = useOrgChatSettings(currentOrg?.id)
  const { data: teamSettings, isLoading: isLoadingTeam } = useTeamChatSettings(
    currentOrg?.id,
    currentTeam?.id
  )
  const { data: userSettings, isLoading: isLoadingUser } = useUserChatSettings()
  const updateMutation = useUpdateUserChatSettings()

  const handleMemoryEnabledChange = (enabled: boolean) => {
    updateMutation.mutate({ memory_enabled: enabled })
  }

  const memoryEnabled = userSettings?.memory_enabled ?? true
  const memoryDisabledByOrg = orgSettings ? !orgSettings.memory_enabled : false
  const memoryDisabledByTeam = teamSettings ? !teamSettings.memory_enabled : false

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 py-2">
          <Brain className="size-4" />
          <span className="text-sm font-medium">Memory Settings</span>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          Control whether the AI remembers information from your conversations.
          Organization and team settings take precedence.
        </p>
        <MemorySettings
          memoryEnabled={memoryEnabled}
          onMemoryEnabledChange={handleMemoryEnabledChange}
          memoryDisabledByOrg={memoryDisabledByOrg}
          memoryDisabledByTeam={memoryDisabledByTeam}
          isLoading={isLoadingOrg || isLoadingTeam || isLoadingUser || updateMutation.isPending}
          level="user"
        />
      </div>

      <div className="border-t pt-6">
        <div className="flex items-center gap-2 mb-4">
          <Brain className="size-4" />
          <span className="text-sm font-medium">Your Memories</span>
        </div>
        <MemoryViewer />
      </div>
    </div>
  )
}
