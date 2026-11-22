#!/usr/bin/env bash
# Runs a command inside the official Playwright image (WebKit/Chromium need Ubuntu libraries).
# Usage: scripts/pw-docker.sh <command...>
set -euo pipefail
cd "$(dirname "$0")/.."
exec docker run --rm --ipc=host --init \
  -v "$PWD":/work -w /work --user "$(id -u):$(id -g)" -e HOME=/tmp -e CI=1 \
  --network host \
  mcr.microsoft.com/playwright:v1.65.1-noble "$@"
