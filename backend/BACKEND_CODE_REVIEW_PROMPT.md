# Backend Code Quality Review Prompt

## Prompt for Senior Staff Backend/Full-Stack Engineer

You are a senior staff backend engineer with deep expertise in Python, FastAPI, SQLAlchemy/SQLModel, LangGraph/LangChain, and enterprise software patterns. I want you to conduct a comprehensive code quality review of this Python backend repository with a focus on:

1. Code smells and anti-patterns
2. Good software engineering patterns (SOLID, DRY, separation of concerns)
3. Maintainability and scalability
4. Python/FastAPI best practices
5. LangGraph/LangChain agent patterns
6. Database patterns (SQLModel/SQLAlchemy)
7. Security considerations
8. Error handling consistency

---

## Tech Stack Context

### Core Framework & ORM
- FastAPI 0.124.4+ - REST API framework with Pydantic v2 validation
- SQLModel 0.0.27+ - Unified SQLAlchemy + Pydantic ORM
- Pydantic v2 - Strict schema validation with model_validate patterns
- psycopg 3.2.7+ - PostgreSQL async driver with connection pooling

### Agent/LLM Stack
- LangGraph 0.6.11+ - Agentic framework with PostgreSQL checkpointing (AsyncPostgresSaver)
- LangChain 0.3.0+ - Core abstractions (HumanMessage, AIMessage, ToolMessage, SystemMessage)
- langchain-anthropic, langchain-openai, langchain-google-genai - Multi-provider LLM support
- langmem 0.0.25+ - Memory extraction from conversations
- langchain-mcp-adapters 0.1.0+ - Model Context Protocol integration

### Data & Persistence
- PostgreSQL - Primary database with multi-tenant scoping
- pgvector 0.3.0+ - Vector embeddings for RAG with HNSW indexing
- langgraph-checkpoint-postgres 2.0.0+ - Conversation history checkpointing
- SeaweedFS - S3-compatible storage for uploads (via boto3)

### Authentication & Security
- PyJWT 2.10.0+ - JWT token generation/validation
- Passlib + bcrypt 4.3.0 - Password hashing
- OAuth2PasswordBearer - FastAPI's standard bearer token scheme

### Infrastructure Services
- Infisical SDK 1.0.0+ - Secrets management (API keys per org/team/user)
- OpenSearch 2.8.0+ - Audit and application logging
- Langfuse 3.0.0+ - LLM tracing and observability
- slowapi 0.1.9+ - Rate limiting
- sse-starlette 3.0.4+ - Server-Sent Events for streaming

### Development Tools
- Ruff 0.8.0+ - Linting + formatting (strict, 800+ rules enabled)
- MyPy 1.13.0+ - Strict type checking with Pydantic plugin
- Pytest 8.4.2+ - Testing with asyncio support
- Alembic 1.16.2+ - Database migrations
- structlog 25.5.0+ - Structured logging with context variables

---

## Architecture Patterns to Validate

### 1. Dependency Injection Pattern
The codebase uses FastAPI's Depends() with typed aliases:
```python
SessionDep = Annotated[Session, Depends(get_db)]
CurrentUser = Annotated[User, Depends(get_current_user)]
OrgContextDep = Annotated[OrganizationContext, Depends(get_org_context)]
TeamContextDep = Annotated[TeamContext, Depends(get_team_context)]
SettingsDep = Annotated[Settings, Depends(get_settings)]
```

Review for:
- Consistent use of typed aliases across routes
- Proper dependency chain (avoid circular dependencies)
- Correct scoping of dependencies (per-request vs singleton)

### 2. Multi-Tenant Hierarchy Pattern
Three scoping levels via SQLModel mixins:
- `OrgScopedMixin` - organization_id (required)
- `TeamScopedMixin` - team_id (required, with FK to team)
- `HierarchicalScopedMixin` - org_id, team_id, user_id (all optional, one set per level)
- `MCPScopedMixin` - organization_id (required) + team_id/user_id (optional)

Review for:
- Consistent tenant isolation in queries
- Proper FK relationships and cascade behavior
- Missing tenant context in any queries

### 3. RBAC with Role-to-Permission Mapping
Two role hierarchies:
- OrgRole: OWNER > ADMIN > MEMBER
- TeamRole: ADMIN > MEMBER > VIEWER

Review for:
- Proper permission checks on all routes
- Consistent use of `require_org_permission()` and `require_team_permission()`
- Platform admin bypass is used sparingly

### 4. Hierarchical Settings Resolution Pattern
Settings follow: Organization -> Team -> User inheritance:
```python
def get_effective_settings(session, user_id, org_id, team_id):
    org = get_org_settings(session, org_id)
    team = get_team_settings(session, team_id) if team_id else None
    user = get_user_settings(session, user_id)
    # Resolve with allow_team_override, allow_user_override controls
    return EffectiveSettings(...)
```

Review for:
- Consistent hierarchy resolution across all settings modules
- Proper handling of None values at each level
- Override permission checks are respected

### 5. Agent Factory Pattern (Per-Request)
Agents are created fresh per request, never reused:
```python
async def get_agent_with_tools(org_id, team_id, user_id, require_tool_approval=None) -> Any:
    tools = get_available_tools()
    tools.extend(get_context_aware_tools(org_id, team_id, user_id))
    tools.extend(await get_mcp_tools_for_context(org_id, team_id, user_id))
    # Create graph with checkpointer
    return graph.compile(checkpointer=global_checkpointer)
```

Review for:
- No agent instance reuse across requests
- Proper context variable cleanup in finally blocks
- Tool filtering based on user settings

### 6. Exception Hierarchy Pattern
All exceptions inherit from AppException:
```python
class AppException(Exception):
    message: str           # Human-readable
    error_code: str        # Machine-readable (e.g., "AUTH_FAILED")
    status_code: int       # HTTP status
    details: dict[str, Any]  # Context
```

Review for:
- All exceptions use domain-specific types (never raw ValueError, KeyError)
- Proper exception chaining with `from err` or `from None`
- Consistent error response format

### 7. Unit of Work Pattern
```python
with atomic(session) as uow:
    org = create_organization(...)
    uow.session.add(org)
    uow.flush()  # Get auto-generated ID
    create_default_team(org.id, session=uow.session)
    # Auto-commits on success, rolls back on exception
```

Review for:
- Multi-step database operations use atomic()
- Proper use of flush() vs commit()
- No orphaned commits outside UoW

### 8. CRUD Module Pattern
Every domain module follows:
```
module/
├── models.py         # SQLModel classes + schemas
├── crud.py           # CRUD operations
└── schemas.py        # Request/response Pydantic models
```

Review for:
- Consistent CRUD function signatures
- Proper use of model_validate() and model_dump(exclude_unset=True)
- Soft delete handling where applicable

---

## Critical Code Quality Rules (CI-Enforced)

### Ruff Lint Rules That MUST Pass

1. No inline imports (PLC0415): All imports at module top
   ```python
   # WRONG
   def get_user():
       from backend.auth.models import User  # PLC0415
   ```

2. Exception chaining (B904): Always use `from err` or `from None`
   ```python
   # WRONG
   except ValueError as e:
       raise HTTPException(status_code=400)  # B904

   # CORRECT
   except ValueError as e:
       raise HTTPException(status_code=400) from e
   ```

3. Return in else after try-except (TRY300)
   ```python
   # WRONG
   try:
       result = operation()
   except Error:
       return None
   return result  # TRY300

   # CORRECT
   try:
       result = operation()
   except Error:
       return None
   else:
       return result
   ```

4. No magic numbers (PLR2004): Use named constants
   ```python
   # WRONG
   if attempts > 3: ...  # PLR2004

   # CORRECT
   MAX_RETRIES = 3
   if attempts > MAX_RETRIES: ...
   ```

5. Timezone-aware datetime (DTZ): Always use `datetime.now(UTC)`
   ```python
   # WRONG
   now = datetime.now()  # DTZ

   # CORRECT
   from datetime import UTC, datetime
   now = datetime.now(UTC)
   ```

6. ClassVar for mutable class attributes (RUF012)
   ```python
   # WRONG
   class Parser:
       supported_types: list[str] = ["pdf"]  # RUF012

   # CORRECT
   from typing import ClassVar
   class Parser:
       supported_types: ClassVar[list[str]] = ["pdf"]
   ```

### MyPy Type Checking Rules That MUST Pass

1. SQLModel column comparisons: Use `== None` with noqa, not `.is_(None)`
   ```python
   # WRONG - mypy error: "datetime" has no attribute "is_"
   .where(Model.deleted_at.is_(None))

   # CORRECT
   .where(Model.deleted_at == None)  # noqa: E711
   ```

2. SQLModel `.in_()` and `.desc()` methods: Add `type: ignore[attr-defined]`
   ```python
   # CORRECT
   Model.id.in_(id_list),  # type: ignore[attr-defined]
   Model.created_at.desc()  # type: ignore[attr-defined]
   ```

3. Generic type parameters always specified
   ```python
   # WRONG - mypy error: Missing type parameters for generic type
   def _json_column() -> Column: ...

   # CORRECT
   def _json_column() -> "Column[list[str]]": ...
   ```

---

## Areas of Focus

### 1. Agent Module (`agents/`)
Files: base.py, factory.py, react_agent.py, context.py, llm.py, tools.py, tracing.py

Review for:
- ContextVar usage and cleanup (memory leaks)
- Proper async/await patterns in graph nodes
- Tool approval flow (interrupt/resume) correctness
- Orphaned tool call handling in message history
- Memory retrieval timeout handling
- Multi-provider LLM factory consistency
- Langfuse tracing integration

Specific patterns to validate:
```python
# ContextVar cleanup pattern
token = _llm_context.set({...})
try:
    # ... agent execution
finally:
    _llm_context.reset(token)  # MUST be in finally
```

### 2. API Routes (`api/routes/`)
Files: agent.py, conversations.py, organizations.py, teams.py, mcp.py, documents.py, etc.

Review for:
- Consistent error handling with HTTPException
- Proper use of typed dependencies
- RBAC permission checks on all endpoints
- Request validation (Query, Path, Body patterns)
- SSE streaming error handling
- Background task management

### 3. CRUD Modules
Directories: organizations/, teams/, conversations/, prompts/, mcp/, documents/, etc.

Review for:
- Consistent function signatures across modules
- Proper soft delete handling
- Pagination utility usage
- Query optimization (N+1 problems)
- FK constraint handling

### 4. Core Infrastructure (`core/`)
Files: config.py, db.py, security.py, secrets.py, cache.py, http.py, uow.py, exceptions.py, logging.py

Review for:
- Singleton pattern usage (secrets service, checkpointer)
- Connection pool configuration
- Cache invalidation patterns
- HTTP client timeout configuration
- Transaction management

### 5. Settings Resolution Modules
Directories: settings/, rag_settings/, theme_settings/, guardrails/

Review for:
- Consistent hierarchy resolution logic
- Override permission checking
- Effective settings caching
- None value handling at each level

### 6. MCP Module (`mcp/`)
Files: models.py, service.py, client.py, types.py

Review for:
- Server connection handling and cleanup
- Auth secret retrieval from Infisical
- Tool loading and filtering
- Transport type handling (HTTP, SSE, STREAMABLE_HTTP)

### 7. Documents/RAG Module (`documents/`)
Files: models.py, service.py, chunking.py, embeddings.py, parsers.py, vector_store.py

Review for:
- Document processing pipeline
- Chunk size and overlap configuration
- Embedding generation batching
- Vector similarity search optimization
- File type validation and parsing

### 8. Memory Module (`memory/`)
Files: models.py, service.py, extraction.py, store.py

Review for:
- Memory extraction LLM prompts
- Semantic search implementation
- Namespace isolation for multi-tenancy
- Background task execution

---

## Output Requirements

After completing your deep research and analysis, create a comprehensive plan that includes:

1. Critical Issues - Security vulnerabilities, data leaks, race conditions
2. High Priority - Architectural anti-patterns, maintainability concerns
3. Medium Priority - Code smells, inconsistencies, minor refactors
4. Low Priority - Style improvements, documentation gaps

For each issue:
- Location: File path and line numbers
- Description: What the issue is
- Impact: Why it matters
- Recommendation: How to fix it
- Code Example: Before/after if applicable

---

## Deep Online Research Requirements (MANDATORY)

Before analyzing the codebase, you MUST conduct comprehensive online research to ensure you're applying the latest and greatest practices for each technology. This is critical - libraries evolve rapidly and what was best practice 6 months ago may be outdated.

### Phase 1: Core Framework Research (FastAPI + Pydantic + SQLModel)

FastAPI (0.124.4+)
- Search: "FastAPI best practices 2025", "FastAPI production patterns", "FastAPI dependency injection anti-patterns"
- Research: Latest changes in FastAPI 0.100+ (Pydantic v2 migration impacts)
- Look for: Lifespan management patterns, background task best practices, SSE streaming patterns
- Check: FastAPI GitHub issues/discussions for common pitfalls
- Verify: Current recommended patterns for async database sessions

Pydantic v2
- Search: "Pydantic v2 best practices 2025", "Pydantic v2 migration gotchas", "Pydantic v2 performance optimization"
- Research: model_validate vs parse_obj, model_dump vs dict(), ConfigDict patterns
- Look for: Strict mode implications, validator patterns, serialization edge cases
- Check: Pydantic changelog for recent breaking changes

SQLModel (0.0.27+)
- Search: "SQLModel best practices 2025", "SQLModel vs SQLAlchemy patterns", "SQLModel relationship patterns"
- Research: SQLModel + Pydantic v2 compatibility, async session patterns
- Look for: Known limitations, workarounds for type checking issues
- Check: SQLModel GitHub issues for common problems with .in_(), .desc(), None comparisons
- Verify: Latest recommended patterns for complex queries

### Phase 2: LLM/Agent Stack Research (LangGraph + LangChain)

LangGraph (0.6.11+)
- Search: "LangGraph best practices 2025", "LangGraph agent patterns", "LangGraph checkpointing patterns"
- Research: StateGraph vs MessageGraph, interrupt/resume patterns, tool approval flows
- Look for: Memory management, async graph execution, checkpoint cleanup
- Check: LangGraph GitHub for breaking changes, migration guides
- Verify: Current recommended patterns for human-in-the-loop

LangChain (0.3.0+)
- Search: "LangChain 0.3 best practices", "LangChain multi-provider patterns", "LangChain memory patterns 2025"
- Research: Message types (HumanMessage, AIMessage, ToolMessage), callback patterns
- Look for: Deprecated patterns from 0.2.x, new recommended approaches
- Check: LangChain docs for tool calling best practices, streaming patterns
- Verify: Current best practices for multi-provider LLM switching

langchain-mcp-adapters (0.1.0+)
- Search: "MCP Model Context Protocol best practices", "langchain-mcp-adapters patterns"
- Research: Transport types (HTTP, SSE, Streamable HTTP), authentication patterns
- Look for: Connection lifecycle management, error handling
- Check: MCP specification for latest protocol updates

langmem (0.0.25+)
- Search: "langmem memory extraction patterns", "LangGraph memory best practices"
- Research: Memory namespace patterns, embedding-based retrieval
- Look for: Performance implications, async patterns
- Verify: Integration patterns with LangGraph checkpointing

### Phase 3: Database & Storage Research

PostgreSQL + psycopg 3.x
- Search: "psycopg3 best practices 2025", "PostgreSQL connection pooling patterns", "psycopg3 async patterns"
- Research: Connection pool sizing, autocommit patterns, prepared statements
- Look for: Common connection leak patterns, transaction isolation levels
- Check: psycopg3 documentation for async context manager patterns

pgvector (0.3.0+)
- Search: "pgvector best practices 2025", "pgvector HNSW index optimization", "pgvector performance tuning"
- Research: Index parameters (m, ef_construction), similarity search optimization
- Look for: Batch embedding insertion patterns, approximate vs exact search tradeoffs
- Verify: Latest recommended index configuration for production

langgraph-checkpoint-postgres (2.0.0+)
- Search: "LangGraph PostgreSQL checkpointer patterns", "AsyncPostgresSaver best practices"
- Research: Checkpoint cleanup, connection pool management, concurrent access
- Look for: Race conditions, orphaned checkpoints, memory growth
- Check: GitHub issues for known problems with async operations

SeaweedFS / boto3
- Search: "SeaweedFS S3 best practices", "boto3 async patterns 2025", "S3 upload best practices"
- Research: Multipart upload thresholds, connection reuse, error retry patterns
- Look for: Memory efficiency for large files, streaming uploads

### Phase 4: Authentication & Security Research

PyJWT (2.10.0+)
- Search: "PyJWT best practices 2025", "JWT security best practices", "JWT refresh token patterns"
- Research: Algorithm selection (RS256 vs HS256), token expiration patterns
- Look for: Known vulnerabilities, timing attack mitigations
- Check: OWASP JWT security cheat sheet for latest recommendations

Passlib + bcrypt
- Search: "bcrypt best practices 2025", "password hashing Python patterns", "passlib deprecation status"
- Research: Work factor recommendations (current: 12+), argon2 vs bcrypt considerations
- Look for: Timing-safe comparison patterns, upgrade paths
- Verify: Current recommended work factor for production

OAuth2 / FastAPI Security
- Search: "FastAPI OAuth2 best practices 2025", "OAuth2PasswordBearer patterns"
- Research: Token refresh flows, scope-based authorization
- Look for: Common security misconfigurations, CSRF protection

### Phase 5: Infrastructure Services Research

Infisical SDK (1.0.0+)
- Search: "Infisical SDK best practices", "Infisical Python patterns", "secrets management best practices 2025"
- Research: Secret rotation, caching strategies, error handling
- Look for: Connection resilience, fallback patterns
- Verify: Latest SDK version and any breaking changes

OpenSearch (2.8.0+)
- Search: "OpenSearch Python best practices 2025", "OpenSearch async patterns", "OpenSearch logging best practices"
- Research: Index lifecycle management, bulk indexing, query optimization
- Look for: Connection pooling, retry patterns
- Check: OpenSearch documentation for Python client updates

Langfuse (3.0.0+)
- Search: "Langfuse best practices 2025", "Langfuse LangChain integration", "LLM observability patterns"
- Research: Trace hierarchy, async callback patterns, batching
- Look for: Performance overhead, sampling strategies
- Verify: Latest integration patterns with LangGraph

slowapi / Rate Limiting
- Search: "slowapi best practices 2025", "FastAPI rate limiting patterns", "distributed rate limiting Python"
- Research: Redis-backed rate limiting, per-user vs per-IP patterns
- Look for: Rate limit bypass vulnerabilities, header spoofing

sse-starlette / SSE
- Search: "SSE streaming best practices Python 2025", "sse-starlette patterns", "Server-Sent Events error handling"
- Research: Connection timeout handling, reconnection patterns
- Look for: Memory leaks in long-running connections, client disconnect handling

### Phase 6: Development Tools Research

Ruff (0.8.0+)
- Search: "Ruff best practices 2025", "Ruff configuration patterns", "Ruff new rules 0.8"
- Research: New rules in recent versions, per-file ignores patterns
- Look for: Rules that should be enabled but aren't in the config
- Check: Ruff changelog for new recommended rules

MyPy (1.13.0+)
- Search: "MyPy strict mode best practices 2025", "MyPy SQLAlchemy patterns", "MyPy Pydantic v2"
- Research: Plugin configurations, type: ignore best practices
- Look for: Over-suppressed errors, missing type stubs
- Verify: Current recommended strict mode configuration

structlog (25.5.0+)
- Search: "structlog best practices 2025", "structured logging Python patterns"
- Research: Context variable patterns, processor chains, async logging
- Look for: Performance implications, log aggregation patterns
- Check: Latest recommended processor configuration

### Phase 7: Architecture Pattern Research

Multi-Tenant SaaS Patterns
- Search: "multi-tenant database patterns 2025", "PostgreSQL row-level security SaaS", "SaaS tenant isolation Python"
- Research: Shared vs isolated schemas, query performance implications
- Look for: Data leakage vulnerabilities, tenant context propagation patterns
- Verify: Current best practices for tenant ID propagation

RBAC Patterns
- Search: "RBAC best practices 2025", "Python RBAC patterns FastAPI", "permission hierarchy patterns"
- Research: Role inheritance, permission caching, audit logging
- Look for: Privilege escalation vulnerabilities, IDOR patterns
- Check: OWASP access control cheat sheet

Repository/Service Layer Patterns
- Search: "Python repository pattern 2025", "FastAPI service layer patterns", "Unit of Work Python SQLAlchemy"
- Research: Transaction boundary management, dependency injection patterns
- Look for: Anti-patterns in CRUD implementations, god service classes

Async Python Patterns
- Search: "Python async best practices 2025", "asyncio patterns production", "async context manager patterns"
- Research: Task cancellation, exception propagation, resource cleanup
- Look for: Event loop blocking, connection leaks, task garbage collection
- Verify: Current recommended patterns for background tasks

### Phase 8: Security-Specific Research

API Security
- Search: "FastAPI security best practices 2025", "REST API security Python", "API rate limiting bypass"
- Research: Input validation, output encoding, header security
- Look for: OWASP API Security Top 10 2023 vulnerabilities
- Check: Security headers (CORS, CSP, etc.) configuration

Injection Prevention
- Search: "SQL injection prevention SQLAlchemy 2025", "NoSQL injection Python", "command injection prevention"
- Research: Parameterized queries, ORM bypass scenarios
- Look for: Raw SQL usage, dynamic query building anti-patterns

Secrets Handling
- Search: "Python secrets handling best practices 2025", "environment variable security", "API key rotation patterns"
- Research: In-memory secret protection, logging sanitization
- Look for: Accidental secret exposure in logs, error messages, stack traces

---

## Research Output Requirements

After completing online research, create a Research Summary Document that includes:

1. Key Findings Per Technology: What are the current (2025) best practices?
2. Breaking Changes: Any recent library updates that affect existing code
3. Deprecated Patterns: What patterns are no longer recommended?
4. Security Advisories: Any CVEs or security issues affecting the versions used
5. Performance Recommendations: Latest optimization techniques
6. Migration Recommendations: If any libraries recommend upgrading patterns

---

## Codebase Analysis Instructions

After completing online research, analyze the codebase:

1. First: Read all files in the backend to understand the full architecture
2. Second: Cross-reference each module against the researched best practices
3. Third: Identify discrepancies between current implementation and latest patterns
4. Fourth: Prioritize findings by security impact, then maintainability, then performance
5. Fifth: Create the comprehensive plan with prioritized findings

---

## Key Questions to Answer

1. Are there any SQL injection or security vulnerabilities?
2. Is the multi-tenant isolation properly enforced everywhere?
3. Are there any memory leaks in the agent context handling?
4. Is the exception handling consistent and informative?
5. Are database queries optimized (no N+1 problems)?
6. Is the settings hierarchy resolution correct in all modules?
7. Are background tasks properly managed and error-handled?
8. Is the MCP tool approval flow correctly implemented?
9. Are there any race conditions in the checkpointer usage?
10. Is the guardrails implementation secure against bypass?

---

## Additional Context Files to Read

- `backend/CLAUDE.md` - Backend-specific documentation
- `backend/pyproject.toml` - Full Ruff and MyPy configuration
- `backend/src/backend/core/config.py` - Environment configuration
- `backend/src/backend/rbac/permissions.py` - RBAC definitions
- `backend/src/backend/core/base_models.py` - SQLModel mixins
- `backend/alembic/env.py` - Migration configuration

---

## Expected Deliverable

A Claude Code plan mode document with:
1. Executive summary of codebase health
2. Prioritized list of issues with specific file:line references
3. Detailed remediation steps for each issue
4. Estimated complexity for each fix (trivial/small/medium/large)
5. Recommended order of implementation

Focus on actionable, specific findings - not general best practice suggestions.
