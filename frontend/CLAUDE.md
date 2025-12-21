# CLAUDE.md

## Project Overview

React 19 + TypeScript + Vite 7 frontend for an agentic AI template with FastAPI backend. Features multi-tenant workspace management (Organizations → Teams), SSE streaming chat, hierarchical settings, LLM API key management, MCP (Model Context Protocol) server management, and system prompts at org/team/user levels.

## Commands

```bash
npm run dev          # Dev server at localhost:5173
npm run build        # TypeScript + Vite production build
npm run lint         # ESLint
npm run preview      # Preview production build
```

## Architecture

Stack: React 19, TypeScript 5.9, Vite 7, TanStack Router (file-based), TanStack Query (server state), Zustand (client state), Tailwind v4, shadcn/ui

```
src/
├── routes/              # File-based routing → routeTree.gen.ts (auto-generated, never edit)
├── components/
│   ├── ui/              # shadcn/ui (add: npx shadcn@latest add <name>)
│   ├── chat/            # Chat, ChatInput, ChatMessage, CodeBlock, PromptPicker
│   └── settings/        # MemorySettings, MemoryViewer, ApiKeys, Prompts, etc.
├── hooks/useChat.ts     # SSE streaming chat hook
└── lib/
    ├── api.ts           # Typed API client
    ├── auth.ts          # Token management & auth hooks
    ├── queries.ts       # TanStack Query hooks
    ├── chat-store.ts    # Zustand: multi-instance chat state
    ├── ui-store.ts      # Zustand: persisted sidebar/panel state
    ├── workspace.tsx    # Context: org/team selection
    └── settings-context.tsx  # Context: effective chat settings
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

Tool approval: When `tool_approval` event received, renders `ToolApprovalCard` inline showing tool name, description, and arguments. User can approve or reject, resuming agent execution.

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

API (`lib/api.ts`):
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

API (`lib/api.ts`):
```typescript
mcpServersApi.listOrgServers(orgId)
mcpServersApi.listTeamServers(orgId, teamId)
mcpServersApi.listUserServers()
mcpServersApi.listEffectiveServers(orgId, teamId)  // All servers user can use
```

Settings fields:
- `mcp_enabled` - Master toggle (respects hierarchy)
- `mcp_tool_approval_required` - Require approval for tool calls
- `mcp_allow_custom_servers` - Allow adding servers (org/team only)

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
```

## Common Tasks

New route: Add file to `src/routes/` (`foo.tsx` → `/foo`, `$id.tsx` → `/:id`)

New shadcn component: `npx shadcn@latest add <name>`

New API hook: Add to `lib/api.ts`, create TanStack Query hook in `lib/queries.ts`

## Environment

```
VITE_PORT=5173
VITE_API_URL=http://localhost:8000
```

## Code Style

Comments: Keep WHY comments, remove WHAT comments. JSDoc for exported functions only.

```typescript
// ❌ Section separators, obvious explanations
// ✅ Non-obvious decisions, gotchas, workarounds
```
