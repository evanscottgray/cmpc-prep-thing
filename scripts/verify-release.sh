#!/usr/bin/env bash
# Verifies that a clean build from a git ref reproduces the committed dist/ byte-for-byte.
# Usage: scripts/verify-release.sh [ref]   (default: the tag for package.json's version)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REF="${1:-v$(cd "$ROOT" && node -p "require('./package.json').version")}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
git clone -q --no-local "$ROOT" "$TMP/src"
cd "$TMP/src" && git checkout -q "$REF"
npm ci --silent --no-audit --no-fund >/dev/null
mv dist "$TMP/committed-dist"
npm run build --silent >/dev/null
if diff -r "$TMP/committed-dist" dist >/dev/null; then
  echo "OK: clean build of $REF reproduces committed dist/ ($(find dist -type f | wc -l) files)"
  status=0
else
  echo "MISMATCH: clean build of $REF differs from committed dist/"; diff -rq "$TMP/committed-dist" dist || true
  status=1
fi
cd "$ROOT"
exit $status
