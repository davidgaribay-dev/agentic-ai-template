# CLAUDE.md

## Project Overview

Full-stack AI agent platform with FastAPI + LangGraph backend and React 19 + TanStack frontend. Features JWT authentication, multi-tenant architecture (Organizations → Teams → Users), SSE streaming chat, MCP (Model Context Protocol) tool integration, and enterprise integrations (Infisical secrets, OpenSearch audit logging, Langfuse LLM tracing).

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

Key API groups: See `backend/api/main.py` for all routers. Frontend client at `frontend/src/lib/api.ts`.

## Chat/Agent System

SSE streaming: `POST /v1/agent/chat` with `stream: true`
- Events: `token` (content), `title` (generated), `tool_approval` (MCP), `done`, `error`
- Frontend: `useChat()` hook with Streamdown markdown rendering
- Backend: LangGraph ReAct agent with PostgreSQL checkpointing

System prompts: Hierarchical concatenation (org → team → user) prepended to messages.

LLM key resolution: team-level → org-level → environment variable (via Infisical)

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
1. Agent calls MCP tool → execution pauses
2. SSE sends `tool_approval` event with tool details
3. Frontend shows `ToolApprovalCard` inline in chat
4. User approves/rejects → agent resumes or cancels

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
│   │   ├── agents/         # LangGraph agent, tools, tracing
│   │   ├── mcp/            # MCP server registry, client, tool loading
│   │   ├── api/routes/     # REST endpoints (/v1 prefix)
│   │   ├── auth/           # User model, JWT, dependencies
│   │   ├── rbac/           # Permissions, role mappings
│   │   ├── organizations/  # Org + OrganizationMember
│   │   ├── teams/          # Team + TeamMember
│   │   ├── conversations/  # Multi-tenant chat history
│   │   ├── audit/          # OpenSearch logging
│   │   └── core/           # Config, DB, security, secrets
│   ├── scripts/            # Setup scripts (setup-infisical.py, setup-langfuse.py, etc.)
│   ├── opensearch/         # Default dashboards config
│   └── alembic/            # Database migrations
└── frontend/               # React 19 + TanStack + Tailwind v4
    └── src/
        ├── routes/         # File-based routing
        ├── components/     # UI (shadcn/ui) + chat
        ├── hooks/          # useChat SSE streaming
        └── lib/            # API client, auth, workspace context
```

## Development Commands

```bash
# Backend (from backend/)
uv run pytest                              # Run tests
uv run alembic revision --autogenerate -m "msg"  # Create migration

# Frontend (from frontend/)
npm run build                              # TypeScript + Vite build
npm run lint                               # ESLint
npx shadcn@latest add <name>               # Add UI component
```

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

## Code Style

Both backend and frontend follow self-documenting code principles. Keep docstrings (generates API docs), "why" comments for non-obvious decisions. Avoid section separators, "what" comments that repeat code.
