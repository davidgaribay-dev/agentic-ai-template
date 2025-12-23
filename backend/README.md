# Backend

FastAPI backend with LangGraph AI agents and RAG (Retrieval Augmented Generation) system.

## Quick Links

- **[RAG Quick Start](RAG_QUICKSTART.md)** - Get started with document search in 5 minutes
- **[RAG Implementation](RAG_IMPLEMENTATION.md)** - Complete technical documentation
- **[RAG Completion Summary](RAG_COMPLETION_SUMMARY.md)** - Implementation details and status

## Development Setup

### Install Dependencies

```bash
# Install all dependencies including dev tools
uv sync --all-extras --dev
```

### Code Quality Tools

This project uses comprehensive tooling to ensure code quality:

#### Ruff - Linting & Formatting

```bash
# Run linter (with auto-fix)
uv run ruff check . --fix

# Check formatting
uv run ruff format --check .

# Auto-format code
uv run ruff format .
```

#### MyPy - Type Checking

```bash
# Run type checker
uv run mypy src/backend
```

#### Bandit - Security Scanning

```bash
# Scan for security issues
uv run bandit -r src/backend
```

#### Pytest - Testing with Coverage

```bash
# Run tests with coverage report
uv run pytest

# Run with detailed coverage
uv run pytest --cov --cov-report=html

# View coverage report
open htmlcov/index.html
```

### Pre-commit Hooks

We use pre-commit hooks to automatically check code quality before commits:

```bash
# Install pre-commit hooks (one-time setup)
uv run pre-commit install

# Manually run all hooks
uv run pre-commit run --all-files

# Update hooks to latest versions
uv run pre-commit autoupdate
```

Pre-commit will automatically run:
- Trailing whitespace removal
- End-of-file fixes
- YAML/JSON/TOML validation
- Large file detection
- Private key detection
- **Gitleaks** - Secret scanning
- **Ruff** - Linting and formatting
- **MyPy** - Type checking

### Running All Checks Locally

```bash
# Run all quality checks (mimics CI)
uv run ruff check . && \
uv run ruff format --check . && \
uv run mypy src/backend && \
uv run pytest --cov

# Auto-fix issues where possible
uv run ruff check . --fix && \
uv run ruff format .
```

## CI/CD

GitHub Actions automatically runs on every push and pull request:

1. **Lint and Type Check** - Ruff linting, formatting, and MyPy type checking
2. **Security Scan** - Gitleaks secret detection and Bandit security analysis
3. **Build Check** - Ensures package builds successfully

See [.github/workflows/backend-ci.yml](../.github/workflows/backend-ci.yml) for details.

## Configuration

All tool configurations are in [pyproject.toml](pyproject.toml):

- **Ruff**: ~800 lint rules enabled (see `tool.ruff.lint.select`)
- **MyPy**: Strict mode with Pydantic plugin
- **Pytest**: Auto-coverage reporting with 85% target
- **Coverage**: Excludes test files, alembic migrations, and scripts

## Best Practices

1. **Run pre-commit before pushing** - Catches issues early
2. **Fix type errors** - MyPy strict mode is enabled
3. **Maintain test coverage** - Aim for >85% coverage
4. **No secrets in code** - Gitleaks will block commits with secrets
5. **Use Ruff auto-fix** - Most lint issues can be auto-fixed with `--fix`
