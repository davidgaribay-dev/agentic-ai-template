<h1 align="center">Agentic AI Template</h1>

<p align="center">
  <strong>Enterprise-ready AI agent template with multi-tenant architecture</strong>
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#architecture">Architecture</a> •
  <a href="#tech-stack">Tech Stack</a> •
  <a href="#documentation">Documentation</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/python-3.11+-blue.svg" alt="Python 3.11+">
  <img src="https://img.shields.io/badge/react-19.2-61DAFB.svg" alt="React 19.2">
  <img src="https://img.shields.io/badge/FastAPI-0.124+-009688.svg" alt="FastAPI">
  <img src="https://img.shields.io/badge/LangGraph-0.6+-orange.svg" alt="LangGraph">
  <img src="https://img.shields.io/badge/license-MIT-green.svg" alt="License">
</p>

---

## Overview

A production-ready full-stack AI agent template built for teams and enterprises. Features real-time streaming chat with LangGraph agents, MCP (Model Context Protocol) tool integration, semantic memory with pgvector, hierarchical multi-tenancy (Organizations → Teams → Users), and enterprise integrations for secrets management, audit logging, and LLM observability.

### Why This Template?

- **Multi-Tenant by Design**: Built from the ground up with proper data isolation between organizations and teams
- **MCP Tool Integration**: Connect external tools via Model Context Protocol with human-in-the-loop approval
- **Semantic Memory**: Persistent user memory with embedding-based search and deduplication
- **Real-Time AI Streaming**: SSE-powered chat with graceful cancellation and state persistence
- **Multi-Provider LLM Support**: Switch between Anthropic, OpenAI, and Google at the org or team level
- **Enterprise Security**: JWT auth, RBAC, audit logging, secrets management, and compliance-ready architecture
- **Developer Experience**: One-command setup, hot reload, auto-generated API docs, type-safe modular API client

---

## Features

### AI & Agent Capabilities

- **LangGraph ReAct Agent** — Graph-based agent with PostgreSQL state checkpointing
- **Multi-Provider LLM** — Anthropic Claude Haiku 4.5, OpenAI GPT-4o, Google Gemini 2.0 Flash
- **SSE Streaming** — Real-time token streaming with browser-native cancellation
- **Hierarchical Prompts** — System prompts at org, team, and user levels (auto-concatenated)
- **Semantic Memory** — Persistent user context with pgvector embeddings and deduplication
- **MCP Tool Integration** — Connect external HTTP/SSE tools with approval workflow
- **LLM Tracing** — Langfuse integration for observability and debugging

### MCP (Model Context Protocol)

- **Multi-Scope Servers** — Configure at organization, team, or user level
- **Transport Support** — HTTP, SSE, and Streamable HTTP protocols
- **Auth Options** — None, Bearer token, or API key authentication
- **Human-in-the-Loop** — Configurable tool approval before execution
- **Tool Management** — Enable/disable servers and individual tools per hierarchy level
- **Connection Testing** — Verify server connectivity before use

### Multi-Tenant Architecture

- **Organizations** — Top-level tenant boundaries with roles (Owner, Admin, Member)
- **Teams** — Sub-groups within organizations with granular permissions
- **Hierarchical Settings** — Chat, memory, and MCP settings cascade org → team → user
- **Invitations** — Email-based invites with secure token validation
- **Per-Team API Keys** — Store LLM credentials per team via Infisical

### Enterprise Features

- **RBAC** — 22 org permissions + 17 team permissions with role-based mappings
- **Audit Logging** — OpenSearch integration with 90-day retention
- **Secrets Management** — Infisical for secure API key and MCP auth storage
- **Rate Limiting** — Configurable limits per endpoint category
- **Security Headers** — CORS, CSP, HSTS, XSS protection

### Developer Experience

- **Auto-Generated Docs** — OpenAPI/Swagger at `/v1/docs`
- **Modular API Client** — Domain-specific TypeScript modules with full type safety
- **Hot Reload** — Both backend and frontend with instant updates
- **Setup Scripts** — One-command infrastructure + migrations

---

## Quick Start

### Prerequisites

- Docker & Docker Compose
- Python 3.11+ with [uv](https://github.com/astral-sh/uv)
- Node.js 20+

### Option 1: Automated Setup (Recommended)

```bash
# Clone the repository
git clone https://github.com/davidgaribay-dev/agentic-ai-template.git
cd agentic-ai-template

# Run setup (starts infrastructure, runs migrations, configures Infisical/Langfuse)
./setup-local.sh

# Start dev servers in separate terminals
cd backend && uv run uvicorn backend.main:app --reload    # Terminal 1: API on :8000
cd frontend && npm run dev                                  # Terminal 2: UI on :5173
```

### Option 2: Manual Setup

```bash
# Start infrastructure services
docker compose -f docker-compose-local.yml up -d

# Backend setup
cd backend
uv sync
uv run alembic upgrade head
uv run python scripts/setup-infisical.py
uv run python scripts/setup-langfuse.py
uv run uvicorn backend.main:app --reload

# Frontend setup (new terminal)
cd frontend
npm install
npm run dev
```

### Access Points

| Service | URL | Description |
|---------|-----|-------------|
| Frontend | http://localhost:5173 | React application |
| API | http://localhost:8000 | FastAPI backend |
| API Docs | http://localhost:8000/v1/docs | Swagger/OpenAPI |
| Infisical | http://localhost:8081 | Secrets management |
| Langfuse | http://localhost:3001 | LLM tracing |
| OpenSearch | http://localhost:5601 | Audit log dashboards |

### Default Credentials

- **Superuser**: `admin@example.com` / `changethis`
- Other services auto-configured by setup scripts

---

## Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Frontend (React 19)                          │
│  ┌──────────┐  ┌───────────────┐  ┌───────────┐  ┌───────────────┐  │
│  │ TanStack │  │   SSE Chat    │  │  Zustand  │  │   shadcn/ui   │  │
│  │  Router  │  │   Streaming   │  │   Store   │  │   Components  │  │
│  └──────────┘  └───────────────┘  └───────────┘  └───────────────┘  │
└───────────────────────────────┬─────────────────────────────────────┘
                                │ /api/* proxy
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        Backend (FastAPI)                             │
│  ┌──────────┐  ┌───────────────┐  ┌───────────┐  ┌───────────────┐  │
│  │   REST   │  │   LangGraph   │  │    MCP    │  │   Memory      │  │
│  │   API    │  │   Agent       │  │   Tools   │  │   Store       │  │
│  └──────────┘  └───────────────┘  └───────────┘  └───────────────┘  │
└────────┬───────────────┬─────────────────┬──────────────┬───────────┘
         │               │                 │              │
         ▼               ▼                 ▼              ▼
┌─────────────┐  ┌───────────────┐  ┌───────────┐  ┌───────────────┐
│ PostgreSQL  │  │   Infisical   │  │ SeaweedFS │  │  OpenSearch   │
│  + pgvector │  │   (Secrets)   │  │   (S3)    │  │   (Logs)      │
└─────────────┘  └───────────────┘  └───────────┘  └───────────────┘
```

### Multi-Tenant Data Model

```
Organization (tenant boundary)
├── OrganizationMember
│   └── role: OWNER | ADMIN | MEMBER
├── Team (sub-group)
│   └── TeamMember
│       └── role: ADMIN | MEMBER | VIEWER
├── Conversation (scoped to org + team)
├── Prompt (hierarchical: org → team → user)
├── MCP Servers (hierarchical: org → team → user)
├── Chat Settings (hierarchical: org → team → user)
├── Memory (scoped to org + team + user)
└── API Keys (via Infisical)
```

### Project Structure

```
├── setup.sh                    # Full setup (CI/first-time)
├── setup-local.sh              # Local dev setup
├── docker-compose.yml          # Full stack containers
├── docker-compose-local.yml    # Infrastructure only
│
├── backend/
│   ├── src/backend/
│   │   ├── agents/             # LangGraph agent, tools, LLM providers
│   │   ├── mcp/                # MCP server registry, client, tool loading
│   │   ├── memory/             # Semantic memory store with pgvector
│   │   ├── api/routes/         # REST endpoints (/v1 prefix)
│   │   ├── auth/               # JWT, user model, dependencies
│   │   ├── rbac/               # Permissions, role mappings
│   │   ├── organizations/      # Org + member management
│   │   ├── teams/              # Team + member management
│   │   ├── conversations/      # Chat history (soft delete)
│   │   ├── prompts/            # System prompts (org/team/user)
│   │   ├── settings/           # Chat settings hierarchy
│   │   ├── audit/              # OpenSearch logging
│   │   └── core/               # Config, DB, security, secrets
│   ├── scripts/                # Setup automation
│   └── alembic/                # Database migrations
│
└── frontend/
    └── src/
        ├── routes/             # File-based routing (auto-gen)
        ├── components/
        │   ├── ui/             # shadcn/ui components
        │   ├── chat/           # Chat UI, markdown, code blocks
        │   └── settings/       # Settings panels
        ├── hooks/              # useChat, useAuth, useWorkspace
        └── lib/
            ├── api/            # Modular API client
            │   ├── agent.ts
            │   ├── auth.ts
            │   ├── conversations.ts
            │   ├── mcp-servers.ts
            │   ├── memory.ts
            │   ├── chat-settings.ts
            │   └── ...
            ├── auth.ts         # Token management
            └── workspace.tsx   # Org/team context
```

---

## Tech Stack

### Backend

| Technology | Version | Purpose |
|------------|---------|---------|
| **FastAPI** | 0.124+ | Async REST API with auto-docs |
| **SQLModel** | 0.0.27 | ORM (SQLAlchemy + Pydantic) |
| **PostgreSQL** | 17 | Primary database (with pgvector) |
| **LangGraph** | 0.6+ | Agent orchestration with state |
| **LangChain** | 0.3+ | LLM provider integrations |
| **Alembic** | 1.16+ | Database migrations |
| **Infisical** | Latest | Secrets management |
| **OpenSearch** | 2.18 | Audit logging |
| **Langfuse** | 3.0+ | LLM observability |

### Frontend

| Technology | Version | Purpose |
|------------|---------|---------|
| **React** | 19.2 | UI framework (concurrent mode) |
| **TypeScript** | 5.9 | Type safety |
| **Vite** | 7.2 | Build tool |
| **TanStack Router** | 1.141 | File-based routing |
| **TanStack Query** | 5.90 | Server state management |
| **Zustand** | 5.0 | Client state |
| **shadcn/ui** | Latest | Component library |
| **Tailwind CSS** | 4.1 | Styling |
| **Streamdown** | 1.6 | Markdown streaming |

### Infrastructure

| Service | Port | Purpose |
|---------|------|---------|
| PostgreSQL | 5432 | Application database (pgvector) |
| SeaweedFS | 8333 | S3-compatible storage |
| Infisical | 8081 | Secrets management |
| OpenSearch | 9200 | Log storage & search |
| Dashboards | 5601 | Log visualization |
| Langfuse | 3001 | LLM tracing UI |
| ClickHouse | - | Langfuse analytics |
| MinIO | 9090 | Langfuse blob storage |

---

## Development

### Commands

```bash
# Backend (from backend/)
uv run uvicorn backend.main:app --reload    # Dev server
uv run pytest                                # Run tests
uv run alembic revision --autogenerate -m "description"  # Create migration
uv run alembic upgrade head                  # Apply migrations

# Frontend (from frontend/)
npm run dev                   # Dev server with HMR
npm run build                 # Production build
npm run lint                  # ESLint
npx shadcn@latest add <name>  # Add UI component
```

### Environment Variables

**Backend** (`backend/.env`):
```bash
# Database
POSTGRES_SERVER=localhost
POSTGRES_PORT=5432
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=app

# Security
SECRET_KEY=your-secret-key
FRONTEND_URL=http://localhost:5173

# LLM Providers (at least one required)
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GOOGLE_API_KEY=...

# External Services
INFISICAL_URL=http://localhost:8081
LANGFUSE_BASE_URL=http://localhost:3001
```

**Frontend** (`frontend/.env`):
```bash
VITE_API_URL=http://localhost:8000
VITE_PORT=5173
```

### Adding Features

| Task | Steps |
|------|-------|
| **New API Route** | Create in `backend/api/routes/`, add to `api/main.py` |
| **New Page** | Add file to `frontend/src/routes/` (auto-generates) |
| **New DB Model** | Add SQLModel class, import in `alembic/env.py`, run migrations |
| **New Agent Tool** | Add `@tool` function in `backend/agents/tools.py` |
| **New MCP Server** | Add via UI at org/team/user settings, or via API |
| **New API Module** | Add to `frontend/src/lib/api/`, export in `index.ts` |

---

## API Overview

### Authentication

```bash
# Login (OAuth2 form-encoded)
curl -X POST http://localhost:8000/v1/auth/login \
  -d "username=admin@example.com&password=changethis"

# Use token
curl -H "Authorization: Bearer <token>" \
  http://localhost:8000/v1/users/me
```

### Key Endpoints

| Endpoint | Description |
|----------|-------------|
| `POST /v1/auth/login` | OAuth2 login (form-encoded) |
| `POST /v1/auth/signup` | Register + create org |
| `GET /v1/organizations` | List user's orgs |
| `GET /v1/conversations` | List conversations |
| `POST /v1/agent/chat` | SSE streaming chat |
| `GET /v1/prompts/*` | Manage system prompts |
| `GET /v1/mcp-servers/*` | Manage MCP servers |
| `GET /v1/memory/users/me/memories` | List user memories |
| `GET /v1/settings/effective` | Get computed settings |

Full documentation at http://localhost:8000/v1/docs

---

## Security

- **Authentication**: JWT tokens (30min access, 7-day refresh)
- **Password Hashing**: bcrypt with timing-safe comparison
- **RBAC**: Fine-grained org and team permissions (22 org + 17 team permissions)
- **Secrets**: Infisical (never stored in config files)
- **MCP Auth**: Bearer/API key secrets stored securely in Infisical
- **Audit Trail**: All actions logged to OpenSearch
- **Headers**: CORS, CSP, HSTS, X-Frame-Options
- **Rate Limiting**: Per-endpoint configurable limits

---

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---
