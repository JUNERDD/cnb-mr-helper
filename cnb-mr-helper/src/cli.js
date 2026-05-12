#!/usr/bin/env node

import { basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import boxen from 'boxen'
import { Command } from 'commander'
import { execa } from 'execa'
import ora from 'ora'
import pc from 'picocolors'

const TARGET_BY_BIN = {
  mrm: 'master',
  mrt: 'test',
  mrp: 'prerelease',
}

const ASCII_SPINNER = {
  interval: 120,
  frames: ['[. ][  ]', '[ .][  ]', '[  ][ .]', '[  ][. ]'],
}

function panel(title, lines = []) {
  console.log(
    boxen(lines.join('\n'), {
      title,
      titleAlignment: 'left',
      borderStyle: 'classic',
      padding: { top: 0, bottom: 0, left: 1, right: 1 },
      margin: { top: 1, bottom: 1 },
    }),
  )
}

function step(label, message) {
  console.log(`${pc.cyan(`[${label}]`)} ${message}`)
}

function next(message) {
  console.log(`      -> ${message}`)
}

function printCommandOutput(output) {
  if (!output) {
    return
  }

  for (const line of output.split('\n')) {
    if (line.length > 0) {
      console.log(pc.dim(`      ${line}`))
    }
  }
}

async function run(command, args, { label, allowFailure = false, quiet = false } = {}) {
  const spinner = quiet
    ? null
    : ora({
        text: label,
        spinner: ASCII_SPINNER,
      }).start()

  const result = await execa(command, args, {
    all: true,
    reject: false,
  })

  if (spinner) {
    if (result.exitCode === 0) {
      spinner.stopAndPersist({ symbol: pc.green('[完成]'), text: label })
    } else {
      spinner.stopAndPersist({ symbol: pc.red('[失败]'), text: label })
    }
  }

  if (!quiet) {
    printCommandOutput(result.all)
  }

  if (!allowFailure && result.exitCode !== 0) {
    process.exitCode = result.exitCode
    throw new Error(`${command} ${args.join(' ')} 执行失败`)
  }

  return result
}

async function git(args, options = {}) {
  return run('git', args, options)
}

async function gitOutput(args) {
  const result = await git(args, { quiet: true, allowFailure: true })
  if (result.exitCode !== 0) {
    return null
  }

  return result.stdout.trim()
}

async function isAncestor(ancestor, descendant) {
  const result = await git(['merge-base', '--is-ancestor', ancestor, descendant], {
    quiet: true,
    allowFailure: true,
  })
  return result.exitCode === 0
}

async function remoteBranchExists(branch) {
  const result = await git(['ls-remote', '--exit-code', '--heads', 'origin', branch], {
    quiet: true,
    allowFailure: true,
  })
  return result.exitCode === 0
}

async function createPullRequest(mrBranch, targetBranch, { allowFailure = false, labelPrefix = '创建 PR' } = {}) {
  return run('git', ['cnb', 'pull', 'create', '-H', mrBranch, '-B', targetBranch], {
    label: `${labelPrefix} ${mrBranch} -> ${targetBranch}`,
    allowFailure,
  })
}

async function ensureCleanWorkingTree() {
  const status = await gitOutput(['status', '--porcelain', '--untracked-files=no'])
  if (status) {
    panel('CNB MR 助手', ['工作区存在未提交改动。', '请先提交或 stash，再重新执行。'])
    process.exit(1)
  }
}

async function createMrFromTargetBranch(targetBranch) {
  const currentBranch = await gitOutput(['symbolic-ref', '--quiet', '--short', 'HEAD'])
  if (!currentBranch) {
    panel('CNB MR 助手', ['未在本地分支上，已停止。'])
    process.exit(1)
  }

  await ensureCleanWorkingTree()

  const mrBranch = `mr/${targetBranch}/${currentBranch}`
  let mrBranchExists = false
  let mrContainsCurrent = false
  let mrMergedTarget = false

  panel('CNB MR 助手', [
    `目标分支: ${targetBranch}`,
    `当前分支: ${currentBranch}`,
    `MR 分支: ${mrBranch}`,
  ])

  step('检查', `刷新目标分支 origin/${targetBranch}。`)
  await git(['fetch', 'origin', `+${targetBranch}:refs/remotes/origin/${targetBranch}`], {
    label: `刷新 origin/${targetBranch}`,
  })

  const currentMergedTarget = await isAncestor(currentBranch, `origin/${targetBranch}`)

  if (await remoteBranchExists(mrBranch)) {
    mrBranchExists = true
    step('检查', '发现远程 MR 分支，拉取最新状态。')
    await git(['fetch', 'origin', `+${mrBranch}:refs/remotes/origin/${mrBranch}`], {
      label: `刷新 origin/${mrBranch}`,
    })

    mrContainsCurrent = await isAncestor(currentBranch, `origin/${mrBranch}`)
    mrMergedTarget = await isAncestor(`origin/${mrBranch}`, `origin/${targetBranch}`)

    if (currentMergedTarget) {
      step('完成', `${currentBranch} 已经合入 ${targetBranch}，无需创建合并请求。`)
      return
    }

    if (mrContainsCurrent && !mrMergedTarget) {
      step('PR', 'MR 分支已包含当前分支，只创建远程合并请求。')
      await createPullRequest(mrBranch, targetBranch)
      return
    }

    if (mrMergedTarget) {
      step('刷新', `已有 MR 分支已合入目标分支，将从 ${targetBranch} 重新准备。`)
    } else {
      step('准备', `使用已有 MR 分支，并把 ${currentBranch} 合入其中。`)
    }
  } else {
    if (currentMergedTarget) {
      step('完成', `${currentBranch} 已经合入 ${targetBranch}，无需创建合并请求。`)
      return
    }

    step('创建', '远程 MR 分支不存在，先推送当前分支作为 PR 入口。')
    await git(['push', 'origin', `HEAD:${mrBranch}`], {
      label: `推送 ${mrBranch}`,
    })
    await git(['fetch', 'origin', `+${mrBranch}:refs/remotes/origin/${mrBranch}`], {
      label: `刷新 origin/${mrBranch}`,
    })
  }

  let prCreated = false
  if (!mrMergedTarget) {
    step('PR', `创建合并请求: ${mrBranch} -> ${targetBranch}。`)
    const prResult = await createPullRequest(mrBranch, targetBranch, { allowFailure: true })
    if (prResult.exitCode === 0) {
      prCreated = true
    } else {
      step('提示', 'PR 创建未成功，可能已存在或当前无差异；若合并成功，推送后会重试。')
    }
  }

  if (mrMergedTarget || !mrBranchExists) {
    step('切换', `从 origin/${targetBranch} 准备本地 ${mrBranch}。`)
    await git(['switch', '-C', mrBranch, `origin/${targetBranch}`], {
      label: `切换到 ${mrBranch}`,
    })
  } else {
    step('切换', `从 origin/${mrBranch} 准备本地 ${mrBranch}。`)
    await git(['switch', '-C', mrBranch, `origin/${mrBranch}`], {
      label: `切换到 ${mrBranch}`,
    })
  }

  await git(['branch', '--set-upstream-to', `origin/${mrBranch}`, mrBranch], {
    label: '设置 upstream',
  })

  step('合并', `把 ${currentBranch} 合入 ${mrBranch}。`)
  const mergeResult = await git(['merge', '--no-edit', currentBranch], {
    label: `合并 ${currentBranch}`,
    allowFailure: true,
  })

  if (mergeResult.exitCode !== 0) {
    if (prCreated) {
      step('冲突', `合并停在 ${mrBranch}，PR 已存在。`)
      next('解决冲突后执行: git commit && git push')
    } else {
      step('冲突', `合并停在 ${mrBranch}，PR 尚未创建。`)
      next('解决冲突后执行: git commit && git push')
      next(`然后创建 PR: git cnb pull create -H ${mrBranch} -B ${targetBranch}`)
    }
    process.exit(mergeResult.exitCode)
  }

  step('推送', `推送 ${mrBranch}，更新远程 MR 分支。`)
  await git(['push', 'origin', `HEAD:${mrBranch}`], {
    label: `推送 ${mrBranch}`,
  })

  if (!prCreated) {
    step('PR', `推送后重新创建合并请求: ${mrBranch} -> ${targetBranch}。`)
    await createPullRequest(mrBranch, targetBranch)
  }

  await git(['switch', currentBranch], {
    label: `回到 ${currentBranch}`,
  })
  step('完成', `已回到 ${currentBranch}。`)
}

function resolveTarget(command) {
  const invokedName = basename(process.argv[1] ?? fileURLToPath(import.meta.url))

  if (TARGET_BY_BIN[invokedName]) {
    return TARGET_BY_BIN[invokedName]
  }

  const targetArg = command.args[0]
  return TARGET_BY_BIN[targetArg] ?? targetArg
}

async function main() {
  const command = new Command()
  command
    .name('cnb-mr')
    .description('从目标分支准备 CNB 合并请求分支，并在本地处理冲突')
    .argument('[target]', '目标分支，例如 master、test、prerelease')
    .addHelpText(
      'after',
      `

短命令:
  mrm  -> cnb-mr master
  mrt  -> cnb-mr test
  mrp  -> cnb-mr prerelease
`,
    )
    .parse(process.argv)

  const targetBranch = resolveTarget(command)
  if (!targetBranch) {
    command.help({ error: true })
  }

  await createMrFromTargetBranch(targetBranch)
}

main().catch((error) => {
  if (error?.message) {
    console.error(pc.red(`[失败] ${error.message}`))
  }
  process.exit(process.exitCode || 1)
})
