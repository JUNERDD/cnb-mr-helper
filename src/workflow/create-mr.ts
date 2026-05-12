import { mrBranchName, printDryRun } from '../core/dry-run.js'
import { CliError, compactOutput } from '../core/errors.js'
import {
  ensureCleanWorkingTree,
  ensureGitContext,
  getCurrentBranch,
  getTrackedWorkingTreeStatus,
  git,
  isAncestor,
  remoteBranchExists,
} from '../git/client.js'
import { run } from '../runtime/runner.js'

async function createPullRequest(
  mrBranch: string,
  targetBranch: string,
  context: any,
  { allowFailure = false, labelPrefix = '创建合并请求' } = {},
) {
  return run('git', ['cnb', 'pull', 'create', '-H', mrBranch, '-B', targetBranch], {
    label: `${labelPrefix} ${mrBranch} -> ${targetBranch}`,
    allowFailure,
    showOutput: true,
    mutates: true,
    context,
  })
}

export async function createMrFromTargetBranch(targetBranch: string, context: any) {
  const { ui } = context

  await ensureGitContext(context)
  const currentBranch = await getCurrentBranch(context)

  if (context.dryRun) {
    // 编辑性排版:品牌面板永远是输出的第一眼,工作区脏不脏的提醒留到末尾做收尾脚注,
    // 不去抢 "mr 预览" 这个标题的注意力。
    printDryRun(targetBranch, currentBranch, context)
    const status = await getTrackedWorkingTreeStatus(context)
    if (status) {
      ui.status('warn', '工作区存在 tracked 改动；真实执行会先停止。')
    }

    return
  }

  await ensureCleanWorkingTree(context)

  const mrBranch = mrBranchName(targetBranch, currentBranch)
  let mrBranchExists = false
  let mrMergedTarget = false

  // 品牌面板:整次执行里唯一一处 bold cyan "mr",副标题给出本次任务定语,
  // 正文用对齐到 col 11 的 key/value 列表(中文 4 字 = 8 visual col + 2 空格),
  // 让目标 / 当前 / MR 三个字段在视觉上形成一根隐形垂直线。
  ui.panel('mr  合并请求', [
    `目标分支  ${targetBranch}`,
    `当前分支  ${currentBranch}`,
    `MR 分支   ${mrBranch}`,
  ])

  ui.step('检查', `确认远程目标分支 origin/${targetBranch}。`)
  const targetExists = await remoteBranchExists(targetBranch, context)
  if (!targetExists) {
    throw new CliError(`远程目标分支不存在: origin/${targetBranch}`, {
      next: ['检查目标分支名称，或改用 mr <target> 指定正确分支。'],
    })
  }

  await refreshTargetBranch(targetBranch, context)
  const currentMergedTarget = await isAncestor(currentBranch, `origin/${targetBranch}`, context)
  const existingMr = await prepareExistingMrBranch(mrBranch, targetBranch, currentBranch, currentMergedTarget, context)

  if (existingMr.done) {
    return
  }

  mrBranchExists = existingMr.exists
  mrMergedTarget = existingMr.mergedToTarget

  if (!mrBranchExists) {
    if (currentMergedTarget) {
      ui.panel('无需操作', [`${currentBranch} 已经合入 ${targetBranch}。`], { tone: 'success' })
      return
    }

    await createRemoteMrBranch(mrBranch, context)
  }

  const requestCreated = await createInitialRequestIfNeeded(mrBranch, targetBranch, mrMergedTarget, context)
  await prepareLocalMrBranch(mrBranch, targetBranch, mrBranchExists, mrMergedTarget, context)
  await mergeCurrentBranch(mrBranch, currentBranch, targetBranch, requestCreated, context)
  await pushAndEnsureRequest(mrBranch, targetBranch, requestCreated, context)
  await git(['switch', currentBranch], context, { label: `回到 ${currentBranch}`, mutates: true })

  // 完成面板:与品牌面板同样的对齐方式,但只剩两行,刻意短小,
  // 形成"开 — 步骤 — 收"的三段结构,最后一行是当前分支,告诉用户你在哪。
  ui.panel('完成', [
    `合并请求  ${mrBranch} -> ${targetBranch}`,
    `已回到    ${currentBranch}`,
  ], { tone: 'success' })
}

async function refreshTargetBranch(targetBranch: string, context: any) {
  context.ui.step('检查', `刷新目标分支 origin/${targetBranch}。`)
  await git(['fetch', 'origin', `+${targetBranch}:refs/remotes/origin/${targetBranch}`], context, {
    label: `刷新 origin/${targetBranch}`,
    mutates: true,
  })
}

async function prepareExistingMrBranch(
  mrBranch: string,
  targetBranch: string,
  currentBranch: string,
  currentMergedTarget: boolean,
  context: any,
) {
  if (!(await remoteBranchExists(mrBranch, context))) {
    return { exists: false, mergedToTarget: false, done: false }
  }

  const { ui } = context
  ui.step('检查', '发现远程 MR 分支，拉取最新状态。')
  await git(['fetch', 'origin', `+${mrBranch}:refs/remotes/origin/${mrBranch}`], context, {
    label: `刷新 origin/${mrBranch}`,
    mutates: true,
  })

  const mrContainsCurrent = await isAncestor(currentBranch, `origin/${mrBranch}`, context)
  const mrMergedTarget = await isAncestor(`origin/${mrBranch}`, `origin/${targetBranch}`, context)

  if (currentMergedTarget) {
    ui.panel('无需操作', [`${currentBranch} 已经合入 ${targetBranch}。`], { tone: 'success' })
    return { exists: true, mergedToTarget: mrMergedTarget, done: true }
  }

  if (mrContainsCurrent && !mrMergedTarget) {
    ui.step('合并请求', 'MR 分支已包含当前分支，只创建远程合并请求。')
    await createPullRequest(mrBranch, targetBranch, context)
    ui.panel('完成', [`合并请求: ${mrBranch} -> ${targetBranch}`], { tone: 'success' })
    return { exists: true, mergedToTarget: false, done: true }
  }

  if (mrMergedTarget) {
    ui.step('刷新', `已有 MR 分支已合入目标分支，将从 ${targetBranch} 重新准备。`)
  } else {
    ui.step('准备', `使用已有 MR 分支，并把 ${currentBranch} 合入其中。`)
  }

  return { exists: true, mergedToTarget: mrMergedTarget, done: false }
}

async function createRemoteMrBranch(mrBranch: string, context: any) {
  context.ui.step('创建', '远程 MR 分支不存在，先推送当前分支作为合并请求入口。')
  await git(['push', 'origin', `HEAD:${mrBranch}`], context, {
    label: `推送 ${mrBranch}`,
    mutates: true,
  })
  await git(['fetch', 'origin', `+${mrBranch}:refs/remotes/origin/${mrBranch}`], context, {
    label: `刷新 origin/${mrBranch}`,
    mutates: true,
  })
}

async function createInitialRequestIfNeeded(mrBranch: string, targetBranch: string, mrMergedTarget: boolean, context: any) {
  if (mrMergedTarget) {
    return false
  }

  context.ui.step('合并请求', `创建合并请求: ${mrBranch} -> ${targetBranch}。`)
  const result = await createPullRequest(mrBranch, targetBranch, context, { allowFailure: true })
  if (result.exitCode === 0) {
    return true
  }

  context.ui.status('warn', '合并请求创建未成功，可能已存在或当前无差异；推送后会重试。')
  return false
}

async function prepareLocalMrBranch(
  mrBranch: string,
  targetBranch: string,
  mrBranchExists: boolean,
  mrMergedTarget: boolean,
  context: any,
) {
  const source = mrMergedTarget || !mrBranchExists ? `origin/${targetBranch}` : `origin/${mrBranch}`
  context.ui.step('切换', `从 ${source} 准备本地 ${mrBranch}。`)
  await git(['switch', '-C', mrBranch, source], context, {
    label: `切换到 ${mrBranch}`,
    mutates: true,
  })
  await git(['branch', '--set-upstream-to', `origin/${mrBranch}`, mrBranch], context, {
    label: '设置 upstream',
    mutates: true,
  })
}

async function mergeCurrentBranch(
  mrBranch: string,
  currentBranch: string,
  targetBranch: string,
  requestCreated: boolean,
  context: any,
) {
  context.ui.step('合并', `把 ${currentBranch} 合入 ${mrBranch}。`)
  const result = await git(['merge', '--no-edit', currentBranch], context, {
    label: `合并 ${currentBranch}`,
    allowFailure: true,
    mutates: true,
  })

  if (result.exitCode === 0) {
    return
  }

  const next = ['解决冲突后执行: git add <files> && git commit && git push']
  if (!requestCreated) {
    next.push(`然后创建合并请求: git cnb pull create -H ${mrBranch} -B ${targetBranch}`)
  }

  throw new CliError(`合并停在 ${mrBranch}，需要手动解决冲突。`, {
    exitCode: result.exitCode || 1,
    details: compactOutput(result.all),
    next,
  })
}

async function pushAndEnsureRequest(mrBranch: string, targetBranch: string, requestCreated: boolean, context: any) {
  context.ui.step('推送', `推送 ${mrBranch}，更新远程 MR 分支。`)
  await git(['push', 'origin', `HEAD:${mrBranch}`], context, {
    label: `推送 ${mrBranch}`,
    mutates: true,
  })

  if (!requestCreated) {
    context.ui.step('合并请求', `推送后重新创建合并请求: ${mrBranch} -> ${targetBranch}。`)
    await createPullRequest(mrBranch, targetBranch, context)
  }
}
