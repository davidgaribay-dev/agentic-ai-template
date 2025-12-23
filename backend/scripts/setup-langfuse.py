#!/usr/bin/env python3
"""
Langfuse Auto-Setup Script

Generates secure credentials for Langfuse headless initialization and updates
the backend/.env file. When Langfuse starts, it will automatically create:
- Organization
- Project
- Admin user
- API keys

Prerequisites:
- Python 3.11+
- No external dependencies required

Usage:
    cd backend
    uv run python scripts/setup-langfuse.py

Environment variables (optional):
    LANGFUSE_INIT_USER_EMAIL - Admin email (default: admin@langfuse.local)
    LANGFUSE_INIT_ORG_NAME - Organization name (default: Default Organization)
    LANGFUSE_INIT_PROJECT_NAME - Project name (default: Default Project)
"""

import os
from pathlib import Path
import re
import secrets
import sys

# Configuration
SCRIPT_DIR = Path(__file__).parent
BACKEND_ROOT = SCRIPT_DIR.parent
PROJECT_ROOT = BACKEND_ROOT.parent
ENV_FILE = BACKEND_ROOT / ".env"


def load_env_value(key: str, default: str = "") -> str:
    """Load a value from environment or .env file."""
    if os.environ.get(key):
        return os.environ[key]

    if ENV_FILE.exists():
        content = ENV_FILE.read_text()
        match = re.search(rf"^{key}=(.*)$", content, re.MULTILINE)
        if match and match.group(1).strip():
            return match.group(1).strip()

    return default


def generate_api_key(prefix: str, length: int = 32) -> str:
    """Generate a Langfuse-style API key with prefix."""
    random_part = secrets.token_urlsafe(length)
    return f"{prefix}_{random_part}"


def generate_password(length: int = 24) -> str:
    """Generate a secure password."""
    return secrets.token_urlsafe(length)


def generate_hex_key(length: int = 32) -> str:
    """Generate a hex key for encryption."""
    return secrets.token_hex(length)


def update_env_file(updates: dict[str, str]) -> bool:
    """Update the .env file with new values."""
    if not ENV_FILE.exists():
        print(f"Error: {ENV_FILE} not found")
        return False

    content = ENV_FILE.read_text()

    for key, value in updates.items():
        # Check if key exists in file
        if re.search(rf"^{key}=", content, re.MULTILINE):
            content = re.sub(
                rf"^{key}=.*$",
                f"{key}={value}",
                content,
                flags=re.MULTILINE,
            )
        else:
            # Add to end of file
            content = content.rstrip() + f"\n{key}={value}\n"

    ENV_FILE.write_text(content)
    return True


def main():
    print("=" * 60)
    print("Langfuse Auto-Setup")
    print("=" * 60)
    print()

    # Load existing values or use defaults
    org_id = load_env_value("LANGFUSE_INIT_ORG_ID", "default-org")
    org_name = load_env_value("LANGFUSE_INIT_ORG_NAME", "Default Organization")
    project_id = load_env_value("LANGFUSE_INIT_PROJECT_ID", "default-project")
    project_name = load_env_value("LANGFUSE_INIT_PROJECT_NAME", "Default Project")
    user_email = load_env_value("LANGFUSE_INIT_USER_EMAIL", "admin@langfuse.local")
    user_name = load_env_value("LANGFUSE_INIT_USER_NAME", "Admin")

    # Check if credentials already exist
    existing_public_key = load_env_value("LANGFUSE_INIT_PROJECT_PUBLIC_KEY")
    existing_secret_key = load_env_value("LANGFUSE_INIT_PROJECT_SECRET_KEY")
    existing_password = load_env_value("LANGFUSE_INIT_USER_PASSWORD")

    if existing_public_key and existing_secret_key and existing_password:
        print("Langfuse credentials already configured!")
        print()
        print("Existing configuration:")
        print(f"  Organization: {org_name} ({org_id})")
        print(f"  Project: {project_name} ({project_id})")
        print(f"  User: {user_name} <{user_email}>")
        print(f"  Public Key: {existing_public_key[:20]}...")
        print()
        response = input("Regenerate credentials? (y/N): ").strip().lower()
        if response != "y":
            print("Keeping existing credentials.")
            return

    print("Generating Langfuse credentials...")
    print()

    # Generate new credentials
    public_key = generate_api_key("lf_pk")
    secret_key = generate_api_key("lf_sk")
    user_password = generate_password()

    # Generate server secrets if not set
    salt = load_env_value("LANGFUSE_SALT")
    encryption_key = load_env_value("LANGFUSE_ENCRYPTION_KEY")
    nextauth_secret = load_env_value("LANGFUSE_NEXTAUTH_SECRET")

    updates = {
        "LANGFUSE_INIT_PROJECT_PUBLIC_KEY": public_key,
        "LANGFUSE_INIT_PROJECT_SECRET_KEY": secret_key,
        "LANGFUSE_INIT_USER_PASSWORD": user_password,
        # Also set the backend SDK keys to match
        "LANGFUSE_PUBLIC_KEY": public_key,
        "LANGFUSE_SECRET_KEY": secret_key,
    }

    # Generate server secrets if they're placeholder values
    if not salt or salt == "0" * 64:
        updates["LANGFUSE_SALT"] = generate_hex_key(32)
        print("  Generated LANGFUSE_SALT")

    if not encryption_key or encryption_key == "0" * 64:
        updates["LANGFUSE_ENCRYPTION_KEY"] = generate_hex_key(32)
        print("  Generated LANGFUSE_ENCRYPTION_KEY")

    if not nextauth_secret or nextauth_secret == "your-nextauth-secret-change-me":
        updates["LANGFUSE_NEXTAUTH_SECRET"] = generate_password(32)
        print("  Generated LANGFUSE_NEXTAUTH_SECRET")

    print()

    # Update .env file
    if not update_env_file(updates):
        print("Failed to update .env file")
        sys.exit(1)

    print("=" * 60)
    print("Setup Complete!")
    print("=" * 60)
    print()
    print("Organization:")
    print(f"  ID:   {org_id}")
    print(f"  Name: {org_name}")
    print()
    print("Project:")
    print(f"  ID:   {project_id}")
    print(f"  Name: {project_name}")
    print()
    print("Admin User:")
    print(f"  Email:    {user_email}")
    print(f"  Name:     {user_name}")
    print(f"  Password: {user_password[:4]}{'*' * 8} (saved to .env)")
    print()
    print("API Keys (for backend SDK):")
    print(f"  Public Key:  {public_key[:20]}...")
    print(f"  Secret Key:  {secret_key[:10]}...")
    print()
    print("Next steps:")
    print("  1. Start Langfuse services:")
    print("     docker compose up -d langfuse-web")
    print()
    print("  2. Wait for Langfuse to initialize (~60 seconds)")
    print("     docker compose logs -f langfuse-web")
    print()
    print("  3. Access Langfuse UI:")
    print("     http://localhost:3001")
    print()
    print("  4. Log in with:")
    print(f"     Email: {user_email}")
    print("     Password: (see .env file)")
    print()
    print("  5. Start your backend (credentials are already configured):")
    print("     cd backend && uv run uvicorn backend.main:app --reload")
    print()
    print("=" * 60)
    print("IMPORTANT: Save the admin password above!")
    print("=" * 60)


if __name__ == "__main__":
    main()
