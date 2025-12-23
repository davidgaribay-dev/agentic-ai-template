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
│   ├── context.py       # Agent execution context (org/team/user isolation)
│   ├── factory.py       # Agent builder with dependency injection
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
├── conversations/       # Soft-delete, multi-tenant scoped + message index
├── prompts/             # Hierarchical system prompts (org/team/user)
├── memory/              # Long-term memory with semantic search
├── mcp/                 # MCP server registry, client, tool loading, types
├── settings/            # Hierarchical settings (org/team/user)
├── core/
│   ├── config.py        # Pydantic settings with computed fields
│   ├── db.py            # Engine, session, pagination utilities
│   ├── security.py      # JWT tokens, password hashing
│   ├── secrets.py       # Infisical integration
│   ├── logging.py       # structlog configuration
│   ├── cache.py         # Redis/in-memory caching utilities
│   ├── http.py          # HTTP client with retries and circuit breaker
│   ├── tasks.py         # Background task management
│   ├── uow.py           # Unit of Work pattern for transactions
│   └── exceptions.py    # Domain-specific exception hierarchy
└── scripts/             # Pre-start, initial data, backfill scripts
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

## Core Utilities

Best practice infrastructure modules in `core/`:

**Exception Hierarchy** ([exceptions.py](src/backend/core/exceptions.py)):
```python
# All exceptions inherit from AppException with consistent structure
class AppException(Exception):
    message: str          # Human-readable
    error_code: str       # Machine-readable (e.g., "AUTH_FAILED")
    status_code: int      # HTTP status code
    details: dict         # Additional context

# Specific exceptions
AuthenticationError(message)  # 401
AuthorizationError(message)   # 403
ResourceNotFoundError(resource, identifier?)  # 404
ResourceExistsError(resource, field?)  # 409
ValidationError(field, reason)  # 422
ExternalServiceError(service, reason)  # 503
TimeoutError(operation, timeout_seconds)  # 504
AgentError, LLMError, CheckpointerError  # 500
```

**Caching** ([cache.py](src/backend/core/cache.py)):
```python
# Request-scoped cache (cleared after each request)
@request_cached(lambda org_id, team_id: f"settings:{org_id}:{team_id}")
async def get_effective_settings(org_id, team_id):
    ...  # Expensive DB lookup cached within request

# TTL cache (time-based expiration)
ttl_cache = TTLCache[str, User](default_ttl=timedelta(minutes=5))
ttl_cache.set("user:123", user)
user = ttl_cache.get("user:123")  # Returns None if expired
```

**HTTP Client** ([http.py](src/backend/core/http.py)):
```python
# Pre-configured clients with timeouts
async with create_http_client() as client:
    response = await client.get("https://api.example.com")

# Explicit timeout and error handling
response = await fetch_with_timeout(
    url="https://api.example.com/data",
    timeout_seconds=10.0,
    service_name="External API"
)
# Raises: TimeoutError, ExternalServiceError

# Timeout profiles
DEFAULT_TIMEOUT     # connect=5s, read=30s
LLM_TIMEOUT         # connect=5s, read=120s (for streaming)
HEALTH_CHECK_TIMEOUT  # connect=2s, read=5s
```

**Unit of Work** ([uow.py](src/backend/core/uow.py)):
```python
# Atomic transactions with auto-rollback on error
with atomic(session) as uow:
    org = create_organization(...)
    uow.session.add(org)
    uow.flush()  # Get auto-generated ID
    create_default_team(org.id, session=uow.session)
    # Auto-commits on success, rolls back on exception
```

**Agent Context** ([agents/context.py](src/backend/agents/context.py)):
```python
# Safe scoping of org/team/user context for LLM calls
with llm_context(org_id=str(org.id), team_id=str(team.id)):
    response = await agent.invoke(...)
# Context auto-cleaned up, prevents bleeding between requests
```

**Agent Factory** ([agents/factory.py](src/backend/agents/factory.py)):
```python
# Per-request agent instances (avoids global state)
config = AgentConfig(
    org_id=str(org.id),
    team_id=str(team.id),
    user_id=str(user.id),
    thread_id=conversation_id,
    max_steps=25,
    include_mcp_tools=True,
)
agent = await create_agent(config)
response = await agent.invoke(message)
```

**MCP Types** ([mcp/types.py](src/backend/mcp/types.py)):
```python
# Comprehensive type definitions for MCP integration
TransportType = Literal["HTTP", "SSE", "STREAMABLE_HTTP"]
AuthType = Literal["NONE", "BEARER", "API_KEY"]

@dataclass
class MCPToolInfo:
    name: str
    description: str
    server_name: str
    server_id: str
```

Usage patterns:
- Always raise domain-specific exceptions (never raw `ValueError`, `KeyError`, etc.)
- Use `@request_cached` for expensive lookups called multiple times per request
- Use `atomic()` for multi-step database operations that must succeed/fail together
- Create agents per-request via factory, never reuse agent instances
- Wrap external API calls with `fetch_with_timeout()` for consistent error handling

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

## Conversation Search

Full-text search across conversation titles and message content using PostgreSQL trigram similarity.

Architecture:
```
conversations/
├── models.py     # Conversation + ConversationMessage (separate index table)
├── crud.py       # search_conversations_by_team() with GIN index queries
```

Key features:
- **Separate message index**: `conversation_message` table decouples search from LangGraph checkpointer
- **PostgreSQL pg_trgm**: GIN index on message content for fast trigram similarity search
- **Auto-indexing**: Messages indexed on send (both user and assistant messages)
- **Multi-tenant scoped**: Searches within team boundaries, respects soft-deletes
- **Composite indexes**: Team + user + created_at DESC for efficient filtering and sorting

Database schema:
```sql
CREATE TABLE conversation_message (
  id UUID PRIMARY KEY,
  conversation_id UUID REFERENCES conversation(id) ON DELETE CASCADE,
  role VARCHAR NOT NULL,       -- 'user' or 'assistant'
  content TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL,
  organization_id UUID,
  team_id UUID,
  created_by_id UUID
);

-- GIN index for full-text search
CREATE INDEX idx_conversation_message_content_gin
  ON conversation_message USING gin (content gin_trgm_ops);

-- Composite index for multi-tenant filtering
CREATE INDEX idx_conversation_message_team_user
  ON conversation_message (team_id, created_by_id, created_at DESC);
```

Query pattern:
```python
# Search both title and message content
search_conversations_by_team(
    session=session,
    team_id=team_id,
    user_id=user_id,
    search_query="what did I ask about API keys",
    skip=0,
    limit=100
)
# Returns: (conversations, total_count)
# Ordered by: starred first, then most recently updated
```

Backfill script for existing conversations: `scripts/backfill_message_index.py`
- Extracts messages from LangGraph checkpointer
- Populates `conversation_message` table
- Skips already-indexed conversations
- Supports `--dry-run` flag for testing

API endpoints:
- `GET /v1/conversations?team_id={id}&search={query}` - search with pagination
- Auto-falls back to title-only search if no message index exists

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

## Code Quality & Development Tools

All tooling configuration is in [pyproject.toml](pyproject.toml).

### Quick Commands

```bash
# Install all dev tools
uv sync --all-extras --dev

# Format and lint (auto-fix)
uv run ruff check . --fix
uv run ruff format .

# Type check
uv run mypy src/backend

# Security scan
uv run bandit -r src/backend

# Run tests with coverage
uv run pytest --cov

# Install pre-commit hooks (one-time)
uv run pre-commit install

# Run all pre-commit checks
uv run pre-commit run --all-files
```

### Tools Stack

| Tool | Purpose | Config Location |
|------|---------|-----------------|
| **Ruff** | Linting + Formatting (replaces Flake8, Black, isort) | `[tool.ruff]` |
| **MyPy** | Type checking (strict mode) | `[tool.mypy]` |
| **Bandit** | Security vulnerability scanning | CLI only |
| **Pytest** | Testing with coverage | `[tool.pytest.ini_options]` |
| **Pre-commit** | Git hooks for automated checks | [.pre-commit-config.yaml](../.pre-commit-config.yaml) |
| **Gitleaks** | Secret detection | [.gitleaks.toml](../.gitleaks.toml) |

### Ruff Configuration

**800+ rules enabled** across:
- E/W (pycodestyle), F (pyflakes), I (isort), N (naming)
- B (bugbear), PL (pylint), TRY (exception handling)
- ARG (unused args), PTH (use pathlib), ERA (commented code)
- DTZ (datetime), RET (return), SIM (simplify)

**Key ignores**:
- `E501` - Line length (formatter handles it)
- `PLR0913` - Too many function arguments
- `TRY003/EM101/EM102` - Exception message patterns

**Per-file ignores** (see `pyproject.toml` for full list):
| Pattern | Ignores | Reason |
|---------|---------|--------|
| `tests/**/*.py` | ARG, PLR2004, S101 | Fixtures, magic values, assert |
| `scripts/**/*.py` | ERA001, PLR0912/0915, PTH, TRY401 | Complex scripts |
| `src/backend/api/routes/*.py` | ARG001, B008, PLR0912/0915 | FastAPI patterns |
| `src/backend/agents/*.py` | PLW0603, PLR0912/0915 | Singletons, complex logic |
| `src/backend/audit/*.py` | PLR0912, PLW0602/0603 | Query building, singletons |
| `src/backend/memory/*.py` | PLR0912/0915, PLW0602/0603 | Extraction, singletons |
| `src/backend/core/secrets.py` | PLW0603 | Singleton pattern |
| `src/backend/mcp/client.py` | ARG001, PLR0912/0915, PLW0602 | Future args, complexity |
| `**/settings/service.py` | PLR0911/0912/0915 | Hierarchy resolution |

### MyPy Configuration

**Strict mode** with:
- Full type annotation requirements
- No implicit Optional
- Warn on unused type ignores
- Pydantic plugin integration

**Ignored external libraries** (missing stubs):
- langchain, langgraph, langmem, opensearch, infisicalsdk
- passlib, emails, slowapi, sse_starlette, langfuse

### Pre-commit Hooks

Automatically run before every commit:
- ✅ Trailing whitespace, EOF fixes
- ✅ YAML/JSON/TOML validation
- ✅ Large file detection
- ✅ Private key detection
- ✅ **Gitleaks** - Secret scanning
- ✅ **Ruff** - Linting and formatting
- ✅ **MyPy** - Type checking

### CI/CD

GitHub Actions workflow: [.github/workflows/backend-ci.yml](../.github/workflows/backend-ci.yml)

Jobs:
1. **Lint & Type Check** - Ruff + MyPy
2. **Security Scan** - Gitleaks + Bandit
3. **Build Check** - Package build verification

### VS Code Integration

Install recommended extensions (see [.vscode/extensions.json](../.vscode/extensions.json)):
- Ruff (official extension)
- MyPy Type Checker
- Python

Settings in [.vscode/settings.json](../.vscode/settings.json):
- Auto-format on save (Ruff)
- Auto-fix on save (Ruff)
- Import organization (Ruff)

Run tasks from Command Palette (`Cmd+Shift+P` → Tasks: Run Task):
- Backend: Lint & Format
- Backend: Type Check
- Backend: Run Tests
- Backend: Security Scan

### Code Style

Keep: Module/function docstrings (generates OpenAPI docs), "why" comments for non-obvious decisions

Avoid: Section separators, "what" comments that repeat code, inline value explanations

### Critical Coding Standards (CI Enforced)

**MUST follow these patterns** - CI will fail otherwise:

1. **Imports at top of file** (PLC0415): Never use inline/lazy imports inside functions
   ```python
   # ✅ Correct - imports at module level
   from backend.auth.models import User
   def get_user(): ...

   # ❌ Wrong - will fail CI
   def get_user():
       from backend.auth.models import User  # PLC0415
   ```

2. **Exception chaining** (B904): Always use `from err` or `from None`
   ```python
   # ✅ Correct
   except ValueError as e:
       raise HTTPException(status_code=400) from e

   # ❌ Wrong
   except ValueError as e:
       raise HTTPException(status_code=400)  # B904
   ```

3. **Return in else after try-except** (TRY300):
   ```python
   # ✅ Correct
   try:
       result = operation()
   except Error:
       return None
   else:
       return result

   # ❌ Wrong
   try:
       result = operation()
   except Error:
       return None
   return result  # TRY300
   ```

4. **No magic numbers** (PLR2004): Use named constants
   ```python
   # ✅ Correct
   MAX_RETRIES = 3
   if attempts > MAX_RETRIES: ...

   # ❌ Wrong
   if attempts > 3: ...  # PLR2004
   ```

5. **Timezone-aware datetime** (DTZ): Use `datetime.now(UTC)`
   ```python
   # ✅ Correct
   from datetime import UTC, datetime
   now = datetime.now(UTC)

   # ❌ Wrong
   now = datetime.now()  # DTZ
   ```

6. **ClassVar for mutable class attributes** (RUF012):
   ```python
   # ✅ Correct
   from typing import ClassVar
   class Parser:
       types: ClassVar[list[str]] = ["pdf"]

   # ❌ Wrong
   class Parser:
       types: list[str] = ["pdf"]  # RUF012
   ```

### Pre-Commit/Push Checklist

**Always run before committing**:
```bash
uv run ruff check . && uv run ruff format --check .
```

If CI fails: `uv run ruff check . --fix` auto-fixes most issues.

### Best Practices

1. **Enable auto-format on save** - Reduces manual work
2. **Install pre-commit hooks** - Catches issues before commit
3. **Fix type errors immediately** - Strict typing prevents bugs
4. **Never commit secrets** - Gitleaks blocks commits with secrets
5. **Use Ruff auto-fix** - Most issues fixable with `--fix`
6. **Maintain coverage** - Write tests for new features
7. **Run ruff before push** - CI will reject lint errors
