import select from '@inquirer/select'
import { CliError } from '../core/errors.js'
import { TARGET_OPTIONS } from '../core/targets.js'
import { createUi } from './terminal.js'

type SelectTargetOptions = {
  input?: NodeJS.ReadableStream & { isTTY?: boolean }
  output?: NodeJS.WritableStream & { isTTY?: boolean }
  ui: ReturnType<typeof createUi>
}

export function createSelectConfig(ui: ReturnType<typeof createUi>) {
  const colors = ui.colors

  return {
    message: '选择目标分支',
    choices: TARGET_OPTIONS.map((option) => ({
      name: option.label,
      value: option.value,
      description: option.hint,
      short: option.value,
    })),
    pageSize: TARGET_OPTIONS.length,
    loop: true,
    theme: {
      // prefix 是品牌出场点(交互选择本身就是 mr 最响亮的时刻),用 bold cyan "mr"。
      // cursor / highlight / answer 全用同一个 cyan,description / 提示语统一 dim,
      // 让 cyan 始终是页面上唯一被注意到的颜色。
      prefix: colors.bold(colors.cyan('mr')),
      icon: { cursor: colors.cyan('>') },
      indexMode: 'number',
      style: {
        answer: (text: string) => colors.cyan(text),
        description: (text: string) => colors.dim(text),
        highlight: (text: string) => colors.bold(colors.cyan(text)),
        key: (text: string) => colors.cyan(text),
        help: (text: string) => colors.dim(text),
        defaultAnswer: (text: string) => colors.dim(text),
        keysHelpTip: () => colors.dim('上下 / 数字键 选择   回车 确认   Ctrl-C 取消'),
      },
    },
  } as const
}

export async function selectTarget({ input = process.stdin, output = process.stderr, ui }: SelectTargetOptions) {
  if (!input.isTTY || !output.isTTY) {
    throw new CliError('mr 需要在交互式终端中选择目标分支。', {
      next: ['在脚本或 CI 中请直接使用: mr master、mr test 或 mr prerelease'],
    })
  }

  try {
    return await select(createSelectConfig(ui), {
      input,
      output,
      clearPromptOnDone: false,
    })
  } catch (error: any) {
    if (error?.name === 'ExitPromptError') {
      throw new CliError('已取消选择。', { exitCode: 130 })
    }

    throw error
  }
}
