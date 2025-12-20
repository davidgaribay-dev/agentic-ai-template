# CLAUDE.md

## Project Overview

Full-stack AI agent platform with FastAPI + LangGraph backend and React 19 + TanStack frontend. Features JWT authentication, multi-tenant architecture (Organizations → Teams → Users), SSE streaming chat, and enterprise integrations (Infisical secrets, OpenSearch audit logging, Langfuse LLM tracing).

See also: [backend/CLAUDE.md](backend/CLAUDE.md) for API patterns, [frontend/CLAUDE.md](frontend/CLAUDE.md) for UI patterns.

## Quick Start

```bash
# Start infrastructure services
docker compose up -d

# Terminal 1 - Backend
cd backend && uv sync && uv run alembic upgrade head
uv run uvicorn backend.main:app --reload  # port 8000

# Terminal 2 - Frontend
cd frontend && npm install && npm run dev  # port 5173

# First-time Infisical setup
cd backend && ./scripts/setup_infisical.sh
```

Services: Frontend (5173), Backend API (8000), API Docs (8000/v1/docs), Infisical (8081), OpenSearch Dashboards (5601), Langfuse (3001)

Default superuser: `admin@example.com` / `changethis` (configure in `backend/.env`)

## Multi-Tenant Architecture

```
Organization (tenant boundary)
├── OrganizationMember (user ←→ org with OrgRole: owner/admin/member)
├── Team (sub-group within org)
│   └── TeamMember (org_member ←→ team with TeamRole: admin/member/viewer)
└── Resources (conversations, prompts, API keys) scoped to org + team
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
- Events: `token` (content), `title` (generated), `done`, `error`
- Frontend: `useChat()` hook with Streamdown markdown rendering
- Backend: LangGraph ReAct agent with PostgreSQL checkpointing

System prompts: Hierarchical concatenation (org → team → user) prepended to messages.

LLM key resolution: team-level → org-level → environment variable (via Infisical)

## Infrastructure Services

| Service | Port | Purpose | Docs |
|---------|------|---------|------|
| PostgreSQL (app) | 5432 | Main database | - |
| SeaweedFS | 8333 | S3 storage (uploads) | `backend/core/storage.py` |
| Infisical | 8081 | Secrets management | `backend/core/secrets.py` |
| OpenSearch | 9200 | Audit/app logs | `backend/audit/` |
| OpenSearch Dashboards | 5601 | Log visualization | - |
| Langfuse | 3001 | LLM tracing | `backend/agents/tracing.py` |

Infisical secrets path: `/organizations/{org_id}/[teams/{team_id}/]{provider}_api_key`

OpenSearch indices: `audit-logs-YYYY.MM.DD` (90-day retention), `app-logs-YYYY.MM.DD` (30-day retention)

## Project Structure

```
├── docker-compose.yml      # All infrastructure services
├── backend/                # FastAPI + LangGraph + SQLModel
│   ├── src/backend/
│   │   ├── agents/         # LangGraph agent, tools, tracing
│   │   ├── api/routes/     # REST endpoints (/v1 prefix)
│   │   ├── auth/           # User model, JWT, dependencies
│   │   ├── rbac/           # Permissions, role mappings
│   │   ├── organizations/  # Org + OrganizationMember
│   │   ├── teams/          # Team + TeamMember
│   │   ├── conversations/  # Multi-tenant chat history
│   │   ├── audit/          # OpenSearch logging
│   │   └── core/           # Config, DB, security, secrets
│   └── alembic/            # Database migrations
├── frontend/               # React 19 + TanStack + Tailwind v4
│   └── src/
│       ├── routes/         # File-based routing
│       ├── components/     # UI (shadcn/ui) + chat
│       ├── hooks/          # useChat SSE streaming
│       └── lib/            # API client, auth, workspace context
└── opensearch/             # Default dashboards config
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

## Code Style

Both backend and frontend follow self-documenting code principles. Keep docstrings (generates API docs), "why" comments for non-obvious decisions. Avoid section separators, "what" comments that repeat code.
