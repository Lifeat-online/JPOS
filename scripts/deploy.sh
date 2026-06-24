#!/usr/bin/env bash
# deploy.sh — Reliable production deploy for MasePOS
# Usage: ./scripts/deploy.sh [--skip-build]
# Requires: SSH access to masepos.co.za, Docker on remote

set -euo pipefail

REMOTE_HOST="${DEPLOY_HOST:-root@masepos.co.za}"
REMOTE_NETWORK="coolify"
IMAGE_NAME="masepos-app"
TRAEFIK_LABELS=(
    "traefik.enable=true"
    "traefik.http.middlewares.gzip.compress=true"
    "traefik.http.middlewares.redirect-to-https.redirectscheme.scheme=https"
    "traefik.http.routers.http-0-masepos.entryPoints=http"
    "traefik.http.routers.http-0-masepos.middlewares=redirect-to-https"
    "traefik.http.routers.http-0-masepos.rule=Host(\`masepos.co.za\`) && PathPrefix(\`/\`)"
    "traefik.http.routers.http-0-masepos.service=http-0-masepos"
    "traefik.http.routers.https-0-masepos.entryPoints=https"
    "traefik.http.routers.https-0-masepos.middlewares=gzip"
    "traefik.http.routers.https-0-masepos.rule=Host(\`masepos.co.za\`) && PathPrefix(\`/\`)"
    "traefik.http.routers.https-0-masepos.service=https-0-masepos"
    "traefik.http.routers.https-0-masepos.tls=true"
    "traefik.http.routers.https-0-masepos.tls.certresolver=letsencrypt"
    "traefik.http.services.http-0-masepos.loadbalancer.server.port=3000"
    "traefik.http.services.https-0-masepos.loadbalancer.server.port=3000"
)

echo "=== MasePOS Deploy ==="

# Step 1: Build
if [[ "${1:-}" != "--skip-build" ]]; then
    echo "[1/3] Building Docker image..."
    docker build -t "$IMAGE_NAME:latest" -t "$IMAGE_NAME:$(git rev-parse --short HEAD)" .
    echo "   ✓ Built $IMAGE_NAME:$(git rev-parse --short HEAD)"
else
    echo "[1/3] Skipping build (--skip-build)"
fi

# Step 2: Push image to remote
echo "[2/3] Pushing image to remote server..."
docker save "$IMAGE_NAME:latest" | gzip | ssh "$REMOTE_HOST" "gunzip | docker load"
echo "   ✓ Image pushed"

# Step 3: Restart container
echo "[3/3] Restarting container..."
LABEL_ARGS=""
for label in "${TRAEFIK_LABELS[@]}"; do
    LABEL_ARGS="$LABEL_ARGS -l '$label'"
done

ssh "$REMOTE_HOST" << 'REMOTE_SCRIPT'
set -e

IMAGE="masepos-app:latest"
CONTAINER="masepos-app"
NETWORK="coolify"

# Stop existing container (if any)
docker stop "$CONTAINER" 2>/dev/null || true
docker rm "$CONTAINER" 2>/dev/null || true

# Read secrets from the existing Coolify .env file
ENV_FILE="/data/coolify/applications/mkbgv2fpxb35n5z9kpe2hrm6/.env"
if [ -f "$ENV_FILE" ]; then
    ENV_ARGS=$(grep -v '^#' "$ENV_FILE" | grep '=' | sed 's/^/-e /' | tr '\n' ' ')
else
    echo "WARNING: .env file not found at $ENV_FILE"
    ENV_ARGS=""
fi

docker run -d --name "$CONTAINER" --network "$NETWORK" --restart unless-stopped \
    -l traefik.enable=true \
    -l 'traefik.http.middlewares.gzip.compress=true' \
    -l 'traefik.http.middlewares.redirect-to-https.redirectscheme.scheme=https' \
    -l 'traefik.http.routers.http-0-masepos.entryPoints=http' \
    -l 'traefik.http.routers.http-0-masepos.middlewares=redirect-to-https' \
    -l 'traefik.http.routers.http-0-masepos.rule=Host(`masepos.co.za`) && PathPrefix(`/`)' \
    -l 'traefik.http.routers.http-0-masepos.service=http-0-masepos' \
    -l 'traefik.http.routers.https-0-masepos.entryPoints=https' \
    -l 'traefik.http.routers.https-0-masepos.middlewares=gzip' \
    -l 'traefik.http.routers.https-0-masepos.rule=Host(`masepos.co.za`) && PathPrefix(`/`)' \
    -l 'traefik.http.routers.https-0-masepos.service=https-0-masepos' \
    -l 'traefik.http.routers.https-0-masepos.tls=true' \
    -l 'traefik.http.routers.https-0-masepos.tls.certresolver=letsencrypt' \
    -l 'traefik.http.services.http-0-masepos.loadbalancer.server.port=3000' \
    -l 'traefik.http.services.https-0-masepos.loadbalancer.server.port=3000' \
    $ENV_ARGS \
    "$IMAGE"

echo "   ✓ Container restarted"

# Wait for health
sleep 8
if curl -sf https://masepos.co.za/api/health > /dev/null; then
    echo "   ✓ Health check passed"
else
    echo "   ⚠ Health check failed — check logs: docker logs $CONTAINER"
fi
REMOTE_SCRIPT

echo "=== Deploy complete ==="
