#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ARTIFACT_DIR="${ARTIFACT_DIR:-$ROOT_DIR/artifacts}"
PACKAGE_DIR="$ARTIFACT_DIR/mr"
ARCHIVE_PATH="$ARTIFACT_DIR/mr.tar.gz"
CHECKSUM_PATH="$ARTIFACT_DIR/mr.sha256"

rm -rf "$PACKAGE_DIR" "$ARCHIVE_PATH" "$CHECKSUM_PATH"
mkdir -p "$PACKAGE_DIR/dist"

cp -R "$ROOT_DIR/dist/." "$PACKAGE_DIR/dist/"
cp "$ROOT_DIR/package.json" "$PACKAGE_DIR/package.json"
cp "$ROOT_DIR/README.md" "$PACKAGE_DIR/README.md"
cp "$ROOT_DIR/install.sh" "$PACKAGE_DIR/install.sh"
cp "$ROOT_DIR/uninstall.sh" "$PACKAGE_DIR/uninstall.sh"

chmod +x "$PACKAGE_DIR/dist/index.js"
chmod +x "$PACKAGE_DIR/install.sh"
chmod +x "$PACKAGE_DIR/uninstall.sh"

tar -czf "$ARCHIVE_PATH" -C "$ARTIFACT_DIR" mr

if command -v shasum >/dev/null 2>&1; then
  (cd "$ARTIFACT_DIR" && shasum -a 256 mr.tar.gz > mr.sha256)
elif command -v sha256sum >/dev/null 2>&1; then
  (cd "$ARTIFACT_DIR" && sha256sum mr.tar.gz > mr.sha256)
else
  printf 'Missing shasum or sha256sum.\n' >&2
  exit 1
fi

printf 'Created %s\n' "$ARCHIVE_PATH"
printf 'Created %s\n' "$CHECKSUM_PATH"
