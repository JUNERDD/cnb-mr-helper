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
      prefix: colors.cyan('[?]'),
      icon: { cursor: '>' },
      indexMode: 'number',
      style: {
        answer: (text: string) => colors.green(text),
        description: (text: string) => colors.gray(text),
        highlight: (text: string) => colors.bold(text),
        keysHelpTip: () => colors.gray('上下键/数字键选择，回车确认，Ctrl-C 取消'),
      },
    },
  } as const
}

export async function selectTarget({ input = process.stdin, output = process.stderr, ui }: SelectTargetOptions) {
  if (!input.isTTY || !output.isTTY) {
    throw new CliError('mr 需要在交互式终端中选择目标分支。', {
      next: ['在脚本或 CI 中请直接使用: cnb-mr master、cnb-mr test 或 cnb-mr prerelease'],
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
