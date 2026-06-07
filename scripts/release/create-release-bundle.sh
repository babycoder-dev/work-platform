#!/usr/bin/env bash
set -euo pipefail

OUTPUT_DIR="${OUTPUT_DIR:-release-bundle}"
COMPOSE_FILE="${COMPOSE_FILE:-infra/docker-compose.prod.yml}"

mkdir -p "$OUTPUT_DIR"

IMAGE_TAR="$OUTPUT_DIR/work-platform-images.tar"
SOURCE_TAR="$OUTPUT_DIR/work-platform-source.tar.gz"
CHECKSUMS="$OUTPUT_DIR/SHA256SUMS.txt"

docker compose -f "$COMPOSE_FILE" build

docker save -o "$IMAGE_TAR" \
  work-platform-workbench-shell \
  work-platform-gateway-api \
  work-platform-platform-api \
  work-platform-im-adapter-api \
  work-platform-realtime-gateway \
  postgres:17 \
  redis:7

tar \
  --exclude='node_modules' \
  --exclude='.git' \
  --exclude='release-bundle' \
  -czf "$SOURCE_TAR" \
  .env.example infra docs README.md

(
  cd "$OUTPUT_DIR"
  sha256sum work-platform-images.tar work-platform-source.tar.gz > SHA256SUMS.txt
)

echo "Release bundle created at $OUTPUT_DIR"
