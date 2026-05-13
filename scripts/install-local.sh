#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ARTIFACT_DIR="${ARTIFACT_DIR:-$ROOT_DIR/artifacts}"
ARCHIVE_PATH="$ARTIFACT_DIR/mr.tar.gz"
SKIP_BUILD="${MR_LOCAL_SKIP_BUILD:-0}"

info() {
  printf '[信息] %s\n' "$1"
}

success() {
  printf '[完成] %s\n' "$1"
}

need_command() {
  command -v "$1" >/dev/null 2>&1 || {
    printf '[失败] 缺少命令: %s\n' "$1" >&2
    exit 1
  }
}

need_command npm
need_command node
need_command bash

cd "$ROOT_DIR"

if [[ -z "${MR_BIN_DIR:-}" ]]; then
  CURRENT_MR="$(command -v mr 2>/dev/null || true)"
  if [[ "$CURRENT_MR" == /* ]]; then
    export MR_BIN_DIR="${CURRENT_MR%/mr}"
    info "将替换当前 mr 命令目录: $MR_BIN_DIR"
  fi
fi

if [[ "$SKIP_BUILD" != "1" ]]; then
  info "构建本地 mr"
  npm run build
fi

info "打包本地安装产物"
ARTIFACT_DIR="$ARTIFACT_DIR" bash "$ROOT_DIR/scripts/package-release.sh"
[[ -f "$ARCHIVE_PATH" ]] || {
  printf '[失败] 没有找到本地安装产物: %s\n' "$ARCHIVE_PATH" >&2
  exit 1
}

TARBALL_URL="$(node -e "const { pathToFileURL } = require('node:url'); console.log(pathToFileURL(process.argv[1]).href)" "$ARCHIVE_PATH")"

info "使用本地包替换当前 mr: $ARCHIVE_PATH"
MR_TARBALL_URL="$TARBALL_URL" bash "$ROOT_DIR/install.sh"

success "已安装本地包。"
