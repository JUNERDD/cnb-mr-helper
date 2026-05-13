import { CliError, compactOutput } from '../core/errors.js'
import { run } from '../runtime/runner.js'

export async function git(args: string[], context: any, options: Record<string, any> = {}) {
  return run('git', args, { ...options, context })
}

export async function gitOutput(args: string[], context: any) {
  const result = await git(args, context, { quiet: true, allowFailure: true })
  if (result.exitCode !== 0) {
    return null
  }

  return result.stdout.trim()
}

export async function isAncestor(ancestor: string, descendant: string, context: any) {
  const result = await git(['merge-base', '--is-ancestor', ancestor, descendant], context, {
    quiet: true,
    allowFailure: true,
  })

  if (result.exitCode === 0) {
    return true
  }

  if (result.exitCode === 1) {
    return false
  }

  throw new CliError(`无法比较提交关系: ${ancestor} -> ${descendant}`, {
    exitCode: result.exitCode || 1,
    details: compactOutput(result.all),
    next: ['确认目标分支已 fetch，并且本地仓库历史完整。'],
  })
}

export async function getMergeBase(left: string, right: string, context: any) {
  const result = await git(['merge-base', left, right], context, {
    quiet: true,
    allowFailure: true,
  })

  if (result.exitCode === 0) {
    return result.stdout.trim().split('\n')[0]
  }

  throw new CliError(`无法计算共同祖先: ${left} / ${right}`, {
    exitCode: result.exitCode || 1,
    details: compactOutput(result.all),
    next: ['确认目标分支和当前分支来自同一个仓库历史。'],
  })
}

export async function hasNoNewPatchChanges(upstream: string, head: string, context: any, limit?: string) {
  const args = ['cherry', upstream, head]
  if (limit) {
    args.push(limit)
  }

  const result = await git(args, context, {
    quiet: true,
    allowFailure: true,
  })

  if (result.exitCode === 0) {
    return !result.stdout
      .split('\n')
      .some((line: string) => line.startsWith('+'))
  }

  throw new CliError(`无法比较补丁等价关系: ${upstream} / ${head}`, {
    exitCode: result.exitCode || 1,
    details: compactOutput(result.all),
    next: ['确认远程 MR 分支已 fetch，并且本地仓库历史完整。'],
  })
}

export async function remoteBranchExists(branch: string, context: any) {
  const result = await git(['ls-remote', '--exit-code', '--heads', 'origin', branch], context, {
    quiet: true,
    allowFailure: true,
  })

  if (result.exitCode === 0) {
    return true
  }

  if (result.exitCode === 2) {
    return false
  }

  throw new CliError(`无法读取远程分支: origin/${branch}`, {
    exitCode: result.exitCode || 1,
    details: compactOutput(result.all),
    next: ['确认网络、仓库权限和 origin 远程配置。'],
  })
}

export async function getCurrentBranch(context: any) {
  const currentBranch = await gitOutput(['symbolic-ref', '--quiet', '--short', 'HEAD'], context)
  if (!currentBranch) {
    throw new CliError('当前 HEAD 不在本地分支上。', {
      next: ['切回一个本地分支后重试，例如: git switch <branch>'],
    })
  }

  return currentBranch
}

export async function getTrackedWorkingTreeStatus(context: any) {
  return gitOutput(['status', '--porcelain', '--untracked-files=no'], context)
}

export async function ensureCleanWorkingTree(context: any) {
  const status = await getTrackedWorkingTreeStatus(context)
  if (!status) {
    return
  }

  throw new CliError('工作区存在未提交的 tracked 改动，已停止。', {
    details: compactOutput(status, 10),
    next: ['先提交改动，或执行 git stash push 后重试。', '只想查看执行计划时可运行: mr <target> --dry-run'],
  })
}

export async function ensureGitContext(context: any) {
  await git(['--version'], context, { quiet: true })

  const insideWorkTree = await gitOutput(['rev-parse', '--is-inside-work-tree'], context)
  if (insideWorkTree !== 'true') {
    throw new CliError('当前目录不是 Git 仓库。', {
      next: ['进入需要创建合并请求的仓库目录后重试。'],
    })
  }

  const origin = await gitOutput(['remote', 'get-url', 'origin'], context)
  if (!origin) {
    throw new CliError('当前仓库没有 origin 远程。', {
      next: ['添加 origin 后重试，例如: git remote add origin <repo-url>'],
    })
  }

  const cnbCheck = await git(['cnb', '-h'], context, { quiet: true, allowFailure: true })
  const cnbOutput = cnbCheck.all ?? ''
  if (cnbCheck.exitCode !== 0 && /not a git command|不是 git 命令|No manual entry/u.test(cnbOutput)) {
    throw new CliError('未检测到 git cnb 命令。', {
      details: compactOutput(cnbOutput),
      next: ['安装并登录 CNB Git 扩展后重试。', '确认 git cnb -h 可以正常执行。'],
    })
  }
}
