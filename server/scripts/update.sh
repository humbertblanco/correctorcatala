#!/usr/bin/env bash
# Pull latest images and recreate containers.
set -euo pipefail

cd "$(dirname "$0")/.."

echo ">> Pulling new images..."
docker compose pull

echo ">> Recreating containers..."
docker compose up -d

echo ">> Pruning old images..."
docker image prune -f >/dev/null

echo ">> Update complete. Versions:"
docker compose images
