# CLAUDE.md

## Project Overview

Full-stack AI agent platform with FastAPI + LangGraph backend and React 19 + TanStack frontend. Features JWT authentication, multi-tenant architecture (Organizations → Teams → Users), SSE streaming chat, MCP (Model Context Protocol) tool integration, mobile-responsive UI, and enterprise integrations (Infisical secrets, OpenSearch audit logging, Langfuse LLM tracing).

See also: [backend/CLAUDE.md](backend/CLAUDE.md) for API patterns, [frontend/CLAUDE.md](frontend/CLAUDE.md) for UI patterns.

## Quick Start

```bash
# Option 1: Automated setup (recommended for first-time)
./setup-local.sh   # Infrastructure + migrations + Infisical/Langfuse setup

# Option 2: Manual setup
docker compose -f docker-compose-local.yml up -d
cd backend && uv sync && uv run alembic upgrade head
cd backend && uv run python scripts/setup-infisical.py
cd backend && uv run python scripts/setup-langfuse.py

# Then start dev servers in separate terminals:
# Terminal 1 - Backend
cd backend && uv run uvicorn backend.main:app --reload  # port 8000

# Terminal 2 - Frontend
cd frontend && npm install && npm run dev  # port 5173
```

Setup Scripts:
- `setup.sh` - Full setup including dependency installation (CI/first-time)
- `setup-local.sh` - Infrastructure only, for local dev with hot reload
- `docker-compose-local.yml` - Infrastructure services without backend/frontend containers

Services: Frontend (5173), Backend API (8000), API Docs (8000/v1/docs), Infisical (8081), OpenSearch Dashboards (5601), Langfuse (3001)

Default superuser: `admin@example.com` / `changethis` (configure in `backend/.env`)

## Multi-Tenant Architecture

```
Organization (tenant boundary)
├── OrganizationMember (user ←→ org with OrgRole: owner/admin/member)
├── Team (sub-group within org)
│   └── TeamMember (org_member ←→ team with TeamRole: admin/member/viewer)
└── Resources (conversations, prompts, API keys, MCP servers) scoped to org + team + user
```

Critical: TeamMember links to `org_member_id` (not user directly). User must be org member before joining teams.

## API Integration

Frontend proxy (`frontend/vite.config.ts`): `/api/*` → `VITE_API_URL` (strips `/api` prefix, SSE-enabled)

Authentication flow:
1. `POST /v1/auth/login` (form-encoded: username=email, password)
2. Store tokens: `auth_token`, `auth_refresh_token`, `auth_token_expiry` in localStorage
3. Auto-refresh via `tryRefreshToken()` every 60s when expiring within 60s

**Token Revocation**: Tokens can be revoked before natural expiration
- `POST /v1/auth/logout` revokes current tokens
- Password changes automatically revoke all user tokens via `password_changed_at` check
- Revocation uses in-memory TTL cache (fast) + database persistence (durable)
- Backend: `backend/auth/token_revocation.py` with `RevokedToken` model

Key API groups: See `backend/api/main.py` for all routers. Frontend client at `frontend/src/lib/api/` (modular architecture).

## Chat/Agent System

SSE streaming: `POST /v1/agent/chat` with `stream: true`
- Events: `token` (content), `title` (generated), `tool_approval` (MCP), `done`, `error`
- Frontend: `useChat()` hook with Streamdown markdown rendering
- Backend: LangGraph ReAct agent with PostgreSQL checkpointing

System prompts: Hierarchical concatenation (org → team → user) prepended to messages.

LLM key resolution: team-level → org-level → environment variable (via Infisical)

**Multimodal Chat (Image & Document Uploads)**: Send images and documents with chat messages
- Images: JPEG, PNG, GIF, WebP (max 10MB per file, 5 files per message)
- Documents: PDF with Claude's native document support and prompt caching
- Two upload modes via `AttachmentPicker`:
  - "Use in this conversation" - inline for immediate analysis
  - "Add to Knowledge Base" - upload to RAG for persistent storage
- Images/docs stored in SeaweedFS with multi-tenant scoping (org → team → user)
- `useMediaUpload()` hook for images, `useDocumentUpload()` hook for RAG docs
- Media library UI at user settings for viewing/deleting uploads
- Org-level configurable limits: `max_media_file_size_mb`, `max_media_storage_mb`
- Backend: `backend/media/` module, API at `/v1/media`
- Frontend: `ImagePreview`, `AttachmentPicker`, `AttachmentPreviewList` components

**Guardrails (Content Filtering)**: AI safety controls for input/output
- Hierarchical configuration: org → team → user (patterns merged, most restrictive action wins)
- Input guardrails: Block/warn/redact user messages matching keywords or regex patterns
- Output guardrails: Block/warn/redact LLM responses matching keywords or regex patterns
- PII detection: Auto-detect email, phone, SSN, credit card, IP addresses
- Actions: `block` (reject message), `warn` (allow but log), `redact` (replace with [REDACTED])
- Test endpoint: `POST /v1/guardrails/test` for dry-run validation
- Org controls: `allow_team_override`, `allow_user_override` to lock down settings
- Backend: `backend/guardrails/` module, API at `/v1/guardrails`
- Frontend: `GuardrailSettings` component with test panel, `guardrailsApi` client

**Conversation Search**: Full-text search across conversation titles and message content
- Uses PostgreSQL pg_trgm extension with GIN indexes for fast trigram similarity search
- Separate `conversation_message` index table (avoids querying LangGraph checkpointer)
- Messages auto-indexed on send (user + assistant messages)
- Search endpoint: `GET /v1/conversations?team_id={id}&search={query}`
- Backfill script for existing conversations: `backend/scripts/backfill_message_index.py`
- Dedicated search UI at `/search` route with real-time debounced search

**RAG (Retrieval Augmented Generation)**: Document-based knowledge for AI responses
- Document upload with automatic processing: parse → chunk → embed → store
- Supports PDF, TXT, MD, DOCX, code files, and more (configurable per org)
- pgvector for semantic similarity search with HNSW indexing
- Multi-tenant scoping: org-level, team-level, or user-level documents
- Hierarchical settings (org → team → user) for chunk_size, similarity_threshold, etc.
- `search_documents` tool auto-available in agent when RAG enabled
- Citations displayed inline with `[[filename]]` markers and `CitationBadge` component
- Backend: `backend/documents/` + `backend/rag_settings/` modules, API at `/v1/documents`, `/v1/rag-settings`
- Frontend: `documentsApi`, `ragSettingsApi`, `AttachmentPicker`, `useDocumentUpload` hook, documents page at `/org/team/:teamId/documents`

**Theme Settings**: Customizable UI theming with OKLch color system
- Predefined themes (github-light, one-dark-pro, etc.) with 30+ color variables
- Custom theme support via JSON color definitions
- Hierarchical configuration: org defaults → team overrides → user preferences
- Light/dark/system mode with per-mode theme selection
- Org controls: `allow_team_customization`, `allow_user_customization`
- Backend: `backend/theme_settings/` module with themes.py (38KB of predefined themes)
- Frontend: `themeSettingsApi`, theme settings components at org/team/user levels

## MCP (Model Context Protocol)

External tool integration via MCP servers. Supports HTTP, SSE, and Streamable HTTP transports.

Scoping (same hierarchy as other resources):
- **Organization-level**: Available to all org members (`team_id=NULL, user_id=NULL`)
- **Team-level**: Available to team members only (`team_id=set, user_id=NULL`)
- **User-level**: Personal servers (`team_id=set, user_id=set`)

Settings hierarchy (org → team → user):
- `mcp_enabled` - Master toggle for MCP tools
- `mcp_tool_approval_required` - Human-in-the-loop approval (default: true)
- `mcp_allow_custom_servers` - Allow adding custom servers (org/team only)
- `mcp_max_servers_per_team/user` - Configurable limits (org only)

Tool approval flow:
1. Agent calls MCP tool → execution pauses (LangGraph interrupt)
2. SSE sends `tool_approval` event with tool details
3. Frontend shows `ToolApprovalCard` inline in chat
4. User approves/rejects → agent resumes or cancels
5. Orphaned tool calls (abandoned approvals) are auto-cleaned on next message

Tool configuration (per hierarchy level):
- `disabled_mcp_servers` - List of server UUIDs to disable
- `disabled_tools` - List of tool names to disable (merged from all levels)

Effective tools endpoint: `GET /v1/mcp/effective-tools` returns all available tools with server info, respecting disabled settings.

Auth secrets stored in Infisical (never exposed in API responses).

## Infrastructure Services

| Service | Port | Purpose | Docs |
|---------|------|---------|------|
| PostgreSQL (app) | 5432 | Main database | - |
| SeaweedFS | 8333 | S3 storage (uploads) | `backend/core/storage.py` |
| Infisical | 8081 | Secrets management | `backend/core/secrets.py` |
| OpenSearch | 9200 | Audit/app logs | `backend/audit/` |
| OpenSearch Dashboards | 5601 | Log visualization | - |
| Langfuse | 3001 | LLM tracing | `backend/agents/tracing.py` |

Infisical secrets paths (auto-managed via `SecretsService`):
- LLM API keys: `/organizations/{org_id}/[teams/{team_id}/]{provider}_api_key`
- MCP auth secrets: `/organizations/{org_id}/[teams/{team_id}/][users/{user_id}/]mcp/mcp_server_{server_id}`

All secrets are entered directly in the UI and automatically stored/retrieved via `backend/core/secrets.py`. Never manually create secrets in Infisical for features that have UI configuration.

OpenSearch indices: `audit-logs-YYYY.MM.DD` (90-day retention), `app-logs-YYYY.MM.DD` (30-day retention)

## Project Structure

```
├── setup.sh                # Full automated setup script
├── setup-local.sh          # Local dev setup (infrastructure only)
├── docker-compose.yml      # Full stack (including backend/frontend containers)
├── docker-compose-local.yml # Infrastructure only (for local dev)
├── backend/
│   ├── src/backend/
│   │   ├── agents/         # LangGraph agent, tools, tracing, context, factory
│   │   ├── mcp/            # MCP server registry, client, tool loading, types
│   │   ├── api/routes/     # REST endpoints (/v1 prefix)
│   │   ├── auth/           # User model, JWT, dependencies, token revocation
│   │   ├── rbac/           # Permissions, role mappings
│   │   ├── organizations/  # Org + OrganizationMember
│   │   ├── teams/          # Team + TeamMember
│   │   ├── conversations/  # Multi-tenant chat history + message index
│   │   ├── documents/      # RAG document upload, parsing, chunking, vector store
│   │   ├── rag_settings/   # RAG configuration (org/team/user hierarchy)
│   │   ├── theme_settings/ # UI theme configuration with predefined themes
│   │   ├── guardrails/     # AI content filtering (input/output, PII detection)
│   │   ├── media/          # Chat media uploads (images, documents)
│   │   ├── memory/         # User memory extraction and storage
│   │   ├── prompts/        # System and template prompts
│   │   ├── audit/          # OpenSearch logging
│   │   └── core/           # Config, DB, security, secrets, cache, HTTP, tasks, UoW, exceptions
│   ├── scripts/            # Setup scripts (setup-infisical.py, backfill_message_index.py, etc.)
│   ├── opensearch/         # Default dashboards config
│   └── alembic/            # Database migrations
└── frontend/               # React 19 + TanStack + Tailwind v4
    └── src/
        ├── routes/         # File-based routing (including /org/team/:teamId/documents)
        ├── components/
        │   ├── ui/         # shadcn/ui base components
        │   ├── chat/       # ChatInput, ChatMessage, ToolApprovalCard, AttachmentPicker, CitationBadge
        │   ├── settings/   # Org/team/user settings panels (RAG, theme, guardrails, MCP)
        │   └── documents/  # DocumentUpload, DocumentList, DocumentViewer
        ├── hooks/          # useChat, useMediaUpload, useDocumentUpload, useIsMobile
        └── lib/
            ├── api/        # Modular API client (agent, auth, orgs, teams, documents, rag-settings, theme-settings, etc.)
            ├── auth.ts     # Token management & auth hooks
            ├── queries.ts  # TanStack Query hooks
            └── workspace.tsx  # Org/team context
```

## Development Commands

```bash
# Backend (from backend/)
uv run ruff check .                        # Lint check (MUST pass before commit)
uv run ruff check . --fix                  # Auto-fix lint issues
uv run ruff format .                       # Format code
uv run ruff format --check .               # Check formatting without changes
uv run mypy src/backend                    # Type check (MUST pass before commit)
uv run pytest                              # Run tests
uv run alembic revision --autogenerate -m "msg"  # Create migration

# Frontend (from frontend/)
npm run build                              # TypeScript + Vite build
npm run typecheck                          # TypeScript type check only (MUST pass)
npm run lint                               # ESLint
npm run format                             # Format code with Prettier
npm run format:check                       # Check formatting without changes
npx shadcn@latest add <name>               # Add UI component
```

## Pre-Commit Hooks (Automated)

**Pre-commit hooks run automatically on every `git commit`**, catching issues before they reach CI.

### One-Time Setup (per developer)
```bash
cd backend && uv run pre-commit install
```

### What Runs Automatically

| Hook | Backend | Frontend | Auto-fix |
|------|---------|----------|----------|
| Ruff lint | ✅ | - | ✅ |
| Ruff format | ✅ | - | ✅ |
| MyPy | ✅ | - | - |
| ESLint | - | ✅ | - |
| TypeScript | - | ✅ | - |
| Prettier | - | ✅ | ✅ |
| Gitleaks | ✅ | ✅ | - |

### Usage
```bash
# Normal commit - hooks run automatically
git commit -m "your message"

# Skip specific slow hooks (e.g., mypy)
SKIP=mypy git commit -m "quick fix"

# Skip all hooks (emergency only)
git commit --no-verify -m "hotfix"

# Run manually on all files
cd backend && uv run pre-commit run --all-files
```

### CI Alignment
Pre-commit hooks match GitHub Actions CI exactly:
- Pre-commit auto-fixes issues before commit
- CI validates in check-only mode
- If pre-commit passes locally, CI will pass

## Critical Integration Points

1. CORS: `FRONTEND_URL` auto-added to allowed origins. Both must match.

2. Token format: OAuth2 expects form-encoded `username` (email) + `password`, not JSON.

3. Workspace context: `useWorkspace().teams` only includes teams user is member of. For admin views needing all teams, use `teamsApi.getTeams(orgId)` directly.

4. Conversation scoping: New conversations use `org_id` + `team_id`. Queries handle both patterns.

5. SSE proxy: Vite dev proxy disables buffering for `text/event-stream` content type.

6. Platform admin: `User.is_platform_admin` bypasses all RBAC. Use sparingly.

## Environment Variables

Backend essentials (`backend/.env`):
```
POSTGRES_SERVER, POSTGRES_PORT, POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB
SECRET_KEY                    # JWT signing
FRONTEND_URL                  # CORS + redirects
ANTHROPIC_API_KEY             # LLM fallback
INFISICAL_URL, INFISICAL_CLIENT_ID, INFISICAL_CLIENT_SECRET, INFISICAL_PROJECT_ID
LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY, LANGFUSE_BASE_URL
```

Frontend (`frontend/.env`):
```
VITE_API_URL=http://localhost:8000
VITE_PORT=5173
```

See `backend/.env.example` for full list including OpenSearch, Langfuse infrastructure passwords.

## Adding Features

New API route: Create in `backend/api/routes/`, add to `api/main.py`, use typed deps (`SessionDep`, `CurrentUser`, `OrgContextDep`)

New frontend page: Add file to `frontend/src/routes/` (auto-generates to routeTree)

New database model: Add SQLModel class, import in `alembic/env.py`, run migrations

New agent tool: Add `@tool` function in `backend/agents/tools.py`

New MCP server: Add via UI at org/team/user settings pages, or via API (`/v1/organizations/{id}/mcp-servers`, `/v1/organizations/{id}/teams/{id}/mcp-servers`, `/v1/mcp-servers/me`)

## Code Style & Linting Standards

Both backend and frontend follow self-documenting code principles. Keep docstrings (generates API docs), "why" comments for non-obvious decisions. Avoid section separators, "what" comments that repeat code.

### Backend Python Standards (Enforced by Ruff)

**MUST follow these patterns** - CI will fail otherwise:

1. **Imports at top of file** (PLC0415): Never use inline/lazy imports inside functions. Move all imports to the module top.
   ```python
   # ✅ Correct
   from backend.auth.models import User

   def get_user(): ...

   # ❌ Wrong - will fail CI
   def get_user():
       from backend.auth.models import User  # PLC0415 error
   ```

2. **Exception chaining** (B904): Always chain exceptions with `from err` or `from None`
   ```python
   # ✅ Correct
   except ValueError as e:
       raise HTTPException(status_code=400, detail=str(e)) from e

   # ❌ Wrong
   except ValueError as e:
       raise HTTPException(status_code=400, detail=str(e))  # B904 error
   ```

3. **Return in else after try-except** (TRY300): Move return statements to `else:` block
   ```python
   # ✅ Correct
   try:
       result = risky_operation()
   except SomeError:
       return None
   else:
       return result

   # ❌ Wrong
   try:
       result = risky_operation()
   except SomeError:
       return None
   return result  # TRY300 error
   ```

4. **No magic numbers** (PLR2004): Use named constants for numeric literals
   ```python
   # ✅ Correct
   MAX_RETRY_ATTEMPTS = 3
   if attempts > MAX_RETRY_ATTEMPTS: ...

   # ❌ Wrong
   if attempts > 3: ...  # PLR2004 error
   ```

5. **Timezone-aware datetime** (DTZ): Always use `datetime.now(UTC)` not `datetime.now()`
   ```python
   # ✅ Correct
   from datetime import UTC, datetime
   now = datetime.now(UTC)

   # ❌ Wrong
   now = datetime.now()  # DTZ error
   ```

6. **ClassVar for mutable class attributes** (RUF012):
   ```python
   # ✅ Correct
   from typing import ClassVar
   class Parser:
       supported_types: ClassVar[list[str]] = ["pdf", "txt"]

   # ❌ Wrong
   class Parser:
       supported_types: list[str] = ["pdf", "txt"]  # RUF012 error
   ```

### Allowed Patterns (Per-file ignores configured)

These patterns are intentionally allowed in specific contexts:
- **FastAPI routes**: `Query()`, `Depends()` in default args (B008), unused `current_user`/`request` params (ARG001)
- **Singleton modules**: Global statements for singleton patterns (PLW0603) in `agents/`, `audit/`, `memory/`, `core/secrets.py`
- **Circular import avoidance**: Inline imports (PLC0415) allowed in `auth/token_revocation.py`
- **Complex handlers**: High branch/statement counts (PLR0912/PLR0915) in routes, agents, settings resolution
- **Tests**: Magic values, assert statements, unused fixtures

See `backend/pyproject.toml` `[tool.ruff.lint.per-file-ignores]` for full list.

### Backend Mypy Type Checking (Enforced by CI)

**MUST pass mypy** - CI runs `uv run mypy src/backend`:

1. **SQLModel/SQLAlchemy column methods**: Use `== None` with noqa comment, not `.is_(None)`
   ```python
   # ✅ Correct
   statement.where(Model.deleted_at == None)  # noqa: E711

   # ❌ Wrong - mypy error: "datetime" has no attribute "is_"
   statement.where(Model.deleted_at.is_(None))
   ```

2. **SQLModel `.in_()` and `.desc()` methods**: Add `type: ignore[attr-defined]`
   ```python
   # ✅ Correct
   Model.id.in_(id_list),  # type: ignore[attr-defined]
   Model.created_at.desc()  # type: ignore[attr-defined]

   # ❌ Wrong - mypy error: "UUID" has no attribute "in_"
   Model.id.in_(id_list)
   ```

3. **Generic type parameters**: Always specify type parameters for generics
   ```python
   # ✅ Correct
   def _json_column() -> "Column[list[str]]": ...

   # ❌ Wrong - mypy error: Missing type parameters for generic type
   def _json_column() -> Column: ...
   ```

4. **Don't add unused `type: ignore` comments**: Use correct error codes
   ```python
   # ✅ Correct error code
   # type: ignore[attr-defined]  # for missing attributes

   # ❌ Wrong - causes "Unused type: ignore" error
   # type: ignore[union-attr]  # when actual error is attr-defined
   ```

### Frontend TypeScript Standards (Enforced by CI)

**MUST pass typecheck** - CI runs `npm run typecheck`:

1. **Export all types used across modules**: If a type is used in another file, export it from the barrel file
   ```typescript
   // ✅ In lib/api/index.ts - export types used elsewhere
   export { type MessageMediaInfo } from "./agent";

   // ❌ Wrong - importing non-exported type causes TS2305
   import { MessageMediaInfo } from "@/lib/api";  // Error if not exported
   ```

2. **Check barrel exports when adding new types**: When adding types to a module, add to `index.ts` if used externally
