#!/bin/bash

# Run this script before starting the application
# It waits for the database to be ready, runs migrations, and creates initial data

set -e

echo "Waiting for database to be ready..."
uv run python -m backend.scripts.backend_pre_start

echo "Running database migrations..."
uv run alembic upgrade head

echo "Creating initial data..."
uv run python -m backend.scripts.initial_data

echo "Prestart completed successfully!"
