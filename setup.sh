#!/bin/bash

# Full-Stack AI Agent Template - Setup Script
# This script prepares the local development environment by setting up all necessary
# .env files, dependencies, and infrastructure.
# https://github.com/davidgaribay-dev/agentic-ai-template

set -e

# =============================================================================
# Colors and Formatting
# =============================================================================
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m' # No Color

# =============================================================================
# Helper Functions
# =============================================================================

print_header() {
    echo ""
    echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}${BLUE}           Full-Stack AI Agent SaaS Template Setup                   ${NC}"
    echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
}

print_step() {
    echo -e "\n${BOLD}${CYAN}[$1/$TOTAL_STEPS]${NC} ${BOLD}$2${NC}"
    echo -e "${DIM}────────────────────────────────────────────────────────────────────${NC}"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_info() {
    echo -e "${DIM}  $1${NC}"
}

# Check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Copy env file with error checking
copy_env_file() {
    local source=$1
    local destination=$2

    if [ ! -f "$source" ]; then
        print_error "Source file $source does not exist"
        return 1
    fi

    if [ -f "$destination" ]; then
        print_warning "$destination already exists (skipping)"
        return 0
    fi

    cp "$source" "$destination"
    if [ $? -eq 0 ]; then
        print_success "Created $destination"
    else
        print_error "Failed to create $destination"
        return 1
    fi
}

# Generate a secure random secret
generate_secret() {
    local length=${1:-32}
    if command_exists openssl; then
        openssl rand -hex "$length" 2>/dev/null
    elif [ -f /dev/urandom ]; then
        cat /dev/urandom | LC_ALL=C tr -dc 'a-f0-9' | head -c $((length * 2))
    else
        # Fallback - not cryptographically secure but works
        date +%s%N | sha256sum | head -c $((length * 2))
    fi
}

# Wait for a service to be healthy
wait_for_service() {
    local service=$1
    local url=$2
    local max_attempts=${3:-30}
    local attempt=1

    echo -e "${DIM}  Waiting for $service...${NC}"
    while [ $attempt -le $max_attempts ]; do
        if curl -s --fail "$url" >/dev/null 2>&1; then
            print_success "$service is ready"
            return 0
        fi
        sleep 2
        attempt=$((attempt + 1))
    done

    print_error "$service did not become ready in time"
    return 1
}

# =============================================================================
# Configuration
# =============================================================================

TOTAL_STEPS=7
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_DIR="$SCRIPT_DIR/frontend"

# Track overall success
SUCCESS=true
WARNINGS=0

# =============================================================================
# Main Setup
# =============================================================================

print_header

# =============================================================================
# Step 1: Check Prerequisites
# =============================================================================
print_step 1 "Checking prerequisites"

# Check Docker
if command_exists docker; then
    DOCKER_VERSION=$(docker --version | grep -oE '[0-9]+\.[0-9]+' | head -1)
    print_success "Docker found (v$DOCKER_VERSION)"
else
    print_error "Docker not found. Please install Docker: https://docs.docker.com/get-docker/"
    SUCCESS=false
fi

# Check Docker Compose
if docker compose version >/dev/null 2>&1; then
    COMPOSE_VERSION=$(docker compose version --short 2>/dev/null || echo "unknown")
    print_success "Docker Compose found (v$COMPOSE_VERSION)"
elif command_exists docker-compose; then
    print_warning "Found docker-compose (legacy). Consider upgrading to 'docker compose'"
else
    print_error "Docker Compose not found. Please install Docker Compose"
    SUCCESS=false
fi

# Check Python/uv
if command_exists uv; then
    UV_VERSION=$(uv --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' || echo "unknown")
    print_success "uv found (v$UV_VERSION)"
elif command_exists python3; then
    PY_VERSION=$(python3 --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+' || echo "unknown")
    print_warning "Python found (v$PY_VERSION) but uv not installed"
    print_info "Install uv: curl -LsSf https://astral.sh/uv/install.sh | sh"
    WARNINGS=$((WARNINGS + 1))
else
    print_error "Neither uv nor Python found"
    print_info "Install uv: curl -LsSf https://astral.sh/uv/install.sh | sh"
    SUCCESS=false
fi

# Check Node.js
if command_exists node; then
    NODE_VERSION=$(node --version 2>/dev/null | grep -oE '[0-9]+' | head -1)
    if [ "$NODE_VERSION" -ge 20 ]; then
        print_success "Node.js found (v$(node --version | tr -d 'v'))"
    else
        print_warning "Node.js v$(node --version) found, but v20+ recommended"
        WARNINGS=$((WARNINGS + 1))
    fi
else
    print_error "Node.js not found. Please install Node.js v20+: https://nodejs.org"
    SUCCESS=false
fi

# Check npm
if command_exists npm; then
    NPM_VERSION=$(npm --version 2>/dev/null || echo "unknown")
    print_success "npm found (v$NPM_VERSION)"
else
    print_error "npm not found"
    SUCCESS=false
fi

if [ "$SUCCESS" = false ]; then
    echo ""
    print_error "Missing required prerequisites. Please install them and run this script again."
    exit 1
fi

# =============================================================================
# Step 2: Setup Environment Files
# =============================================================================
print_step 2 "Setting up environment files"

# Backend .env
if [ -f "$BACKEND_DIR/.env.example" ]; then
    copy_env_file "$BACKEND_DIR/.env.example" "$BACKEND_DIR/.env"
else
    print_error "backend/.env.example not found"
    SUCCESS=false
fi

# Frontend .env
if [ -f "$FRONTEND_DIR/.env.example" ]; then
    copy_env_file "$FRONTEND_DIR/.env.example" "$FRONTEND_DIR/.env"
else
    print_error "frontend/.env.example not found"
    SUCCESS=false
fi

# =============================================================================
# Step 3: Generate Secrets
# =============================================================================
print_step 3 "Generating secrets for Docker services"

# Check if secrets already exist in root .env
if [ -f "$SCRIPT_DIR/.env" ]; then
    if grep -q "INFISICAL_ENCRYPTION_KEY=" "$SCRIPT_DIR/.env" 2>/dev/null; then
        print_warning "Root .env already exists with secrets (skipping generation)"
    else
        print_info "Running secret generation..."
        cd "$BACKEND_DIR"
        if command_exists uv; then
            uv run python scripts/generate_secrets.py
        else
            python3 scripts/generate_secrets.py
        fi
        cd "$SCRIPT_DIR"
    fi
else
    print_info "Running secret generation..."
    cd "$BACKEND_DIR"
    if command_exists uv; then
        uv run python scripts/generate_secrets.py
    else
        python3 scripts/generate_secrets.py
    fi
    cd "$SCRIPT_DIR"
fi

# Generate SECRET_KEY for backend if not set
if [ -f "$BACKEND_DIR/.env" ]; then
    if grep -q "SECRET_KEY=your-secret-key-change-in-production" "$BACKEND_DIR/.env" 2>/dev/null; then
        SECRET_KEY=$(generate_secret 32)
        if [ "$(uname)" = "Darwin" ]; then
            sed -i '' "s/SECRET_KEY=your-secret-key-change-in-production/SECRET_KEY=$SECRET_KEY/" "$BACKEND_DIR/.env"
        else
            sed -i "s/SECRET_KEY=your-secret-key-change-in-production/SECRET_KEY=$SECRET_KEY/" "$BACKEND_DIR/.env"
        fi
        print_success "Generated SECRET_KEY for backend"
    else
        print_info "SECRET_KEY already configured"
    fi
fi

# =============================================================================
# Step 4: Install Dependencies
# =============================================================================
print_step 4 "Installing dependencies"

# Backend dependencies
echo -e "${DIM}  Installing Python dependencies...${NC}"
cd "$BACKEND_DIR"
if command_exists uv; then
    if uv sync >/dev/null 2>&1; then
        print_success "Backend dependencies installed (uv sync)"
    else
        print_warning "Backend dependency installation had issues - run 'cd backend && uv sync' manually"
        WARNINGS=$((WARNINGS + 1))
    fi
else
    print_warning "uv not available - skipping backend dependencies"
    print_info "Run manually: cd backend && uv sync"
    WARNINGS=$((WARNINGS + 1))
fi
cd "$SCRIPT_DIR"

# Frontend dependencies
echo -e "${DIM}  Installing Node.js dependencies...${NC}"
cd "$FRONTEND_DIR"
if npm install --silent 2>/dev/null; then
    print_success "Frontend dependencies installed (npm install)"
else
    print_warning "Frontend dependency installation had issues - run 'cd frontend && npm install' manually"
    WARNINGS=$((WARNINGS + 1))
fi
cd "$SCRIPT_DIR"

# =============================================================================
# Step 5: Start Docker Services
# =============================================================================
print_step 5 "Starting Docker infrastructure"

echo -e "${DIM}  This may take a few minutes on first run...${NC}"

if docker compose up -d 2>/dev/null; then
    print_success "Docker services started"
    echo ""
    print_info "Services starting in background. Check status with: docker compose ps"
else
    print_error "Failed to start Docker services"
    print_info "Try running manually: docker compose up -d"
    SUCCESS=false
fi

# =============================================================================
# Step 6: Wait for Services & Initialize
# =============================================================================
print_step 6 "Waiting for services to be ready"

echo -e "${DIM}  This may take 1-2 minutes...${NC}"

# Wait for PostgreSQL
if wait_for_service "PostgreSQL" "localhost:5432" 30 2>/dev/null; then
    :
else
    # Can't easily check postgres via curl, so just wait
    sleep 10
    print_info "Waiting for PostgreSQL..."
fi

# Wait for services to be healthy (give them time)
sleep 15

# Check if database is accessible
if docker compose exec -T db pg_isready -U postgres >/dev/null 2>&1; then
    print_success "PostgreSQL is ready"
else
    print_warning "PostgreSQL may still be starting"
    WARNINGS=$((WARNINGS + 1))
fi

# Run migrations
echo ""
echo -e "${DIM}  Running database migrations...${NC}"
cd "$BACKEND_DIR"
if command_exists uv; then
    if uv run alembic upgrade head 2>/dev/null; then
        print_success "Database migrations complete"
    else
        print_warning "Migrations may have failed - check manually"
        WARNINGS=$((WARNINGS + 1))
    fi
fi
cd "$SCRIPT_DIR"

# Create initial superuser
echo -e "${DIM}  Creating initial superuser...${NC}"
cd "$BACKEND_DIR"
if command_exists uv; then
    if uv run python -m backend.scripts.initial_data 2>/dev/null; then
        print_success "Initial superuser created"
    else
        print_info "Superuser may already exist"
    fi
fi
cd "$SCRIPT_DIR"

# =============================================================================
# Step 7: Setup Complete
# =============================================================================
print_step 7 "Setup complete!"

echo ""
if [ "$SUCCESS" = true ]; then
    echo -e "${GREEN}${BOLD}Setup completed successfully!${NC}"
else
    echo -e "${RED}${BOLD}Setup completed with errors.${NC}"
fi

if [ $WARNINGS -gt 0 ]; then
    echo -e "${YELLOW}  ($WARNINGS warnings - see above)${NC}"
fi

echo ""
echo -e "${BOLD}Services:${NC}"
echo -e "  ${CYAN}Frontend:${NC}               http://localhost:5173"
echo -e "  ${CYAN}Backend API:${NC}            http://localhost:8000"
echo -e "  ${CYAN}API Docs (Swagger):${NC}     http://localhost:8000/v1/docs"
echo -e "  ${CYAN}Infisical:${NC}              http://localhost:8081"
echo -e "  ${CYAN}OpenSearch Dashboards:${NC}  http://localhost:5601"
echo -e "  ${CYAN}Langfuse:${NC}               http://localhost:3001"

echo ""
echo -e "${BOLD}Default Credentials:${NC}"
echo -e "  ${DIM}Superuser:${NC}  admin@example.com / changethis"
echo -e "  ${DIM}(Configure in backend/.env before first run)${NC}"

echo ""
echo -e "${BOLD}Next Steps:${NC}"
echo ""
echo -e "  ${BOLD}1.${NC} Configure your LLM API key in ${CYAN}backend/.env${NC}:"
echo -e "     ${DIM}ANTHROPIC_API_KEY=sk-ant-...${NC}"
echo -e "     ${DIM}# or OPENAI_API_KEY, GOOGLE_API_KEY${NC}"
echo ""
echo -e "  ${BOLD}2.${NC} Start the backend (in a new terminal):"
echo -e "     ${CYAN}cd backend && uv run uvicorn backend.main:app --reload${NC}"
echo ""
echo -e "  ${BOLD}3.${NC} Start the frontend (in another terminal):"
echo -e "     ${CYAN}cd frontend && npm run dev${NC}"
echo ""
echo -e "  ${BOLD}4.${NC} (Optional) Setup Infisical for org-level secrets:"
echo -e "     ${CYAN}cd backend && uv run python scripts/setup-infisical.py${NC}"
echo ""
echo -e "  ${BOLD}5.${NC} (Optional) Setup Langfuse for LLM observability:"
echo -e "     ${CYAN}cd backend && uv run python scripts/setup-langfuse.py${NC}"
echo ""

echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}Happy coding!${NC}"
echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
