#!/usr/bin/env bash
set -euo pipefail

REPO_OWNER="${CNB_MR_REPO_OWNER:-JUNERDD}"
REPO_NAME="${CNB_MR_REPO_NAME:-code}"
REPO_REF="${CNB_MR_REPO_REF:-main}"
TARBALL_URL="${CNB_MR_TARBALL_URL:-https://github.com/${REPO_OWNER}/${REPO_NAME}/archive/refs/heads/${REPO_REF}.tar.gz}"
INSTALL_DIR="${CNB_MR_INSTALL_DIR:-$HOME/.local/share/cnb-mr-helper}"
BIN_DIR="${CNB_MR_BIN_DIR:-$HOME/.local/bin}"
RC_FILE="${CNB_MR_RC:-}"
TMP_DIR=""

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
  local major
  major="$(node -p "Number(process.versions.node.split('.')[0])")"
  if (( major < 20 )); then
    fail "Node.js 版本过低，当前为 $(node --version)，需要 >= 20。"
  fi
}

install_package() {
  local source_dir repo_dir
  TMP_DIR="$(mktemp -d)"

  info "下载 ${TARBALL_URL}"
  curl -fsSL "$TARBALL_URL" | tar -xz -C "$TMP_DIR"

  source_dir="$(find "$TMP_DIR" -maxdepth 2 -type d -name cnb-mr-helper | head -n 1)"
  [[ -n "$source_dir" ]] || fail "压缩包中没有找到 cnb-mr-helper。"
  repo_dir="$(dirname "$source_dir")"

  rm -rf "$INSTALL_DIR"
  mkdir -p "$INSTALL_DIR"
  cp -R "$source_dir"/. "$INSTALL_DIR"/
  cp "$repo_dir/uninstall.sh" "$INSTALL_DIR/uninstall.sh"

  info "安装 Node 依赖"
  npm install --omit=dev --prefix "$INSTALL_DIR" >/dev/null

  chmod +x "$INSTALL_DIR/src/cli.js"
  chmod +x "$INSTALL_DIR/uninstall.sh"
}

link_bins() {
  mkdir -p "$BIN_DIR"

  ln -sfn "$INSTALL_DIR/src/cli.js" "$BIN_DIR/cnb-mr"
  ln -sfn "$INSTALL_DIR/src/cli.js" "$BIN_DIR/mrm"
  ln -sfn "$INSTALL_DIR/src/cli.js" "$BIN_DIR/mrt"
  ln -sfn "$INSTALL_DIR/src/cli.js" "$BIN_DIR/mrp"
  ln -sfn "$INSTALL_DIR/uninstall.sh" "$BIN_DIR/cnb-mr-uninstall"
}

update_shell_profile() {
  detect_rc_file

  touch "$RC_FILE"

  local backup_file tmp_file
  backup_file="${RC_FILE}.bak.$(date +%Y%m%d%H%M%S)"
  tmp_file="$(mktemp)"

  cp "$RC_FILE" "$backup_file"

  awk '
    /^# CNB MR HELPERS:START$/ { skip = 1; next }
    /^# CNB MR HELPERS:END$/ { skip = 0; next }
    /^# CNB MR NODE CLI:START$/ { skip = 1; next }
    /^# CNB MR NODE CLI:END$/ { skip = 0; next }
    skip { next }
    /^[[:space:]]*alias[[:space:]]+cnb-mr=/ { next }
    /^[[:space:]]*alias[[:space:]]+cnb-mr-uninstall=/ { next }
    /^[[:space:]]*alias[[:space:]]+mrm=/ { next }
    /^[[:space:]]*alias[[:space:]]+mrp=/ { next }
    /^[[:space:]]*alias[[:space:]]+mrt=/ { next }
    { print }
  ' "$RC_FILE" > "$tmp_file"

  cat >> "$tmp_file" <<EOF

# CNB MR NODE CLI:START
export PATH="$BIN_DIR:\$PATH"
unalias mrm mrt mrp cnb-mr cnb-mr-uninstall 2>/dev/null || true
unset -f mrm mrt mrp cnb-mr cnb-mr-uninstall _cnb_create_mr_from_target_branch 2>/dev/null || true
# CNB MR NODE CLI:END
EOF

  mv "$tmp_file" "$RC_FILE"

  info "已更新 shell 配置: $RC_FILE"
  info "备份文件: $backup_file"
}

print_done() {
  success "CNB MR Helper 已安装。"
  printf '\n'
  printf '可用命令:\n'
  printf '  mrm          -> cnb-mr master\n'
  printf '  mrt          -> cnb-mr test\n'
  printf '  mrp          -> cnb-mr prerelease\n'
  printf '  cnb-mr <目标分支>\n'
  printf '  cnb-mr-uninstall\n'
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
need_command npm
need_command git

check_node_version
install_package
link_bins
update_shell_profile
print_done
