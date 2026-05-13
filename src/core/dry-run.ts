export function mrBranchName(targetBranch: string, currentBranch: string) {
  return `mr/${targetBranch}/${currentBranch}`
}

export function buildDryRunCommands(targetBranch: string, currentBranch: string) {
  const mrBranch = mrBranchName(targetBranch, currentBranch)

  return [
    {
      label: `刷新 origin/${targetBranch}`,
      command: 'git',
      args: ['fetch', 'origin', `+${targetBranch}:refs/remotes/origin/${targetBranch}`],
    },
    {
      label: `检查远程 MR 分支 origin/${mrBranch}`,
      command: 'git',
      args: ['ls-remote', '--exit-code', '--heads', 'origin', mrBranch],
    },
    {
      label: `从当前分支重建本地 MR 分支 ${mrBranch}`,
      command: 'git',
      args: ['switch', '-C', mrBranch, currentBranch],
    },
    {
      label: `计算 ${targetBranch} 和 ${currentBranch} 的共同祖先`,
      command: 'git',
      args: ['merge-base', `origin/${targetBranch}`, currentBranch],
    },
    {
      label: `把 ${mrBranch} 变基到 ${targetBranch}`,
      command: 'git',
      args: ['rebase', '--onto', `origin/${targetBranch}`, 'MERGE_BASE', mrBranch],
    },
    {
      label: `推送更新后的 ${mrBranch}`,
      command: 'git',
      args: ['push', '--force-with-lease', '--set-upstream', 'origin', `HEAD:${mrBranch}`],
    },
    {
      label: `创建合并请求 ${mrBranch} -> ${targetBranch}`,
      command: 'git',
      args: ['cnb', 'pull', 'create', '-H', mrBranch, '-B', targetBranch],
    },
    {
      label: `回到当前分支 ${currentBranch}`,
      command: 'git',
      args: ['switch', currentBranch],
    },
  ]
}

export function printDryRun(targetBranch: string, currentBranch: string, context: any) {
  const { ui } = context
  const mrBranch = mrBranchName(targetBranch, currentBranch)

  // dry-run 与正式执行用同样的品牌面板节奏:标题 + 三字段 + 一空行 + dim 免责声明,
  // 然后逐条列出计划命令(? 符号),提示语用 . 标记结束。
  ui.panel('mr  预览', [
    `目标分支  ${targetBranch}`,
    `当前分支  ${currentBranch}`,
    `MR 分支   ${mrBranch}`,
    '',
    ui.colors.dim('不会修改本地分支、远程分支或创建合并请求。'),
  ])

  for (const command of buildDryRunCommands(targetBranch, currentBranch)) {
    ui.status('plan', command.label)
    ui.command(command.command, command.args)
  }

  ui.status('info', '真实执行时会根据远程分支状态跳过不需要的步骤。')
}
