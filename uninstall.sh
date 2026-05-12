#!/usr/bin/env bash
set -euo pipefail

INSTALL_DIR="${CNB_MR_INSTALL_DIR:-$HOME/.local/share/cnb-mr-helper}"
BIN_DIR="${CNB_MR_BIN_DIR:-$HOME/.local/bin}"
RC_FILE="${CNB_MR_RC:-}"

info() {
  printf '[信息] %s\n' "$1"
}

success() {
  printf '[完成] %s\n' "$1"
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

remove_bins() {
  local command_name

  for command_name in cnb-mr mrm mrt mrp cnb-mr-uninstall; do
    if [[ -L "$BIN_DIR/$command_name" || -f "$BIN_DIR/$command_name" ]]; then
      rm -f "$BIN_DIR/$command_name"
      info "已删除命令: $BIN_DIR/$command_name"
    fi
  done
}

remove_install_dir() {
  if [[ -d "$INSTALL_DIR" ]]; then
    rm -rf "$INSTALL_DIR"
    info "已删除安装目录: $INSTALL_DIR"
  fi
}

update_shell_profile() {
  detect_rc_file

  if [[ ! -f "$RC_FILE" ]]; then
    return
  fi

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

  mv "$tmp_file" "$RC_FILE"

  info "已清理 shell 配置: $RC_FILE"
  info "备份文件: $backup_file"
}

print_done() {
  success "CNB MR Helper 已卸载。"
  printf '\n'
  printf '以下命令链接已删除:\n'
  printf '  cnb-mr\n'
  printf '  mrm\n'
  printf '  mrt\n'
  printf '  mrp\n'
  printf '\n'
  printf '新终端中这些命令将不可用。\n'
  printf '如果当前终端仍缓存旧命令，请执行: hash -r 2>/dev/null || rehash 2>/dev/null || true\n'
}

remove_bins
remove_install_dir
update_shell_profile
print_done
