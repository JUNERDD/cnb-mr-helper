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
      label: `必要时推送 MR 分支 ${mrBranch}`,
      command: 'git',
      args: ['push', 'origin', `HEAD:${mrBranch}`],
    },
    {
      label: `创建合并请求 ${mrBranch} -> ${targetBranch}`,
      command: 'git',
      args: ['cnb', 'pull', 'create', '-H', mrBranch, '-B', targetBranch],
    },
    {
      label: `准备本地冲突处理分支 ${mrBranch}`,
      command: 'git',
      args: ['switch', '-C', mrBranch, `origin/${targetBranch}`],
    },
    {
      label: `设置 ${mrBranch} 的 upstream`,
      command: 'git',
      args: ['branch', '--set-upstream-to', `origin/${mrBranch}`, mrBranch],
    },
    {
      label: `合入当前分支 ${currentBranch}`,
      command: 'git',
      args: ['merge', '--no-edit', currentBranch],
    },
    {
      label: `推送更新后的 ${mrBranch}`,
      command: 'git',
      args: ['push', 'origin', `HEAD:${mrBranch}`],
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

  ui.panel('mr: dry run', [
    `目标分支: ${targetBranch}`,
    `当前分支: ${currentBranch}`,
    `MR 分支: ${mrBranch}`,
    '不会修改本地分支、远程分支或创建合并请求。',
  ])

  for (const command of buildDryRunCommands(targetBranch, currentBranch)) {
    ui.status('plan', command.label)
    ui.command(command.command, command.args)
  }

  ui.status('info', '真实执行时会根据远程分支状态跳过不需要的步骤。')
}
