import { basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Command } from 'commander'
import { createContext } from '../core/context.js'
import { isInteractiveInvocation, resolveTargetFromInvocation } from '../core/targets.js'
import { selectTarget } from '../ui/select-target.js'
import { createMrFromTargetBranch } from '../workflow/create-mr.js'

declare const __PACKAGE_VERSION__: string

const REPOSITORY_URL = 'https://github.com/JUNERDD/code/tree/main/cnb-mr-helper'
const PACKAGE_VERSION = typeof __PACKAGE_VERSION__ === 'undefined' ? '0.0.0-dev' : __PACKAGE_VERSION__

function invokedNameFromArgv(argv: string[] = process.argv) {
  return basename(argv[1] ?? fileURLToPath(import.meta.url))
}

async function resolveTargetOrPrompt(command: Command, context: ReturnType<typeof createContext>, argv: string[] = process.argv) {
  const invokedName = invokedNameFromArgv(argv)
  if (isInteractiveInvocation(invokedName, command.args[0])) {
    return selectTarget({ ui: context.ui })
  }

  return resolveTargetFromInvocation(invokedName, command.args[0])
}

function createProgram() {
  return new Command()
    .name('cnb-mr')
    .description('从目标分支准备 CNB 合并请求分支，并在本地处理冲突')
    .version(PACKAGE_VERSION)
    .argument('[target]', '目标分支，例如 master、test、prerelease')
    .option('--dry-run', '只展示将执行的计划，不修改本地或远程状态')
    .option('--verbose', '显示执行的 git 命令和完整输出')
    .option('--quiet', '只输出错误')
    .option('--color', '强制彩色输出')
    .option('--no-color', '禁用彩色输出')
    .option('--no-spinner', '禁用耗时命令的 ASCII 动画')
    .showHelpAfterError('使用 --help 查看示例和可用选项。')
    .addHelpText(
      'after',
      `

常用示例:
  mr                          交互式选择 master / test / prerelease
  mrm                         创建到 master 的合并请求
  mrt --dry-run               预览创建到 test 的执行计划
  mrp --verbose               创建到 prerelease，并显示完整命令输出
  cnb-mr release/2026-05      指定任意目标分支

短命令:
  mr   -> 交互式选择目标分支
  mrm  -> cnb-mr master
  mrt  -> cnb-mr test
  mrp  -> cnb-mr prerelease

环境变量:
  NO_COLOR=1                  禁用颜色
  FORCE_COLOR=1               强制颜色
  DEBUG=cnb-mr                等同于 --verbose

文档与反馈:
  ${REPOSITORY_URL}
`,
    )
}

export async function main(argv = process.argv) {
  const command = createProgram()
  command.parse(argv)

  const context = createContext(command.opts())
  const targetBranch = await resolveTargetOrPrompt(command, context, argv)
  if (!targetBranch) {
    command.help({ error: true })
  }

  await createMrFromTargetBranch(targetBranch, context)
}
