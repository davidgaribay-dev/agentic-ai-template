# CLAUDE.md

## Project Overview

FastAPI backend for a multi-tenant AI agent platform. Features LangGraph agents with PostgreSQL checkpointing, hierarchical RBAC (Organizations → Teams), multi-provider LLMs (Anthropic/OpenAI/Google), and enterprise features (audit logging, secrets management, rate limiting).

## Commands

```bash
uv sync                                    # Install dependencies
uv run uvicorn backend.main:app --reload   # Dev server (port 8000)
uv run alembic upgrade head                # Run migrations
uv run alembic revision --autogenerate -m "msg"  # Create migration
uv run pytest                              # Run tests
```

## Architecture

Stack: FastAPI, SQLModel (SQLAlchemy + Pydantic), LangGraph, PostgreSQL, Alembic, structlog, JWT + bcrypt

```
src/backend/
├── main.py              # FastAPI app with lifespan management
├── api/
│   ├── deps.py          # Shared dependencies
│   └── routes/          # REST endpoints (/v1 prefix)
├── agents/
│   ├── base.py          # LangGraph agent with PostgreSQL checkpointing
│   ├── react_agent.py   # ReAct agent with tools
│   ├── llm.py           # Multi-provider LLM factory
│   ├── tools.py         # @tool decorated functions
│   └── tracing.py       # Langfuse observability
├── auth/
│   ├── models.py        # User model + schemas
│   ├── crud.py          # Timing-safe authentication
│   └── deps.py          # CurrentUser, SessionDep dependencies
├── rbac/
│   ├── permissions.py   # OrgPermission, TeamPermission enums + role mappings
│   └── deps.py          # OrgContextDep, TeamContextDep, require_*_permission
├── organizations/       # Org model + CRUD
├── teams/               # Team model + CRUD (TeamMember → OrganizationMember FK)
├── conversations/       # Soft-delete, multi-tenant scoped
├── prompts/             # Hierarchical system prompts (org/team/user)
├── core/
│   ├── config.py        # Pydantic settings with computed fields
│   ├── db.py            # Engine, session, pagination utilities
│   ├── security.py      # JWT tokens, password hashing
│   ├── secrets.py       # Infisical integration
│   └── logging.py       # structlog configuration
└── scripts/             # Pre-start, initial data
```

## Key Patterns

Dependencies (use these typed aliases):
```python
SessionDep = Annotated[Session, Depends(get_db)]
CurrentUser = Annotated[User, Depends(get_current_user)]
OrgContextDep = Annotated[OrganizationContext, Depends(get_org_context)]
TeamContextDep = Annotated[TeamContext, Depends(get_team_context)]
```

RBAC Route Protection:
```python
@router.get("/", dependencies=[Depends(require_org_permission(OrgPermission.MEMBERS_READ))])
def list_members(org_context: OrgContextDep): ...
```

CRUD Pattern: All domain modules follow `models.py` + `crud.py` structure. See `organizations/crud.py` for reference.

## Critical Gotchas

1. TeamMember → OrganizationMember FK: TeamMember links to `org_member_id`, NOT user directly. User must be org member before joining teams.

2. Conversation dual scoping: New conversations use `org_id` + `team_id`. Legacy has `user_id` (deprecated). Queries must handle both.

3. System prompt concatenation: Multiple prompts can be active per scope. Agent prepends concatenated content (org + team + user) to message list.

4. LLM provider context variables: Uses `contextvars.ContextVar` to pass org/team to chat_node. Requires manual token cleanup.

5. OAuth2 username field: Login uses `OAuth2PasswordRequestForm` which expects "username" - mapped to email in handler.

6. Platform admin bypass: `User.is_platform_admin` skips all RBAC checks. Use sparingly.

7. Checkpointer initialization: `AsyncPostgresSaver` needs explicit `setup()` and connection pool management. See global singleton in `agents/base.py`.

## Multi-Tenant RBAC

Role Hierarchy:
- OrgRole: OWNER > ADMIN > MEMBER
- TeamRole: ADMIN > MEMBER > VIEWER

Permission Mapping (see `rbac/permissions.py`):
- Owner: All permissions including org deletion + ownership transfer
- Admin: Management (org update, members, teams, invitations) - cannot delete org
- Member: Minimal (`teams:create`, `teams:read`, `prompts:read`) - cannot view org details or member list

Important: Members use `GET /organizations/{id}/my-membership` for their role (doesn't require `MEMBERS_READ`).

## Agent System

Multi-provider LLM (`agents/llm.py`):
- `get_chat_model_with_context(org_id, team_id, provider)` - uses Infisical + env fallback
- API key resolution: team-level → org-level → environment

Checkpointing: Thread ID = conversation_id. LangGraph stores history in PostgreSQL via `AsyncPostgresSaver`.

Tools: Add `@tool` functions to `agents/tools.py` - automatically available to ReAct agent.

Tracing: Langfuse integration via `build_langfuse_config()` - include in all agent calls.

## Adding Features

New Route:
1. Create route file in `api/routes/`
2. Add router to `api/main.py`
3. Use typed dependencies (`SessionDep`, `CurrentUser`, `OrgContextDep`)

New Model:
1. Add SQLModel class in appropriate module's `models.py`
2. Import in `alembic/env.py` for autogenerate detection
3. Run `alembic revision --autogenerate -m "description"` then `alembic upgrade head`

New Agent Tool:
Add `@tool` decorated function in `agents/tools.py`

## Environment

Key variables (see `core/config.py` for full list):
```
POSTGRES_*                  # Database connection
SECRET_KEY                  # JWT signing (auto-generated if missing)
ANTHROPIC_API_KEY           # LLM providers
OPENAI_API_KEY
GOOGLE_API_KEY
DEFAULT_LLM_PROVIDER        # anthropic|openai|google
LANGFUSE_*                  # Tracing
INFISICAL_*                 # Secrets management
```

## Rate Limits

Configured in `core/rate_limit.py`:
- Default: 100/min (disabled in local)
- Auth: 5/min (brute force protection)
- Agent: 20/min

## API Reference

- OpenAPI docs: `/v1/docs`
- Auth: `/v1/auth/*` (login, signup, refresh, forgot-password)
- Agent: `/v1/agent/chat` (POST, SSE streaming)
- Conversations: `/v1/conversations/*` (CRUD + star/soft-delete)
- Organizations: `/v1/organizations/*` (CRUD + members)
- Teams: `/v1/organizations/{id}/teams/*`
- Prompts: org/team/user scopes with separate routers

## Code Style

Keep: Module/function docstrings (generates OpenAPI docs), "why" comments for non-obvious decisions

Avoid: Section separators, "what" comments that repeat code, inline value explanations
