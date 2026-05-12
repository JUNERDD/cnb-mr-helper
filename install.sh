#!/usr/bin/env bash
set -euo pipefail

REPO_OWNER="${MR_REPO_OWNER:-JUNERDD}"
REPO_NAME="${MR_REPO_NAME:-mr}"
RELEASE_TAG="${MR_RELEASE_TAG:-latest}"
ASSET_NAME="${MR_ASSET_NAME:-mr.tar.gz}"
INSTALL_DIR="${MR_INSTALL_DIR:-$HOME/.local/share/mr}"
BIN_DIR="${MR_BIN_DIR:-$HOME/.local/bin}"
RC_FILE="${MR_RC:-}"
TMP_DIR=""
TARBALL_URL_OVERRIDE="${MR_TARBALL_URL:-}"

if [[ -n "$TARBALL_URL_OVERRIDE" ]]; then
  TARBALL_URL="$TARBALL_URL_OVERRIDE"
elif [[ "$RELEASE_TAG" == "latest" ]]; then
  TARBALL_URL="https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/latest/download/${ASSET_NAME}"
else
  TARBALL_URL="https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/download/${RELEASE_TAG}/${ASSET_NAME}"
fi

cleanup() {
  if [[ -n "${TMP_DIR:-}" ]]; then
    rm -rf "$TMP_DIR"
  fi
}

trap cleanup EXIT

fail() {
  printf '[失败] %s\n' "$1" >&2
  exit 1
}

info() {
  printf '[信息] %s\n' "$1"
}

success() {
  printf '[完成] %s\n' "$1"
}

need_command() {
  command -v "$1" >/dev/null 2>&1 || fail "缺少命令: $1"
}

detect_rc_file() {
  if [[ -n "$RC_FILE" ]]; then
    return
  fi

  case "${SHELL##*/}" in
    zsh)
      RC_FILE="$HOME/.zshrc"
      ;;
    bash)
      RC_FILE="$HOME/.bashrc"
      ;;
    *)
      RC_FILE="$HOME/.profile"
      ;;
  esac
}

check_node_version() {
  local version_ok
  version_ok="$(node -p "const [major, minor] = process.versions.node.split('.').map(Number); Number(major > 20 || (major === 20 && minor >= 12))")"
  if [[ "$version_ok" != "1" ]]; then
    fail "Node.js 版本过低，当前为 $(node --version)，需要 >= 20.12。"
  fi
}

install_package() {
  local package_dir index_path
  TMP_DIR="$(mktemp -d)"

  info "下载预构建产物 ${TARBALL_URL}"
  curl -fsSL "$TARBALL_URL" | tar -xz -C "$TMP_DIR"

  index_path="$(find "$TMP_DIR" -mindepth 2 -maxdepth 3 -type f -path '*/dist/index.js' | head -n 1)"
  [[ -n "$index_path" ]] || fail "预构建产物中没有找到 dist/index.js。"
  package_dir="${index_path%/dist/index.js}"
  [[ -f "$package_dir/package.json" ]] || fail "预构建产物中没有找到 package.json。"

  rm -rf "$INSTALL_DIR"
  mkdir -p "$INSTALL_DIR/dist"
  cp -R "$package_dir/dist/." "$INSTALL_DIR/dist/"
  cp "$package_dir/package.json" "$INSTALL_DIR/package.json"
  cp "$package_dir/README.md" "$INSTALL_DIR/README.md"
  cp "$package_dir/install.sh" "$INSTALL_DIR/install.sh"
  cp "$package_dir/uninstall.sh" "$INSTALL_DIR/uninstall.sh"

  chmod +x "$INSTALL_DIR/dist/index.js"
  chmod +x "$INSTALL_DIR/install.sh"
  chmod +x "$INSTALL_DIR/uninstall.sh"
}

link_bins() {
  mkdir -p "$BIN_DIR"

  ln -sfn "$INSTALL_DIR/dist/index.js" "$BIN_DIR/mr"
  ln -sfn "$INSTALL_DIR/dist/index.js" "$BIN_DIR/mrm"
  ln -sfn "$INSTALL_DIR/dist/index.js" "$BIN_DIR/mrt"
  ln -sfn "$INSTALL_DIR/dist/index.js" "$BIN_DIR/mrp"
  ln -sfn "$INSTALL_DIR/uninstall.sh" "$BIN_DIR/mr-uninstall"
}

update_shell_profile() {
  detect_rc_file

  touch "$RC_FILE"

  local backup_file tmp_file
  backup_file="${RC_FILE}.bak.$(date +%Y%m%d%H%M%S)"
  tmp_file="$(mktemp)"

  cp "$RC_FILE" "$backup_file"

  awk '
    /^# MR CLI:START$/ { skip = 1; next }
    /^# MR CLI:END$/ { skip = 0; next }
    skip { next }
    /^[[:space:]]*alias[[:space:]]+mr=/ { next }
    /^[[:space:]]*alias[[:space:]]+mr-uninstall=/ { next }
    /^[[:space:]]*alias[[:space:]]+mrm=/ { next }
    /^[[:space:]]*alias[[:space:]]+mrp=/ { next }
    /^[[:space:]]*alias[[:space:]]+mrt=/ { next }
    { print }
  ' "$RC_FILE" > "$tmp_file"

  cat >> "$tmp_file" <<EOF

# MR CLI:START
export PATH="$BIN_DIR:\$PATH"
unalias mrm mrt mrp mr-uninstall 2>/dev/null || true
unalias mr 2>/dev/null || true
unset -f mr mrm mrt mrp mr-uninstall 2>/dev/null || true
# MR CLI:END
EOF

  mv "$tmp_file" "$RC_FILE"

  info "已更新 shell 配置: $RC_FILE"
  info "备份文件: $backup_file"
}

print_done() {
  success "mr 已安装。"
  printf '\n'
  printf '可用命令:\n'
  printf '  mr           -> 交互式选择 master / test / prerelease\n'
  printf '  mrm          -> mr master\n'
  printf '  mrt          -> mr test\n'
  printf '  mrp          -> mr prerelease\n'
  printf '  mr update    -> 更新到最新 release\n'
  printf '  mr uninstall -> 卸载 mr\n'
  printf '\n'

  case ":$PATH:" in
    *":$BIN_DIR:"*)
      printf '当前 PATH 已包含 %s，可以直接使用。\n' "$BIN_DIR"
      ;;
    *)
      printf '已把 %s 写入 shell 配置。新终端会自动生效。\n' "$BIN_DIR"
      printf '当前终端可临时执行: export PATH="%s:$PATH"\n' "$BIN_DIR"
      ;;
  esac
}

need_command curl
need_command tar
need_command node
need_command git

check_node_version
install_package
link_bins
update_shell_profile
print_done
