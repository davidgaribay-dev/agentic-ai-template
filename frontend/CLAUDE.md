# CLAUDE.md

## Project Overview

React 19 + TypeScript + Vite 7 frontend for an agentic AI template with FastAPI backend. Features multi-tenant workspace management (Organizations → Teams), SSE streaming chat, hierarchical settings, LLM API key management, MCP (Model Context Protocol) server management, system prompts at org/team/user levels, and mobile-responsive design.

## Commands

```bash
npm run dev          # Dev server at localhost:5173
npm run build        # TypeScript + Vite production build
npm run lint         # ESLint
npm run preview      # Preview production build
```

## Architecture

Stack: React 19, TypeScript 5.9, Vite 7, TanStack Router (file-based), TanStack Query (server state), Zustand (client state), Tailwind v4, shadcn/ui, i18next (11 languages: en, es, zh, hi, ru, uk, fr, ar, bn, pt, ja)

```
src/
├── routes/              # File-based routing → routeTree.gen.ts (auto-generated, never edit)
├── components/
│   ├── ui/              # shadcn/ui (add: npx shadcn@latest add <name>), ErrorAlert
│   ├── chat/            # Chat, ChatInput, ChatMessage, MessageMedia, ToolApprovalCard
│   │   └── citations/   # CitationBadge, InlineCitationBadge, SourcesHeader, utils
│   ├── documents/       # DocumentUpload, DocumentList, DocumentViewer (RAG)
│   ├── settings/        # MemorySettings, MemoryViewer, ApiKeys, RAG, Theme, Guardrails
│   │   └── prompts/     # PromptRow, CreatePromptDialog, EditPromptDialog, DeletePromptButton
│   ├── sidebar/         # AppSidebar, NavUser, TeamSwitcher, RecentChats
│   ├── search-conversations.tsx  # Full-text conversation search with debouncing
│   └── side-panel.tsx   # Collapsible chat panel with dual-pane support
├── hooks/
│   ├── useChat.ts       # SSE streaming chat hook
│   ├── useDebounce.ts   # Generic debounce hook for search inputs
│   ├── useIsMobile.ts   # Mobile viewport detection (768px breakpoint)
│   ├── useMediaUpload.ts # Image upload with validation and progress
│   └── useDocumentUpload.ts # RAG document upload with progress
├── locales/             # Internationalization (i18n) - 11 languages, ~930 keys each
│   ├── i18n.ts          # i18next configuration and initialization
│   ├── i18next.d.ts     # TypeScript type definitions for translations
│   ├── en/translation.json  # English (base)
│   ├── es/translation.json  # Spanish (Español)
│   ├── zh/translation.json  # Chinese Simplified (中文)
│   ├── hi/translation.json  # Hindi (हिन्दी)
│   ├── ru/translation.json  # Russian (Русский)
│   ├── uk/translation.json  # Ukrainian (Українська)
│   ├── fr/translation.json  # French (Français)
│   ├── ar/translation.json  # Arabic (العربية) - RTL
│   ├── bn/translation.json  # Bengali (বাংলা)
│   ├── pt/translation.json  # Portuguese (Português)
│   └── ja/translation.json  # Japanese (日本語)
└── lib/
    ├── api/             # Modular API client (see API Architecture below)
    ├── auth.ts          # Token management & auth hooks
    ├── queries.ts       # TanStack Query hooks
    ├── chat-store.ts    # Zustand: multi-instance chat state
    ├── ui-store.ts      # Zustand: persisted sidebar/panel state
    ├── workspace.tsx    # Context: org/team selection
    ├── settings-context.tsx  # Context: effective chat settings
    └── utils.ts         # Utilities (formatRelativeTime, cn, etc.)
```

## API Architecture

Modular API client in `lib/api/` with domain-specific modules:

```
lib/api/
├── index.ts          # Barrel export (backwards compatible with @/lib/api imports)
├── client.ts         # Core: apiClient, ApiError, getAuthHeader, getApiErrorMessage
├── types/            # Shared types (Message, OrgRole, TeamRole, InvitationStatus)
├── auth.ts           # authApi: profile, password operations
├── agent.ts          # agentApi: chat streaming, SSE, tool approval
├── organizations.ts  # organizationsApi: org CRUD, members, ownership
├── teams.ts          # teamsApi: team CRUD, members
├── invitations.ts    # invitationsApi: org/team invites
├── conversations.ts  # conversationsApi: chat history management
├── prompts.ts        # promptsApi: system/template prompts (org/team/user)
├── chat-settings.ts  # chatSettingsApi: feature visibility settings
├── memory.ts         # memoryApi: user memory management
├── mcp-servers.ts    # mcpServersApi: MCP server management
├── api-keys.ts       # apiKeysApi: LLM API key management
├── guardrails.ts     # guardrailsApi: content filtering (input/output, PII)
├── media.ts          # mediaApi: chat image uploads
├── documents.ts      # documentsApi: RAG document upload and management
├── rag-settings.ts   # ragSettingsApi: RAG configuration (org/team/user)
└── theme-settings.ts # themeSettingsApi: UI theme configuration
```

Import patterns (both work):
```typescript
// Barrel import (backwards compatible)
import { agentApi, type Conversation } from "@/lib/api"

// Direct module import (better tree-shaking)
import { agentApi } from "@/lib/api/agent"
import type { Conversation } from "@/lib/api/conversations"
```

## Key Patterns

Path Aliases: `@/` → `./src/`

API Proxy: `/api/*` → `VITE_API_URL` (strips `/api` prefix, SSE-enabled)

State Split:
- Server state → TanStack Query
- Client state → Zustand (persisted to localStorage)
- Selection state → React Context

## Authentication

Tokens in localStorage: `auth_token`, `auth_refresh_token`, `auth_token_expiry`. Auto-refresh every 60s when expiring within 60s.

```typescript
const { user, isAuthenticated, isLoading, login, register, logout } = useAuth()
```

### Reactive Auth State

Auth state uses `useSyncExternalStore` for reactive localStorage changes. This ensures immediate UI updates on login/logout without requiring page refresh.

Key exports from `lib/auth.ts`:
- `useAuth()` - Combined hook with user, auth state, and mutations
- `useHasToken()` - Reactive boolean for token presence (uses `useSyncExternalStore`)
- `logout()` - Async function that clears tokens, cache, and navigates to login
- `isLoggedIn()` - Synchronous check (non-reactive, use `useHasToken()` in components)

### Logout Flow

```typescript
// In auth.ts - logout() handles everything:
export async function logout() {
  const { router, queryClient } = await import("@/main")
  removeToken()                    // Clears localStorage, notifies listeners
  await queryClient.cancelQueries() // Prevents 401s from in-flight requests
  queryClient.clear()              // Clears all cached data
  await router.invalidate()        // Re-evaluates route guards
  await router.navigate({ to: "/login" })
}
```

### Root Layout Auth

The root layout (`__root.tsx`) uses `useAuth()` directly (not router context) for reactive auth state:

```typescript
function RootComponent() {
  const { isAuthenticated, isLoading } = useAuth()
  return isAuthenticated || isLoading ? <AuthenticatedLayout /> : <UnauthenticatedLayout />
}
```

Router context is still used for `beforeLoad` guards on individual routes, but layout rendering is driven by the reactive `useAuth()` hook.

## Workspace Context

```typescript
const {
  currentOrg, currentTeam, currentOrgRole,  // Current selection
  organizations, teams,                       // Available options
  switchOrganization, switchTeam, refresh,   // Actions
} = useWorkspace()
```

IMPORTANT: `teams` only includes teams user is member of. For admin views, use `teamsApi.getTeams(orgId)` directly.

## Chat System

Multi-instance SSE streaming via `useChat()`:

```typescript
const { messages, sendMessage, stopStreaming, clearMessages, isStreaming, conversationId } = useChat({
  instanceId: "page",     // or "panel" - same conversationId syncs across instances
  conversationId, organizationId, teamId,
  onTitleUpdate: (id, title) => void,
})
```

Stream events: `token` (content), `title`, `tool_approval` (MCP), `done`, `error`. Uses Streamdown for markdown with custom CodeBlock (Shiki syntax highlighting).

Tool approval flow:
- When `tool_approval` event received, renders `ToolApprovalCard` inline showing tool name, description, and arguments
- User can approve or reject, resuming agent execution
- Abandoned approvals (user sends new message) are auto-cleaned by backend
- `pendingToolApproval` state in chat store tracks current pending approval
- `handleToolApproval(approved)` in `useChat` sends approval/rejection to backend

## Conversation Search

Full-text search across conversation titles and message content with real-time results.

Route: `/search` - Dedicated search page with table view

Component: `SearchConversations` ([search-conversations.tsx](src/components/search-conversations.tsx))

Key features:
- **Real-time debounced search**: 300ms debounce via `useDebounce` hook prevents excessive API calls
- **Multi-modal navigation**: Open in main page or side panel (dual-pane support)
- **Smart filtering**: Searches both conversation titles and message content
- **Relative timestamps**: `formatRelativeTime()` displays human-friendly dates (e.g., "2 hours ago")
- **Team-scoped**: Automatically scopes to current team from workspace context
- **Empty states**: Different UI for "no search yet", "no results", and error states

Query hook ([lib/queries.ts](src/lib/queries.ts#L30)):
```typescript
const { data, isLoading } = useConversations(
  teamId,
  searchQuery,  // Optional search param
  skip,
  limit
)
// Returns: { data: Conversation[], count: number }
```

UX patterns:
- Auto-focus search input on mount
- Clear button appears when query is present
- Loading spinner during debounce + fetch
- Starred conversations show star icon
- Click row → navigate to `/chat?id={conversationId}`
- Dropdown menu → "Open in Panel" (if enabled) or "Open Standalone"
- Displays message count per conversation
- Sorted by starred first, then most recent

Settings integration:
- Respects `chat_enabled` and `chat_panel_enabled` from effective settings
- Conditionally shows "Open in Panel" option based on `chat_panel_enabled`

Backend API: `GET /v1/conversations?team_id={id}&search={query}`

## Memory System

Persistent memory management across conversations with semantic search.

Components (`components/settings/`):
- `MemorySettings` - Toggle for enabling/disabling memory (respects hierarchy)
- `MemoryViewer` - List, view, and delete stored memories

Hooks (`lib/queries.ts`):
```typescript
const { data } = useUserMemories(orgId, teamId)  // Fetch memories
const deleteMutation = useDeleteMemory(orgId, teamId)  // Delete single
const clearMutation = useClearAllMemories(orgId, teamId)  // Clear all
```

API (`lib/api/memory.ts`):
```typescript
memoryApi.listMemories(orgId?, teamId?, limit?)
memoryApi.deleteMemory(memoryId, orgId?, teamId?)
memoryApi.clearAllMemories(orgId?, teamId?)
```

Memory types: `preference`, `fact`, `entity`, `relationship`, `summary` - displayed with color-coded badges.

Settings integration:
- `memory_enabled` in `EffectiveChatSettings`
- Hierarchical control: org → team → user
- Higher level can disable for all below

## MCP (Model Context Protocol)

External tool integration via MCP servers. Managed at org/team/user levels.

Components (`components/settings/`):
- `MCPServersList` - Display/add/edit/delete MCP servers with full form (transport, auth, etc.)
- `MCPSettings` - Toggle MCP enabled/disabled, allow custom servers
- `ToolApprovalCard` (`components/chat/`) - Inline approval UI for MCP tool calls

API (`lib/api/mcp-servers.ts`):
```typescript
mcpServersApi.listOrgServers(orgId)
mcpServersApi.listTeamServers(orgId, teamId)
mcpServersApi.listUserServers(orgId, teamId)
mcpServersApi.listEffectiveServers(orgId, teamId)  // All servers user can use
mcpServersApi.listEffectiveTools(orgId, teamId)    // All tools with server info
mcpServersApi.testOrgServer(orgId, serverId)       // Test server connectivity
```

Settings fields:
- `mcp_enabled` - Master toggle (respects hierarchy)
- `mcp_tool_approval_required` - Require approval for tool calls
- `mcp_allow_custom_servers` - Allow adding servers (org/team only)
- `disabled_mcp_servers` - List of server UUIDs to disable
- `disabled_tools` - List of tool names to disable

Tool picker (`components/chat/ToolPicker.tsx`):
- Displays available tools grouped by server
- Allows enabling/disabling individual tools
- Queries `listEffectiveTools` for tool discovery

## Guardrails (Content Filtering)

AI safety controls for input/output messages. Managed at org/team/user levels.

Components (`components/settings/`):
- `GuardrailSettings` - Full configuration UI with collapsible sections
  - Input/output keyword and regex pattern management
  - PII detection toggles and type selection
  - Action selection (block/warn/redact)
  - Org-level override controls
  - Inline test panel for dry-run validation

API (`lib/api/guardrails.ts`):
```typescript
guardrailsApi.getOrgGuardrails(orgId)
guardrailsApi.updateOrgGuardrails(orgId, data)
guardrailsApi.getTeamGuardrails(orgId, teamId)
guardrailsApi.updateTeamGuardrails(orgId, teamId, data)
guardrailsApi.getUserGuardrails()
guardrailsApi.updateUserGuardrails(data)
guardrailsApi.getEffectiveGuardrails(orgId?, teamId?)  // Computed hierarchy
guardrailsApi.testGuardrails(request, orgId?, teamId?) // Dry-run test
```

Types:
- `GuardrailAction`: `"block" | "warn" | "redact"`
- `PIIType`: `"email" | "phone" | "ssn" | "credit_card" | "ip_address"`
- Pattern merging: Lower levels can add patterns, most restrictive action wins
- Org controls: `allow_team_override`, `allow_user_override`

Settings integration:
- Available in org settings, team settings, and user settings tabs
- Respects hierarchy - disabled state shows which level disabled it
- Test panel allows validation before saving

## Chat Media (Image Uploads)

Multimodal chat with image attachments. Stored in SeaweedFS with multi-tenant scoping.

Hook (`hooks/useMediaUpload.ts`):
```typescript
const {
  pendingUploads,    // Files queued for upload with preview URLs
  isUploading,       // Upload in progress
  addFiles,          // Add files to queue (validates type/size)
  removeUpload,      // Remove from queue
  clearUploads,      // Clear all pending
  uploadAll,         // Upload all pending → returns ChatMedia[]
  validateFile,      // Manual validation check
} = useMediaUpload({
  organizationId,
  teamId,
  maxFiles: 5,       // Default 5 per message
  maxFileSize: 10 * 1024 * 1024,  // Default 10MB
  onUploadComplete,
  onError,
})
```

API (`lib/api/media.ts`):
```typescript
mediaApi.upload({ file, organizationId, teamId })
mediaApi.list({ organizationId, teamId, skip, limit })
mediaApi.get(id)
mediaApi.getContentUrl(id)  // For embedding in img src (includes auth token)
mediaApi.delete(id)
mediaApi.getUsage(organizationId, teamId?)  // Storage stats
```

Components:
- `ImagePreview` (`components/chat/`) - Inline thumbnail with expand/download
- `MediaLibrary` (`components/settings/`) - Grid view of uploads with delete
- Chat input supports drag-drop and file picker for images

Supported types: JPEG, PNG, GIF, WebP
Limits: Configurable at org level via `max_media_file_size_mb`, `max_media_storage_mb`

## RAG (Documents)

Document-based knowledge retrieval with AI-powered search. Documents uploaded to RAG become searchable across conversations.

Route: `/org/team/:teamId/documents` - Document management page

Components:
- `DocumentUpload` (`components/documents/`) - Drag-drop upload with progress
- `DocumentList` - Table view with status, file type, chunk count
- `DocumentViewer` - Full document content preview
- `AttachmentPicker` (`components/chat/`) - Popover for upload mode selection
- `AttachmentPreviewList` (`components/chat/`) - Preview of pending attachments
- `CitationBadge` (`components/chat/`) - Inline source citation rendering

Hook (`hooks/useDocumentUpload.ts`):
```typescript
const {
  uploads,          // Upload states with progress
  isUploading,      // Any upload in progress
  uploadFile,       // Upload single file → Document
  uploadFiles,      // Upload multiple files
  clearCompleted,   // Clear finished uploads
} = useDocumentUpload({
  organizationId,
  teamId,
  scope: "team",    // "org" | "team" | "user"
  onUploadComplete,
  onError,
})
```

API (`lib/api/documents.ts`):
```typescript
documentsApi.upload({ file, organization_id, team_id?, scope })
documentsApi.list({ organization_id, team_id?, status?, page?, page_size? })
documentsApi.get(documentId)
documentsApi.delete(documentId)
documentsApi.reprocess(documentId)
documentsApi.getChunks(documentId)
documentsApi.getContent(documentId)
```

Document statuses: `pending` → `processing` → `completed`/`failed`

Chat integration:
- `AttachmentPicker` in `ChatInput` offers two modes:
  - "Use in this conversation" - inline for immediate analysis
  - "Add to Knowledge Base" - upload to RAG
- `search_documents` tool auto-queries RAG when enabled
- Citations rendered with `CitationBadge` showing source file

## RAG Settings

Hierarchical RAG configuration (org → team → user).

Components (`components/settings/`):
- `org-rag-settings.tsx` - Org-level RAG configuration
- `team-rag-settings.tsx` - Team-level RAG configuration
- `user-rag-settings.tsx` - User-level RAG configuration

API (`lib/api/rag-settings.ts`):
```typescript
ragSettingsApi.getOrgSettings(orgId)
ragSettingsApi.updateOrgSettings(orgId, settings)
ragSettingsApi.getTeamSettings(orgId, teamId)
ragSettingsApi.updateTeamSettings(orgId, teamId, settings)
ragSettingsApi.getUserSettings()
ragSettingsApi.updateUserSettings(settings)
ragSettingsApi.getEffectiveSettings(organizationId?, teamId?)
```

Settings fields:
- `rag_enabled` - Master toggle
- `chunk_size`, `chunk_overlap` - Chunking parameters
- `chunks_per_query`, `similarity_threshold` - Search parameters
- `use_hybrid_search`, `reranking_enabled`, `query_rewriting_enabled`
- `max_documents_per_user`, `max_document_size_mb`, `allowed_file_types`
- `allow_team_customization`, `allow_user_customization` - Hierarchy controls

## Theme Settings

Customizable UI theming with predefined palettes and custom theme support.

API (`lib/api/theme-settings.ts`):
```typescript
themeSettingsApi.getOrgSettings(orgId)
themeSettingsApi.updateOrgSettings(orgId, settings)
themeSettingsApi.getTeamSettings(orgId, teamId)
themeSettingsApi.updateTeamSettings(orgId, teamId, settings)
themeSettingsApi.getUserSettings()
themeSettingsApi.updateUserSettings(settings)
themeSettingsApi.getEffectiveSettings(organizationId?, teamId?, systemPrefersDark?)
themeSettingsApi.getPredefinedThemes()  // All available theme palettes
```

Types:
- `ThemeMode`: `"light" | "dark" | "system"`
- `ThemeColors`: 30+ color variables (background, foreground, primary, etc.)
- Predefined themes: github-light, one-dark-pro, etc.
- Custom themes: `custom_light_theme`, `custom_dark_theme` JSON fields

Settings hierarchy:
- Org: `default_theme_mode`, `default_light_theme`, `default_dark_theme`
- Team/User: Can override if `allow_*_customization=true`

## Internationalization (i18n)

All user-facing strings use i18next for translation support. **NEVER hardcode user-facing strings** - always use translation keys.

### Setup

i18next is initialized in `locales/i18n.ts` with:
- Browser language detection (localStorage → navigator)
- Fallback to English
- Type-safe translations via `i18next.d.ts`

### Usage Pattern

```typescript
import { useTranslation } from "react-i18next";

function MyComponent() {
  const { t } = useTranslation();

  return (
    <div>
      <h1>{t("page_title")}</h1>
      <p>{t("welcome_message", { name: user.name })}</p>
      <Button>{t("com_save")}</Button>
    </div>
  );
}
```

### Translation Key Naming Convention

Keys follow a hierarchical naming pattern with prefixes:

| Prefix | Usage | Examples |
|--------|-------|----------|
| `com_` | Common/shared strings | `com_save`, `com_cancel`, `com_delete`, `com_loading` |
| `auth_` | Authentication | `auth_sign_in`, `auth_email_required`, `auth_password_min_length` |
| `chat_` | Chat interface | `chat_placeholder`, `chat_send`, `chat_stop` |
| `nav_` | Navigation | `nav_settings`, `nav_home`, `nav_log_out` |
| `settings_` | Settings pages | `settings_profile`, `settings_account`, `settings_preferences` |
| `org_` | Organization management | `org_create`, `org_members`, `org_invite` |
| `team_` | Team management | `team_create`, `team_members`, `team_settings` |
| `mcp_` | MCP servers | `mcp_add_server`, `mcp_test_connection`, `mcp_transport` |
| `rag_` | RAG/Documents | `rag_enabled`, `rag_upload`, `rag_chunks` |
| `guard_` | Guardrails | `guard_input`, `guard_output`, `guard_pii_detection` |
| `mem_` | Memory | `mem_enabled`, `mem_clear_all`, `mem_no_memories` |
| `theme_` | Theme settings | `theme_mode`, `theme_light`, `theme_dark` |
| `prompt_` | Prompts | `prompt_system`, `prompt_template`, `prompt_create` |
| `doc_` | Documents | `doc_upload`, `doc_processing`, `doc_failed` |
| `err_` | Error messages | `err_generic`, `err_network`, `err_unauthorized` |
| `aria_` | Accessibility labels | `aria_toggle_sidebar`, `aria_chat_messages` |

### Adding New Translations

1. **Add the key to `locales/en/translation.json`**:
```json
{
  "my_feature_title": "My Feature",
  "my_feature_description": "This is my new feature",
  "my_feature_action": "Do Something"
}
```

2. **Use in component**:
```typescript
const { t } = useTranslation();
return <h1>{t("my_feature_title")}</h1>;
```

### Interpolation (Dynamic Values)

Use double curly braces for variables:

```json
{
  "welcome_user": "Welcome, {{name}}!",
  "items_count": "{{count}} items found",
  "confirm_delete": "Are you sure you want to delete \"{{name}}\"?"
}
```

```typescript
t("welcome_user", { name: "Alice" })  // "Welcome, Alice!"
t("items_count", { count: 5 })        // "5 items found"
```

### Pluralization

i18next supports plural forms:

```json
{
  "item": "{{count}} item",
  "item_plural": "{{count}} items"
}
```

```typescript
t("item", { count: 1 })  // "1 item"
t("item", { count: 5 })  // "5 items"
```

### Best Practices

1. **Always use `useTranslation`** - Never hardcode strings
```typescript
// ✅ Correct
<Button>{t("com_save")}</Button>

// ❌ Wrong - hardcoded string
<Button>Save</Button>
```

2. **Reuse common keys** - Check for existing `com_*` keys before adding new ones
```typescript
// ✅ Reuse common keys
t("com_save")    // Not "settings_save_button"
t("com_cancel")  // Not "dialog_cancel"
t("com_delete")  // Not "remove_item"
```

3. **Use descriptive key names** - Keys should be self-documenting
```typescript
// ✅ Clear and specific
t("mcp_test_connection_success")
t("org_member_invite_sent")

// ❌ Vague or ambiguous
t("success")
t("message1")
```

4. **Group related translations** - Use consistent prefixes
```json
{
  "mcp_add_server": "Add Server",
  "mcp_edit_server": "Edit Server",
  "mcp_delete_server": "Delete Server",
  "mcp_test_connection": "Test Connection"
}
```

5. **Include context in placeholders** - Help translators understand
```json
{
  "confirm_delete_server": "Delete MCP server \"{{serverName}}\"?",
  "error_load_failed": "Failed to load {{resourceType}}"
}
```

### Adding New Languages

1. Create `locales/{lang}/translation.json` (copy from `en/`)
2. Add to `supportedLanguages` in `locales/i18n.ts`:
```typescript
export const supportedLanguages = [
  { code: "en", name: "English", nativeName: "English" },
  { code: "es", name: "Spanish", nativeName: "Español" },
  { code: "zh", name: "Chinese", nativeName: "中文" },
  { code: "hi", name: "Hindi", nativeName: "हिन्दी" },
  { code: "ru", name: "Russian", nativeName: "Русский" },
  { code: "uk", name: "Ukrainian", nativeName: "Українська" },
  { code: "fr", name: "French", nativeName: "Français" },
  { code: "ar", name: "Arabic", nativeName: "العربية" },
  { code: "bn", name: "Bengali", nativeName: "বাংলা" },
  { code: "pt", name: "Portuguese", nativeName: "Português" },
  { code: "ja", name: "Japanese", nativeName: "日本語" },
] as const;
```

3. Import and add to `resources`:
```typescript
import es from "./es/translation.json";
import zh from "./zh/translation.json";
// ... other imports
export const resources = {
  en: { translation: en },
  es: { translation: es },
  zh: { translation: zh },
  // ... other languages
} as const;
```

**Note on RTL**: Arabic (`ar`) is a right-to-left language. The app should handle RTL layout when Arabic is selected.

### Language Settings UI

`LanguageSettings` component (`components/settings/language-settings.tsx`) provides:
- Dropdown to select language
- Persists selection to localStorage
- Applies immediately without page refresh

## Layout System

IMPORTANT - CSS Grid 3-column layout:

```
┌─────────────┬──────────────────┬─────────────┐
│   Sidebar   │   Main (1fr)     │  Side Panel │
│ 16rem/3rem  │   overflow-auto  │  450-600px  │
└─────────────┴──────────────────┴─────────────┘
```

Page Template (authenticated routes):
```tsx
// ✅ CORRECT
<div className="bg-background">
  <div className="mx-auto max-w-4xl px-4 py-8">{content}</div>
</div>

// ❌ WRONG - causes layout issues
<div className="h-full ...">
<div className="min-h-screen ...">
<div className="container ...">
```

Exceptions: Login/signup use `min-h-screen` centering. Chat page uses `h-full` for internal scrolling.

## Mobile Responsive Design

Breakpoint: 768px (md). Uses `useIsMobile()` hook for viewport detection via MediaQuery API.

Layout switching:
- Desktop (≥768px): 3-column CSS Grid with sidebar, main content, and optional side panel
- Mobile (<768px): Single-column flex layout with off-canvas sidebar drawer

Key components:
- `MobileLayout` / `DesktopLayout` in `__root.tsx` - Separate layouts rendered based on viewport
- `MobileSidebarToggle` - Floating button (top-left) to open sidebar drawer on mobile
- `AppSidebar` - Automatically renders as off-canvas drawer when `isMobile` (via shadcn/ui `SidebarProvider`)

Mobile-specific behaviors:
- Side panel disabled on mobile (chat toggle button hidden)
- DataTable supports mobile card view via `mobileCardView` + `renderMobileCard` props
- Settings pages use responsive tab layouts (scrollable horizontal on mobile)
- Touch-friendly tap targets (min 44px)
- iOS safe area support (`env(safe-area-inset-bottom)`)

```typescript
// Using mobile detection
import { useIsMobile } from "@/hooks";

function MyComponent() {
  const isMobile = useIsMobile();
  return isMobile ? <MobileView /> : <DesktopView />;
}
```

DataTable mobile cards:
```typescript
<DataTable
  columns={columns}
  data={data}
  mobileCardView={true}
  renderMobileCard={(row) => (
    <div>{row.original.name}</div>
  )}
/>
```

## Side Panel

```typescript
const { isOpen, toggle, width, setWidth } = useSidePanel()
// 450-600px, resizable, closes on Escape, persisted via Zustand
```

## Theme System

```typescript
const { theme, setTheme } = useTheme()  // "dark" | "light" | "system"
```

Stored in localStorage `"ui-theme"`. Colors use OKLch CSS variables.

## UI Store (Persisted)

```typescript
const { sidebarOpen, sidePanelOpen, sidePanelWidth, toggleSidebar, toggleSidePanel } = useUIStore()
// Persisted to localStorage "ui-storage"
```

## App Sidebar

- TeamSwitcher: Team selector, "All Teams" option, gear icon for team settings (admins)
- NavUser: Organizations page, Settings, Logout
- Collapsed state persisted via Zustand

## Permission-Based Access

- Organizations page: admin/owner only (members see "Access Denied")
- Team settings: team admin or org admin/owner
- Direct URL to restricted page shows "Access Denied" with redirect

## Routes Reference

```
/                          # Landing → /chat if authenticated
/login, /signup            # Auth pages
/chat                      # Main chat (?id=conversationId)
/invite?token=...          # Invitation acceptance
/settings                  # User settings (tabs: profile, account, system-prompts, templates, preferences)
/organizations             # Org management (admin/owner)
/org/settings              # Org settings
/org/api-keys              # Org LLM API keys
/org/prompts               # Org prompts
/org/team/:teamId/settings # Team settings
/org/team/:teamId/api-keys # Team LLM API keys
/org/team/:teamId/prompts  # Team prompts
/org/mcp-servers           # Org MCP servers
/org/team/:teamId/mcp-servers  # Team MCP servers
/org/team/:teamId/documents    # Team document management (RAG)
/search                        # Conversation search
```

## Common Tasks

New route: Add file to `src/routes/` (`foo.tsx` → `/foo`, `$id.tsx` → `/:id`)

New shadcn component: `npx shadcn@latest add <name>`

New API hook: Add to appropriate `lib/api/*.ts` module, export from `lib/api/index.ts`, create TanStack Query hook in `lib/queries.ts`

## Environment

```
VITE_PORT=5173
VITE_API_URL=http://localhost:8000
```

## Code Quality & Development Tools

### Quick Commands

```bash
# Install dependencies
npm install

# Lint and auto-fix
npm run lint

# Build for production (includes type checking)
npm run build

# Preview production build
npm run preview
```

### Tools Stack

| Tool | Purpose | Config Location |
|------|---------|-----------------|
| **ESLint** | Linting with TypeScript support | [eslint.config.js](eslint.config.js) |
| **TypeScript** | Type checking (strict mode) | [tsconfig.json](tsconfig.json) |
| **Prettier** | Code formatting | Via pre-commit hooks |
| **Pre-commit** | Git hooks for automated checks | [.pre-commit-config.yaml](../.pre-commit-config.yaml) |

### ESLint Configuration

Uses `typescript-eslint` v8 with recommended rules.

**Enabled rules**:
- TypeScript-specific linting
- React hooks rules
- React refresh rules
- Unused variable detection

**Disabled rules**:
- `@typescript-eslint/no-unused-vars` - TypeScript handles this

### TypeScript Configuration

**Strict mode enabled** with:
- `noUncheckedIndexedAccess` - Safer array/object access
- `noEmit` - Vite handles compilation
- Path aliases: `@/*` → `./src/*`

### Pre-Commit Hooks (Automated)

**Pre-commit hooks run automatically on `git commit`** - no manual checks needed.

One-time setup (from backend/):
```bash
cd ../backend && uv run pre-commit install
```

What runs automatically for frontend files:
- ✅ ESLint linting
- ✅ TypeScript type checking
- ✅ Prettier formatting (with auto-fix)
- ✅ Trailing whitespace, EOF fixes
- ✅ JSON/YAML validation

Skip hooks if needed:
```bash
SKIP=frontend-typecheck git commit -m "quick fix"  # Skip specific hook
git commit --no-verify -m "hotfix"                 # Skip all hooks (emergency)
```

Run manually on all files:
```bash
cd ../backend && uv run pre-commit run --all-files
```

### VS Code Integration

Install recommended extensions (see [.vscode/extensions.json](../.vscode/extensions.json)):
- ESLint
- Prettier
- Tailwind CSS IntelliSense
- TypeScript

Settings in [.vscode/settings.json](../.vscode/settings.json):
- Auto-format on save (Prettier)
- Auto-fix on save (ESLint)
- Tailwind CSS IntelliSense

Run tasks from Command Palette (`Cmd+Shift+P` → Tasks: Run Task):
- Frontend: Lint
- Frontend: Build
- Frontend: Dev Server

### Best Practices

1. **Enable auto-format on save** - Prettier handles formatting
2. **Fix ESLint warnings** - Don't ignore linter warnings
3. **Use TypeScript strict mode** - Helps catch bugs early
4. **Run build before committing** - Catches type errors
5. **Use path aliases** - Import with `@/` instead of relative paths

### Code Style

Comments: Keep WHY comments, remove WHAT comments. JSDoc for exported functions only.

```typescript
// ❌ Section separators, obvious explanations
// ✅ Non-obvious decisions, gotchas, workarounds
```

### Form Handling with React Hook Form

Settings forms use React Hook Form with Zod validation:

```typescript
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

const schema = z.object({
  name: z.string().min(1, "Name is required"),
  enabled: z.boolean(),
  count: z.number().min(1).max(20),
});
type FormData = z.infer<typeof schema>;

// In component:
const form = useForm<FormData>({
  resolver: zodResolver(schema),
  defaultValues: { name: "", enabled: true, count: 5 },
});
const { formState: { isDirty }, reset, register, watch, setValue } = form;

// Reset when data loads:
useEffect(() => {
  if (data) reset({ ...data });
}, [data, reset]);

// For Switch (controlled):
<Switch
  checked={watch("enabled")}
  onCheckedChange={(checked) => setValue("enabled", checked, { shouldDirty: true })}
/>

// For Input (uncontrolled):
<Input {...register("count", { valueAsNumber: true })} />

// Submit:
const handleSave = form.handleSubmit((data) => mutation.mutate(data));
```

Use `ErrorAlert` component for mutation errors:
```typescript
import { ErrorAlert } from "@/components/ui/error-alert";

{mutation.isError && <ErrorAlert error={mutation.error} fallback="Failed to save" />}
```

### shadcn Dialog Width Override

shadcn's Dialog has a default `sm:max-w-lg` that overrides custom width classes. Use `!important`:

```typescript
// ❌ Won't work - default sm:max-w-lg takes precedence
<DialogContent className="max-w-4xl">

// ✅ Works - !important overrides default
<DialogContent className="!max-w-6xl w-[90vw]">
```
