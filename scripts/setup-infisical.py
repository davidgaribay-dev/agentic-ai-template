#!/usr/bin/env python3
"""
Infisical Auto-Setup Script (Pure Python/API)

Automatically bootstraps Infisical and configures backend/.env without needing
the Infisical CLI. Uses only REST API calls.

Prerequisites:
- Docker Compose services running (infisical, infisical-db, infisical-redis)
- Python 3.11+ with requests library (included in backend dependencies)

Usage:
    cd template
    uv run python scripts/setup-infisical.py

Or with custom settings:
    INFISICAL_ADMIN_EMAIL=admin@example.com \
    INFISICAL_ADMIN_PASSWORD=mysecretpassword \
    uv run python scripts/setup-infisical.py
"""

import os
import re
import secrets
import sys
import time
from pathlib import Path

try:
    import requests
except ImportError:
    print("Error: requests library not installed.")
    print("Run: pip install requests")
    print("Or: cd backend && uv run python ../scripts/setup-infisical.py")
    sys.exit(1)

# Configuration
SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent
ENV_FILE = PROJECT_ROOT / "backend" / ".env"


def load_env_value(key: str, default: str = "") -> str:
    """Load a value from environment or .env file."""
    # Check environment first
    if key in os.environ and os.environ[key]:
        return os.environ[key]

    # Try to read from .env file
    if ENV_FILE.exists():
        content = ENV_FILE.read_text()
        match = re.search(rf"^{key}=(.*)$", content, re.MULTILINE)
        if match and match.group(1).strip():
            return match.group(1).strip()

    return default


# Load configuration from .env or environment
INFISICAL_URL = load_env_value("INFISICAL_URL", "http://localhost:8081")
ADMIN_EMAIL = load_env_value("INFISICAL_ADMIN_EMAIL", "admin@infisical.local")
ADMIN_PASSWORD = load_env_value("INFISICAL_ADMIN_PASSWORD", secrets.token_urlsafe(24))
ORG_NAME = load_env_value("INFISICAL_ORG_NAME", "my-organization")
PROJECT_NAME = load_env_value("INFISICAL_PROJECT_NAME", "api-keys")


def wait_for_infisical(timeout: int = 120) -> bool:
    """Wait for Infisical to be ready."""
    print(f"Waiting for Infisical at {INFISICAL_URL}...")

    for i in range(timeout // 2):
        try:
            resp = requests.get(f"{INFISICAL_URL}/api/status", timeout=5)
            if resp.status_code == 200:
                print("✓ Infisical is ready")
                return True
        except requests.exceptions.RequestException:
            pass

        print(f"  Attempt {i + 1}/{timeout // 2} - waiting...")
        time.sleep(2)

    print("Error: Infisical did not become ready in time.")
    print("Make sure to run: docker compose up -d infisical-db infisical-redis infisical")
    return False


def bootstrap_infisical() -> dict | None:
    """Bootstrap Infisical instance using REST API."""
    print("\nBootstrapping Infisical...")
    print(f"  Admin Email: {ADMIN_EMAIL}")
    print(f"  Organization: {ORG_NAME}")

    try:
        resp = requests.post(
            f"{INFISICAL_URL}/api/v1/admin/bootstrap",
            json={
                "email": ADMIN_EMAIL,
                "password": ADMIN_PASSWORD,
                "organization": ORG_NAME,
            },
            timeout=30,
        )

        if resp.status_code == 200:
            result = resp.json()
            print("✓ Bootstrap complete")
            return result
        elif resp.status_code == 400 and "already" in resp.text.lower():
            print("⚠ Infisical already bootstrapped")
            print("\nTo complete setup manually:")
            print(f"  1. Go to {INFISICAL_URL}")
            print("  2. Log in with your admin account")
            print("  3. Create a project and machine identity")
            print("  4. Update backend/.env with the credentials")
            return None
        else:
            print(f"Error: Bootstrap failed with status {resp.status_code}")
            print(f"Response: {resp.text}")
            return None

    except requests.exceptions.RequestException as e:
        print(f"Error: Bootstrap request failed: {e}")
        return None


def create_project(token: str, org_id: str) -> str | None:
    """Create a project in Infisical."""
    print(f"\nCreating project '{PROJECT_NAME}'...")

    headers = {"Authorization": f"Bearer {token}"}

    try:
        resp = requests.post(
            f"{INFISICAL_URL}/api/v2/workspace",
            headers=headers,
            json={"projectName": PROJECT_NAME, "organizationId": org_id},
            timeout=30,
        )

        if resp.status_code in (200, 201):
            result = resp.json()
            project_id = result.get("project", {}).get("id") or result.get("workspace", {}).get("id")
            if project_id:
                print(f"✓ Project created: {project_id}")
                return project_id

        print(f"Warning: Could not create project. Status: {resp.status_code}")
        print(f"Response: {resp.text}")
        return None

    except requests.exceptions.RequestException as e:
        print(f"Error creating project: {e}")
        return None


def create_machine_identity(token: str, org_id: str) -> tuple[str, str, str] | None:
    """Create a machine identity with universal auth."""
    print("\nCreating machine identity...")

    headers = {"Authorization": f"Bearer {token}"}

    try:
        # Create identity
        resp = requests.post(
            f"{INFISICAL_URL}/api/v1/identities",
            headers=headers,
            json={"name": "backend-service", "organizationId": org_id, "role": "admin"},
            timeout=30,
        )

        if resp.status_code not in (200, 201):
            print(f"Warning: Could not create identity. Status: {resp.status_code}")
            print(f"Response: {resp.text}")
            return None

        identity_id = resp.json().get("identity", {}).get("id")
        if not identity_id:
            print("Warning: No identity ID in response")
            return None

        print(f"✓ Machine identity created: {identity_id}")

        # Set up universal auth
        print("Setting up universal auth...")
        resp = requests.post(
            f"{INFISICAL_URL}/api/v1/auth/universal-auth/identities/{identity_id}",
            headers=headers,
            json={
                "accessTokenTrustedIps": [{"ipAddress": "0.0.0.0/0"}],
                "accessTokenTTL": 2592000,  # 30 days
            },
            timeout=30,
        )

        if resp.status_code not in (200, 201):
            print(f"Warning: Could not set up universal auth. Status: {resp.status_code}")
            return None

        client_id = resp.json().get("identityUniversalAuth", {}).get("clientId")

        # Create client secret
        resp = requests.post(
            f"{INFISICAL_URL}/api/v1/auth/universal-auth/identities/{identity_id}/client-secrets",
            headers=headers,
            json={"description": "Backend service secret"},
            timeout=30,
        )

        if resp.status_code not in (200, 201):
            print(f"Warning: Could not create client secret. Status: {resp.status_code}")
            return None

        client_secret = resp.json().get("clientSecret")

        if client_id and client_secret:
            print(f"✓ Universal auth configured")
            print(f"  Client ID: {client_id}")
            print(f"  Client Secret: {client_secret[:10]}...")
            return identity_id, client_id, client_secret

        return None

    except requests.exceptions.RequestException as e:
        print(f"Error creating machine identity: {e}")
        return None


def add_identity_to_project(token: str, project_id: str, identity_id: str) -> bool:
    """Add machine identity to project with admin role."""
    print("\nAdding identity to project...")

    headers = {"Authorization": f"Bearer {token}"}

    try:
        resp = requests.post(
            f"{INFISICAL_URL}/api/v2/workspace/{project_id}/identity-memberships/{identity_id}",
            headers=headers,
            json={"role": "admin"},
            timeout=30,
        )

        if resp.status_code in (200, 201):
            print("✓ Identity added to project")
            return True
        else:
            print(f"Warning: Could not add identity to project. Status: {resp.status_code}")
            return False

    except requests.exceptions.RequestException as e:
        print(f"Error adding identity to project: {e}")
        return False


def update_env_file(client_id: str, client_secret: str, project_id: str) -> bool:
    """Update the .env file with Infisical credentials."""
    print(f"\nUpdating {ENV_FILE}...")

    if not ENV_FILE.exists():
        print(f"Error: {ENV_FILE} not found")
        return False

    content = ENV_FILE.read_text()

    # Update values
    content = re.sub(
        r"^INFISICAL_CLIENT_ID=.*$",
        f"INFISICAL_CLIENT_ID={client_id}",
        content,
        flags=re.MULTILINE,
    )
    content = re.sub(
        r"^INFISICAL_CLIENT_SECRET=.*$",
        f"INFISICAL_CLIENT_SECRET={client_secret}",
        content,
        flags=re.MULTILINE,
    )
    content = re.sub(
        r"^INFISICAL_PROJECT_ID=.*$",
        f"INFISICAL_PROJECT_ID={project_id}",
        content,
        flags=re.MULTILINE,
    )

    ENV_FILE.write_text(content)
    print("✓ Environment file updated")
    return True


def print_summary(client_id: str, client_secret: str, project_id: str):
    """Print setup summary."""
    print("\n" + "=" * 50)
    print("Setup Complete!")
    print("=" * 50)
    print()
    print("Infisical Admin:")
    print(f"  URL: {INFISICAL_URL}")
    print(f"  Email: {ADMIN_EMAIL}")
    print(f"  Password: {ADMIN_PASSWORD}")
    print()
    print(f"Backend Configuration (in {ENV_FILE}):")
    print(f"  INFISICAL_CLIENT_ID={client_id}")
    print(f"  INFISICAL_CLIENT_SECRET={client_secret[:10]}...")
    print(f"  INFISICAL_PROJECT_ID={project_id}")
    print()
    print("Next steps:")
    print("  1. Restart your backend to pick up the new credentials")
    print("  2. Go to Org Settings > API Keys to manage LLM API keys")
    print()
    print("⚠ IMPORTANT: Save the admin password above - you'll need it to log into Infisical!")


def print_manual_instructions():
    """Print manual setup instructions."""
    print("\n" + "=" * 50)
    print("Manual Setup Required")
    print("=" * 50)
    print()
    print("Some automated steps failed. Please complete setup manually:")
    print()
    print(f"1. Go to {INFISICAL_URL}")
    print(f"2. Log in with: {ADMIN_EMAIL} / {ADMIN_PASSWORD}")
    print(f"3. Create a project named '{PROJECT_NAME}'")
    print("4. Go to Project Settings > Machine Identities")
    print("5. Create a new identity with Universal Auth")
    print("6. Copy Client ID, Client Secret, and Project ID to backend/.env")


def main():
    print("=" * 50)
    print("Infisical Auto-Setup (Python API)")
    print("=" * 50)
    print()

    # Wait for Infisical
    if not wait_for_infisical():
        sys.exit(1)

    # Bootstrap
    bootstrap_result = bootstrap_infisical()
    if not bootstrap_result:
        sys.exit(1)

    # Extract values from bootstrap
    token = bootstrap_result.get("identity", {}).get("credentials", {}).get("token")
    org_id = bootstrap_result.get("organization", {}).get("id")

    if not token or not org_id:
        print("Error: Could not extract token or org_id from bootstrap result")
        sys.exit(1)

    print(f"  Organization ID: {org_id}")

    # Create project
    project_id = create_project(token, org_id)
    if not project_id:
        print_manual_instructions()
        sys.exit(1)

    # Create machine identity
    identity_result = create_machine_identity(token, org_id)
    if not identity_result:
        print_manual_instructions()
        sys.exit(1)

    identity_id, client_id, client_secret = identity_result

    # Add identity to project
    add_identity_to_project(token, project_id, identity_id)

    # Update .env file
    if update_env_file(client_id, client_secret, project_id):
        print_summary(client_id, client_secret, project_id)
    else:
        print_manual_instructions()
        sys.exit(1)


if __name__ == "__main__":
    main()
