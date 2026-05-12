#!/usr/bin/env zsh

_install_cnb_mr_helpers() {
  emulate -L zsh
  set -euo pipefail

  local rc_file="${CNB_MR_RC:-$HOME/.zshrc}"
  local backup_file="${rc_file}.bak.$(date +%Y%m%d%H%M%S)"
  local tmp_file
  tmp_file="$(mktemp)"

  touch "$rc_file"
  cp "$rc_file" "$backup_file"

  awk '
  /^# CNB MR HELPERS:START$/ { skip = 1; next }
  /^# CNB MR HELPERS:END$/ { skip = 0; next }
  skip { next }
  /^[[:space:]]*alias[[:space:]]+mrm=/ { next }
  /^[[:space:]]*alias[[:space:]]+mrp=/ { next }
  /^[[:space:]]*alias[[:space:]]+mrt=/ { next }
  { print }
' "$rc_file" > "$tmp_file"

  cat >> "$tmp_file" <<'EOF'

# CNB MR HELPERS:START
unalias mrm mrt mrp 2>/dev/null || true

_cnb_create_mr_from_target_branch() {
  local target_branch="$1"
  local current_branch
  current_branch="$(git symbolic-ref --quiet --short HEAD)" || {
    echo "Not on a local branch."
    return 1
  }

  if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
    echo "Working tree has uncommitted changes. Commit or stash them before running this command."
    return 1
  fi

  local mr_branch="mr/${target_branch}/${current_branch}"
  local mr_branch_exists=0
  local mr_contains_current=0
  local mr_merged_target=0
  local current_merged_target=0

  git fetch origin "+${target_branch}:refs/remotes/origin/${target_branch}" || return

  if git merge-base --is-ancestor "${current_branch}" "origin/${target_branch}"; then
    current_merged_target=1
  fi

  if git ls-remote --exit-code --heads origin "${mr_branch}" >/dev/null 2>&1; then
    mr_branch_exists=1
    git fetch origin "+${mr_branch}:refs/remotes/origin/${mr_branch}" || return

    if git merge-base --is-ancestor "${current_branch}" "origin/${mr_branch}"; then
      mr_contains_current=1
    fi

    if git merge-base --is-ancestor "origin/${mr_branch}" "origin/${target_branch}"; then
      mr_merged_target=1
    fi

    if (( current_merged_target )); then
      echo "${current_branch} is already merged into ${target_branch}. Nothing to create."
      return 0
    fi

    if (( mr_contains_current && ! mr_merged_target )); then
      echo "Existing ${mr_branch} already contains ${current_branch}. Creating pull request only."
      git cnb pull create -H "${mr_branch}" -B "${target_branch}"
      return $?
    fi

    if (( mr_merged_target )); then
      echo "Found existing ${mr_branch}, but it is already merged into ${target_branch}. Refreshing it from ${target_branch}, then merging ${current_branch} into it."
    else
      echo "Found existing ${mr_branch}. Creating pull request, then merging ${current_branch} into it."
    fi
  else
    if (( current_merged_target )); then
      echo "${current_branch} is already merged into ${target_branch}. Nothing to create."
      return 0
    fi

    echo "Creating pull request from ${mr_branch} to ${target_branch}, then preparing local conflict-resolution branch."
    git push origin HEAD:"${mr_branch}" || return
    git fetch origin "+${mr_branch}:refs/remotes/origin/${mr_branch}" || return
  fi

  local pr_created=0
  if (( ! mr_merged_target )); then
    git cnb pull create -H "${mr_branch}" -B "${target_branch}"
    local pr_exit_code=$?
    if (( pr_exit_code == 0 )); then
      pr_created=1
    else
      echo "Pull request creation failed or it may already exist. Continuing local merge setup for ${mr_branch}; will retry after push if merge succeeds."
    fi
  fi

  if (( mr_merged_target || ! mr_branch_exists )); then
    git switch -C "${mr_branch}" "origin/${target_branch}" || return
  else
    git switch -C "${mr_branch}" "origin/${mr_branch}" || return
  fi

  git branch --set-upstream-to "origin/${mr_branch}" "${mr_branch}" || return

  if ! git merge --no-edit "${current_branch}"; then
    if (( pr_created )); then
      echo "Merge stopped on ${mr_branch}. Resolve conflicts there, then commit and push to update the pull request."
    else
      echo "Merge stopped on ${mr_branch}. CNB did not create a pull request before the merge, so after resolving conflicts commit and push, then run:"
      echo "git cnb pull create -H ${mr_branch} -B ${target_branch}"
    fi
    return 1
  fi

  local exit_code

  git push origin HEAD:"${mr_branch}"
  exit_code=$?
  if (( exit_code != 0 )); then
    git switch "${current_branch}"
    return "${exit_code}"
  fi

  if (( ! pr_created )); then
    git cnb pull create -H "${mr_branch}" -B "${target_branch}"
    exit_code=$?
    if (( exit_code != 0 )); then
      git switch "${current_branch}"
      return "${exit_code}"
    fi
  fi

  git switch "${current_branch}"
  return 0
}

mrm() {
  _cnb_create_mr_from_target_branch master
}

mrt() {
  _cnb_create_mr_from_target_branch test
}

mrp() {
  _cnb_create_mr_from_target_branch prerelease
}
# CNB MR HELPERS:END
EOF

  mv "$tmp_file" "$rc_file"

  echo "Installed CNB MR helpers."
  echo "Backup: $backup_file"

  if [[ ":${ZSH_EVAL_CONTEXT:-}:" == *:file:* ]]; then
    set +e
    source "$rc_file"
    set -e
    echo "Reloaded current shell from $rc_file."
  else
    echo "Open a new terminal, or run this once to install and reload in the current shell:"
    echo "source ${(%):-%x}"
  fi
}

_cnb_mr_finish() {
  local install_status="$1"
  unset -f _install_cnb_mr_helpers _cnb_mr_finish
  return "$install_status"
}

_install_cnb_mr_helpers "$@"
_cnb_mr_finish "$?"
