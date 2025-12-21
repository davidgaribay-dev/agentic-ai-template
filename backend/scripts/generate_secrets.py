#!/usr/bin/env python3
"""
Generate required secrets for Docker Compose services.

Updates or creates a .env file in the project root with secrets for:
- Infisical (secrets management)
- Langfuse (LLM observability)

If .env exists, only missing secrets are added. Existing values are preserved.

Usage:
    cd backend
    uv run python scripts/generate_secrets.py

    # Force regenerate all secrets (even existing ones):
    uv run python scripts/generate_secrets.py --force
"""

import argparse
import secrets
import base64
from pathlib import Path


def generate_hex_secret(length: int = 32) -> str:
    """Generate a hex-encoded secret."""
    return secrets.token_hex(length)


def generate_base64_secret(length: int = 32) -> str:
    """Generate a base64-encoded secret."""
    return base64.b64encode(secrets.token_bytes(length)).decode("utf-8")


def parse_env_file(env_file: Path) -> dict[str, str]:
    """Parse an existing .env file into a dictionary."""
    env_vars = {}
    if not env_file.exists():
        return env_vars

    for line in env_file.read_text().splitlines():
        line = line.strip()
        # Skip comments and empty lines
        if not line or line.startswith("#"):
            continue
        # Parse KEY=VALUE
        if "=" in line:
            key, _, value = line.partition("=")
            env_vars[key.strip()] = value.strip()

    return env_vars


def write_env_file(env_file: Path, env_vars: dict[str, str], secrets_keys: list[str]):
    """Write .env file, preserving existing content and adding new secrets."""
    lines = []

    # Read existing file to preserve comments and structure
    existing_lines = []
    if env_file.exists():
        existing_lines = env_file.read_text().splitlines()

    # Track which secrets we've already written (from existing file)
    written_keys = set()

    # Process existing lines, updating secret values if needed
    for line in existing_lines:
        stripped = line.strip()
        if stripped and not stripped.startswith("#") and "=" in stripped:
            key = stripped.partition("=")[0].strip()
            if key in env_vars:
                # Update the value
                lines.append(f"{key}={env_vars[key]}")
                written_keys.add(key)
            else:
                lines.append(line)
        else:
            lines.append(line)

    # Add any new secrets that weren't in the existing file
    new_secrets = [k for k in secrets_keys if k not in written_keys]
    if new_secrets:
        if lines and lines[-1] != "":
            lines.append("")
        lines.append("# Docker Compose secrets (auto-generated)")

        for key in new_secrets:
            if key in env_vars:
                lines.append(f"{key}={env_vars[key]}")

    # Ensure file ends with newline
    if lines and lines[-1] != "":
        lines.append("")

    env_file.write_text("\n".join(lines))


def main():
    parser = argparse.ArgumentParser(
        description="Generate required secrets for Docker Compose services"
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Regenerate all secrets, even if they already exist",
    )
    args = parser.parse_args()

    # Find project root (where docker-compose.yml is)
    script_dir = Path(__file__).parent
    backend_root = script_dir.parent
    project_root = backend_root.parent
    env_file = project_root / ".env"

    # Secret definitions with their generators
    secret_definitions = {
        # Infisical (required)
        "INFISICAL_ENCRYPTION_KEY": lambda: generate_hex_secret(16),  # 32 hex chars
        "INFISICAL_AUTH_SECRET": lambda: generate_base64_secret(32),
        # Langfuse (recommended)
        "LANGFUSE_NEXTAUTH_SECRET": lambda: generate_base64_secret(32),
        "LANGFUSE_SALT": lambda: generate_hex_secret(32),  # 64 hex chars
        "LANGFUSE_ENCRYPTION_KEY": lambda: generate_hex_secret(32),  # 64 hex chars
    }

    # Parse existing .env file
    existing_vars = parse_env_file(env_file)

    # Determine which secrets to generate
    updated_vars = existing_vars.copy()
    generated = []
    skipped = []

    for key, generator in secret_definitions.items():
        if args.force or key not in existing_vars or not existing_vars[key]:
            updated_vars[key] = generator()
            generated.append(key)
        else:
            skipped.append(key)

    if not generated:
        print("✅ All secrets already exist in .env")
        print()
        print("Existing secrets:")
        for key in secret_definitions:
            value = existing_vars.get(key, "")
            print(f"  {key}={value[:8]}..." if value else f"  {key}=(empty)")
        print()
        print("Use --force to regenerate all secrets.")
        return

    # Write updated .env file
    write_env_file(env_file, updated_vars, list(secret_definitions.keys()))

    print(f"✅ Updated {env_file}")
    print()

    if generated:
        print("Generated secrets:")
        for key in generated:
            value = updated_vars[key]
            print(f"  {key}={value[:8]}...")

    if skipped:
        print()
        print("Preserved existing secrets:")
        for key in skipped:
            value = existing_vars[key]
            print(f"  {key}={value[:8]}...")

    print()
    print("Next steps:")
    print("  1. Run: docker compose up -d")
    print("  2. Run: cd backend && cp .env.example .env")
    print("  3. Edit backend/.env with your configuration")


if __name__ == "__main__":
    main()
