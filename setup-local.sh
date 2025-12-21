#!/bin/bash

# Full-Stack AI Agent Template - Local Development Setup
# Starts only infrastructure services (databases, caches, observability)
# Run backend and frontend manually for hot reload development experience
#
# Usage:
#   ./setup-local.sh
#
# Then in separate terminals:
#   cd backend && uv run uvicorn backend.main:app --reload
#   cd frontend && npm run dev

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
    echo -e "${BOLD}${BLUE}        Local Development Setup (Infrastructure Only)                ${NC}"
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

command_exists() {
    command -v "$1" >/dev/null 2>&1
}

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

generate_secret() {
    local length=${1:-32}
    if command_exists openssl; then
        openssl rand -hex "$length" 2>/dev/null
    elif [ -f /dev/urandom ]; then
        cat /dev/urandom | LC_ALL=C tr -dc 'a-f0-9' | head -c $((length * 2))
    else
        date +%s%N | sha256sum | head -c $((length * 2))
    fi
}

# =============================================================================
# Configuration
# =============================================================================

TOTAL_STEPS=7
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_DIR="$SCRIPT_DIR/frontend"

SUCCESS=true
WARNINGS=0

# =============================================================================
# Main Setup
# =============================================================================

print_header

echo -e "${DIM}This script starts only infrastructure services.${NC}"
echo -e "${DIM}You'll run backend and frontend manually for hot reload.${NC}"

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
else
    print_error "Docker Compose not found"
    SUCCESS=false
fi

# Check uv (optional but recommended)
if command_exists uv; then
    UV_VERSION=$(uv --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' || echo "unknown")
    print_success "uv found (v$UV_VERSION)"
else
    print_warning "uv not found - install with: curl -LsSf https://astral.sh/uv/install.sh | sh"
    WARNINGS=$((WARNINGS + 1))
fi

# Check Node.js (optional but recommended)
if command_exists node; then
    NODE_VERSION=$(node --version 2>/dev/null | tr -d 'v')
    print_success "Node.js found (v$NODE_VERSION)"
else
    print_warning "Node.js not found - needed for frontend"
    WARNINGS=$((WARNINGS + 1))
fi

if [ "$SUCCESS" = false ]; then
    echo ""
    print_error "Missing required prerequisites (Docker). Please install and try again."
    exit 1
fi

# =============================================================================
# Step 2: Setup Environment Files
# =============================================================================
print_step 2 "Setting up environment files"

# Backend .env
if [ -f "$BACKEND_DIR/.env.example" ]; then
    copy_env_file "$BACKEND_DIR/.env.example" "$BACKEND_DIR/.env"
fi

# Frontend .env
if [ -f "$FRONTEND_DIR/.env.example" ]; then
    copy_env_file "$FRONTEND_DIR/.env.example" "$FRONTEND_DIR/.env"
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
            uv run python scripts/generate_secrets.py 2>/dev/null || python3 scripts/generate_secrets.py
        else
            python3 scripts/generate_secrets.py
        fi
        cd "$SCRIPT_DIR"
    fi
else
    print_info "Running secret generation..."
    cd "$BACKEND_DIR"
    if command_exists uv; then
        uv run python scripts/generate_secrets.py 2>/dev/null || python3 scripts/generate_secrets.py
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
# Step 4: Start Infrastructure Services
# =============================================================================
print_step 4 "Starting infrastructure services"

echo -e "${DIM}  Starting databases, caches, and observability tools...${NC}"
echo -e "${DIM}  (Backend and frontend are NOT started - run them manually)${NC}"
echo ""

if docker compose -f docker-compose-local.yml up -d 2>/dev/null; then
    print_success "Infrastructure services started"
    echo ""

    # List running services
    echo -e "${DIM}  Running containers:${NC}"
    docker compose -f docker-compose-local.yml ps --format "table {{.Name}}\t{{.Status}}" 2>/dev/null | tail -n +2 | while read line; do
        echo -e "${DIM}    $line${NC}"
    done
else
    print_error "Failed to start Docker services"
    print_info "Try running manually: docker compose -f docker-compose-local.yml up -d"
    SUCCESS=false
fi

# =============================================================================
# Step 5: Wait for Database and Run Migrations
# =============================================================================
print_step 5 "Initializing database"

echo -e "${DIM}  Waiting for PostgreSQL to be ready...${NC}"
sleep 10

# Check if database is accessible
if docker compose -f docker-compose-local.yml exec -T db pg_isready -U postgres >/dev/null 2>&1; then
    print_success "PostgreSQL is ready"
else
    print_warning "PostgreSQL may still be starting - wait a moment before running migrations"
    WARNINGS=$((WARNINGS + 1))
fi

# Run migrations if uv is available
if command_exists uv; then
    echo -e "${DIM}  Running database migrations...${NC}"
    cd "$BACKEND_DIR"
    if uv run alembic upgrade head 2>/dev/null; then
        print_success "Database migrations complete"
    else
        print_warning "Migrations may have failed - run manually: cd backend && uv run alembic upgrade head"
        WARNINGS=$((WARNINGS + 1))
    fi

    echo -e "${DIM}  Creating initial superuser...${NC}"
    if uv run python -m backend.scripts.initial_data 2>/dev/null; then
        print_success "Initial superuser created"
    else
        print_info "Superuser may already exist"
    fi
    cd "$SCRIPT_DIR"
else
    print_warning "uv not available - run migrations manually after installing dependencies"
    WARNINGS=$((WARNINGS + 1))
fi

# =============================================================================
# Step 6: Initialize OpenSearch Dashboards
# =============================================================================
print_step 6 "Initializing OpenSearch dashboards"

echo -e "${DIM}  Waiting for OpenSearch Dashboards to be healthy...${NC}"

# Wait for OpenSearch Dashboards to be healthy (up to 2 minutes)
OPENSEARCH_READY=false
for i in {1..24}; do
    if curl -s "http://localhost:5601/api/status" 2>/dev/null | grep -q '"state":"green"'; then
        OPENSEARCH_READY=true
        break
    fi
    sleep 5
done

if [ "$OPENSEARCH_READY" = true ]; then
    print_success "OpenSearch Dashboards is ready"

    if command_exists uv; then
        echo -e "${DIM}  Creating index patterns and dashboards...${NC}"
        cd "$BACKEND_DIR"
        if uv run python -m backend.scripts.init_opensearch 2>/dev/null; then
            print_success "OpenSearch dashboards initialized"
        else
            print_warning "OpenSearch init had issues - run manually: cd backend && uv run python -m backend.scripts.init_opensearch"
            WARNINGS=$((WARNINGS + 1))
        fi
        cd "$SCRIPT_DIR"
    else
        print_warning "uv not available - run OpenSearch init manually"
        WARNINGS=$((WARNINGS + 1))
    fi
else
    print_warning "OpenSearch Dashboards not ready yet - run init manually later:"
    print_info "cd backend && uv run python -m backend.scripts.init_opensearch"
    WARNINGS=$((WARNINGS + 1))
fi

# =============================================================================
# Step 7: Setup Infisical and Langfuse
# =============================================================================
print_step 7 "Setting up Infisical and Langfuse"

echo -e "${DIM}  Waiting for Infisical to be healthy...${NC}"

INFISICAL_READY=false
for i in {1..24}; do
    if curl -s "http://localhost:8081/api/status" >/dev/null 2>&1; then
        INFISICAL_READY=true
        break
    fi
    sleep 5
done

# Check if Infisical is actually bootstrapped by trying the bootstrap endpoint
# If it returns "already bootstrapped", we know it's set up
INFISICAL_BOOTSTRAPPED=false
INFISICAL_CONFIGURED=false

if [ "$INFISICAL_READY" = true ]; then
    # Check if bootstrap is needed by looking for the setup screen indicator
    BOOTSTRAP_STATUS=$(curl -s "http://localhost:8081/api/v1/admin/bootstrap" -X POST -H "Content-Type: application/json" -d '{}' 2>/dev/null || echo "error")
    if echo "$BOOTSTRAP_STATUS" | grep -qi "already\|exist\|unauthorized"; then
        INFISICAL_BOOTSTRAPPED=true
    fi

    # Also check if we have valid credentials in .env
    if [ -f "$BACKEND_DIR/.env" ]; then
        if grep -q "INFISICAL_CLIENT_ID=." "$BACKEND_DIR/.env" 2>/dev/null; then
            INFISICAL_CONFIGURED=true
        fi
    fi
fi

if [ "$INFISICAL_READY" = true ]; then
    print_success "Infisical is ready"

    if [ "$INFISICAL_BOOTSTRAPPED" = true ] && [ "$INFISICAL_CONFIGURED" = true ]; then
        print_info "Infisical already configured (skipping)"
    elif [ "$INFISICAL_BOOTSTRAPPED" = true ] && [ "$INFISICAL_CONFIGURED" = false ]; then
        # Bootstrapped but no credentials - need manual setup or credentials were lost
        print_warning "Infisical is bootstrapped but credentials missing from .env"
        print_info "Log in at http://localhost:8081 and create a machine identity manually"
        print_info "Or reset with: docker compose -f docker-compose-local.yml down -v && ./setup-local.sh"
        WARNINGS=$((WARNINGS + 1))
    else
        # Not bootstrapped - run setup
        if command_exists uv; then
            echo -e "${DIM}  Running Infisical setup (creating admin + machine identity)...${NC}"
            cd "$BACKEND_DIR"
            if uv run python scripts/setup-infisical.py 2>&1 | tail -10; then
                print_success "Infisical configured"
                INFISICAL_CONFIGURED=true
                INFISICAL_BOOTSTRAPPED=true
            else
                print_warning "Infisical setup had issues - run manually: cd backend && uv run python scripts/setup-infisical.py"
                WARNINGS=$((WARNINGS + 1))
            fi
            cd "$SCRIPT_DIR"
        fi
    fi
else
    print_warning "Infisical not ready - run setup manually later:"
    print_info "cd backend && uv run python scripts/setup-infisical.py"
    WARNINGS=$((WARNINGS + 1))
fi

# Check if Langfuse credentials already configured
LANGFUSE_CONFIGURED=false
if [ -f "$BACKEND_DIR/.env" ]; then
    if grep -q "LANGFUSE_PUBLIC_KEY=lf_pk_" "$BACKEND_DIR/.env" 2>/dev/null; then
        LANGFUSE_CONFIGURED=true
    fi
fi

if [ "$LANGFUSE_CONFIGURED" = true ]; then
    print_info "Langfuse already configured (skipping)"
else
    if command_exists uv; then
        echo -e "${DIM}  Running Langfuse setup...${NC}"
        cd "$BACKEND_DIR"
        # Run setup-langfuse non-interactively by piping 'n' for no regenerate
        if echo "n" | uv run python scripts/setup-langfuse.py 2>&1 | grep -E "(Generated|Public Key|Secret Key|complete)" | head -5; then
            print_success "Langfuse configured"
        else
            print_warning "Langfuse setup had issues - run manually: cd backend && uv run python scripts/setup-langfuse.py"
            WARNINGS=$((WARNINGS + 1))
        fi
        cd "$SCRIPT_DIR"
    fi
fi

# =============================================================================
# Summary
# =============================================================================

echo ""
echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

if [ "$SUCCESS" = true ]; then
    echo -e "${GREEN}${BOLD}Infrastructure is ready!${NC}"
else
    echo -e "${RED}${BOLD}Setup completed with errors.${NC}"
fi

if [ $WARNINGS -gt 0 ]; then
    echo -e "${YELLOW}  ($WARNINGS warnings - see above)${NC}"
fi

echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

echo ""
echo -e "${BOLD}Infrastructure Services:${NC}"
echo -e "  ${CYAN}PostgreSQL:${NC}             localhost:5432"
echo -e "  ${CYAN}SeaweedFS (S3):${NC}         localhost:8333"
echo -e "  ${CYAN}Infisical:${NC}              http://localhost:8081"
echo -e "  ${CYAN}OpenSearch:${NC}             http://localhost:9200"
echo -e "  ${CYAN}OpenSearch Dashboards:${NC}  http://localhost:5601"
echo -e "  ${CYAN}Langfuse:${NC}               http://localhost:3001"

echo ""
echo -e "${BOLD}Now start your dev servers:${NC}"
echo ""
echo -e "  ${BOLD}Terminal 1 - Backend:${NC}"
echo -e "  ${CYAN}cd backend && uv run uvicorn backend.main:app --reload${NC}"
echo ""
echo -e "  ${BOLD}Terminal 2 - Frontend:${NC}"
echo -e "  ${CYAN}cd frontend && npm run dev${NC}"
echo ""

echo -e "${BOLD}Quick Commands:${NC}"
echo -e "  ${DIM}Stop services:${NC}    docker compose -f docker-compose-local.yml down"
echo -e "  ${DIM}View logs:${NC}        docker compose -f docker-compose-local.yml logs -f"
echo -e "  ${DIM}Reset data:${NC}       docker compose -f docker-compose-local.yml down -v"
echo ""

echo -e "${BOLD}Service Status:${NC}"
if [ "$INFISICAL_BOOTSTRAPPED" = true ] && [ "$INFISICAL_CONFIGURED" = true ]; then
    echo -e "  ${GREEN}✓${NC} Infisical: Configured (machine identity created)"
elif [ "$INFISICAL_BOOTSTRAPPED" = true ]; then
    echo -e "  ${YELLOW}⚠${NC} Infisical: Bootstrapped but credentials missing - check .env or reset"
else
    echo -e "  ${YELLOW}⚠${NC} Infisical: Run ${DIM}cd backend && uv run python scripts/setup-infisical.py${NC}"
fi
if [ "$LANGFUSE_CONFIGURED" = true ]; then
    echo -e "  ${GREEN}✓${NC} Langfuse: Configured (API keys generated)"
else
    echo -e "  ${YELLOW}⚠${NC} Langfuse: Run ${DIM}cd backend && uv run python scripts/setup-langfuse.py${NC}"
fi
if [ "$OPENSEARCH_READY" = true ]; then
    echo -e "  ${GREEN}✓${NC} OpenSearch: Dashboards initialized"
else
    echo -e "  ${YELLOW}⚠${NC} OpenSearch: Run ${DIM}cd backend && uv run python -m backend.scripts.init_opensearch${NC}"
fi
echo ""

echo -e "${BOLD}Don't forget to:${NC}"
echo -e "  1. Add an LLM API key to ${CYAN}backend/.env${NC} (ANTHROPIC_API_KEY, etc.)"
echo -e "  2. Install dependencies if needed:"
echo -e "     ${DIM}cd backend && uv sync${NC}"
echo -e "     ${DIM}cd frontend && npm install${NC}"
echo ""
