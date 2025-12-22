# CLAUDE.md

## Project Overview

FastAPI backend for a multi-tenant AI agent platform. Features LangGraph agents with PostgreSQL checkpointing, hierarchical RBAC (Organizations → Teams), multi-provider LLMs (Anthropic/OpenAI/Google), MCP (Model Context Protocol) tool integration, and enterprise features (audit logging, secrets management, rate limiting).

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
├── memory/              # Long-term memory with semantic search
├── mcp/                 # MCP server registry, client, tool loading
├── settings/            # Hierarchical settings (org/team/user)
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

## MCP (Model Context Protocol)

External tool integration via MCP servers. Located in `mcp/` module.

Architecture:
```
mcp/
├── models.py    # MCPServer SQLModel, transport/auth enums, schemas
├── service.py   # CRUD operations, effective server resolution, limit checks
├── client.py    # Tool loading via langchain-mcp-adapters, auth handling
```

Scoping levels:
- **Organization**: `team_id=NULL, user_id=NULL` - all org members can use
- **Team**: `team_id=set, user_id=NULL` - team members only
- **User**: `team_id=set, user_id=set` - personal servers

Key functions:
- `get_effective_mcp_servers(session, org_id, team_id, user_id)` - returns all servers user can access
- `get_mcp_tools_for_context(session, org_id, team_id, user_id)` - loads tools from all effective servers
- `test_mcp_server_connection(url, transport, auth_config)` - connection testing

Transport types: `HTTP`, `SSE`, `STREAMABLE_HTTP`

Auth types: `NONE`, `BEARER`, `API_KEY` (with custom header name)

Tool approval (human-in-the-loop):
- Enabled via `mcp_tool_approval_required` setting (default: true)
- Uses `create_agent_graph_with_tool_approval()` instead of standard graph
- `tool_approval_node` pauses execution via LangGraph `interrupt()`, sends `tool_approval` SSE event
- Agent resumes after user approval or cancels on rejection

Orphaned tool call handling:
- When user abandons approval (sends new message instead), orphaned `tool_use` blocks remain
- Anthropic API requires every `tool_use` to have corresponding `tool_result`
- `cleanup_orphans` node runs at graph entry, injects rejection `ToolMessage` for orphaned calls
- `_fix_orphaned_tool_calls_in_messages()` ensures `tool_result` immediately follows `tool_use`
- Checkpoint state also checked/fixed before streaming to handle edge cases

Tool configuration (new settings fields):
- `disabled_mcp_servers` - List of server UUIDs to disable (merged from all hierarchy levels)
- `disabled_tools` - List of tool names to disable (merged from all levels)
- `_get_disabled_tools_config()` fetches merged disabled lists for filtering

Effective tools endpoint: `GET /v1/mcp/effective-tools` returns `MCPToolsList` with all available tools, server info, and errors.

Settings in hierarchy (org → team → user):
- `mcp_enabled` - master toggle
- `mcp_tool_approval_required` - require human approval for tool calls
- `mcp_allow_custom_servers` - allow adding servers (org/team only)
- `mcp_max_servers_per_team/user` - limits (org only)
- `disabled_mcp_servers`, `disabled_tools` - granular disable (union of all levels)

Auth secrets: Stored in Infisical at `/organizations/{org_id}/[teams/{team_id}/][users/{user_id}/]mcp/mcp_server_{server_id}`

## Memory System

Long-term memory across conversations using LangGraph's PostgresStore with semantic search.

Architecture:
```
memory/
├── store.py       # AsyncPostgresStore with OpenAI embeddings
├── service.py     # CRUD operations (store, search, list, delete)
├── extraction.py  # LLM-based memory extraction from conversations
```

Key concepts:
- **Namespace isolation**: `("memories", org_id, team_id, user_id)` - complete tenant separation
- **Semantic search**: OpenAI embeddings (text-embedding-3-small, 1536 dims) for relevance
- **Memory types**: preference, fact, entity, relationship, summary
- **Automatic extraction**: Background task after each chat response extracts memories via LLM

Memory flow:
1. User sends message → Agent responds
2. Background task calls `extract_and_store_memories()` with conversation
3. LLM analyzes for memorable information (preferences, facts, entities)
4. Memories stored in PostgresStore with embeddings
5. On next message, `chat_node` searches relevant memories and injects into context

Settings hierarchy (can disable at any level):
- Organization → Team → User
- `memory_enabled` field in `*_settings` tables
- Check via `get_effective_settings()` before extraction

API routes (`/v1/memory/*`):
- `GET /users/me/memories` - List with org/team scoping
- `DELETE /users/me/memories/{id}` - Delete single memory
- `DELETE /users/me/memories` - Clear all memories

Environment: Requires `OPENAI_API_KEY` for embeddings. Memory store optional - app works without it.

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
- Memory: `/v1/memory/*` (list, delete, clear)
- Settings: `/v1/settings/*` (effective settings with hierarchy)
- MCP: `/v1/organizations/{id}/mcp-servers/*`, `/v1/organizations/{id}/teams/{id}/mcp-servers/*`, `/v1/mcp-servers/me/*`

## Code Style

Keep: Module/function docstrings (generates OpenAPI docs), "why" comments for non-obvious decisions

Avoid: Section separators, "what" comments that repeat code, inline value explanations
