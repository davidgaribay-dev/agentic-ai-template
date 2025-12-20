FROM python:3.11-slim

WORKDIR /app

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

# Copy dependency files and source code (needed for local package install)
COPY pyproject.toml uv.lock README.md ./
COPY src/ ./src/

# Install dependencies
RUN uv sync --frozen --no-dev

# Copy alembic configuration
COPY alembic.ini ./
COPY alembic/ ./alembic/

# Copy scripts
COPY scripts/ ./scripts/

# Set Python path
ENV PYTHONPATH=/app/src

# Default command
CMD ["uv", "run", "uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
