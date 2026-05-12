import pc from 'picocolors'
import { formatCommand } from '../core/format.js'

type OutputStream = NodeJS.WritableStream & { isTTY?: boolean }
type Tone = 'error' | 'warn' | 'success' | 'info'
type StatusType = 'ok' | 'err' | 'run' | 'plan' | 'info' | 'warn' | 'skip'

type UiOptions = {
  color?: boolean
  env?: NodeJS.ProcessEnv
  quiet?: boolean
  spinner?: boolean
  stream?: OutputStream
  verbose?: boolean
}

// 视觉栅格:全局 2 列缩进、命令/原始输出再深一级 4 列、水平规则固定 48 列宽,
// 形成"面板 → 步骤 → 命令 → 输出"四段从浅到深的层级,无需任何边框 chrome。
const INDENT = '  '
const SUB_INDENT = '    '
const RULE_WIDTH = 48
const RULE = '-'.repeat(RULE_WIDTH)

function writeLine(stream: OutputStream, line = '') {
  stream.write(`${line}\n`)
}

function outputLines(output: unknown, maxLines = 30) {
  const lines = String(output ?? '')
    .replace(/\s+$/u, '')
    .split('\n')
    .filter(Boolean)

  if (maxLines === Infinity || lines.length <= maxLines) {
    return lines
  }

  return [`... 省略 ${lines.length - maxLines} 行输出`, ...lines.slice(-maxLines)]
}

export function resolveColorEnabled(
  colorOption?: boolean,
  env = process.env,
  stream: { isTTY?: boolean } = process.stderr,
) {
  if (colorOption === true) {
    return true
  }

  if (colorOption === false) {
    return false
  }

  if (env.NO_COLOR !== undefined && env.NO_COLOR !== '') {
    return false
  }

  if (env.TERM === 'dumb') {
    return false
  }

  if (env.FORCE_COLOR !== undefined && env.FORCE_COLOR !== '0') {
    return true
  }

  return Boolean(stream.isTTY)
}

export function createUi({
  color,
  verbose = false,
  quiet = false,
  spinner = true,
  stream = process.stderr,
  env = process.env,
}: UiOptions = {}) {
  const colors = pc.createColors(resolveColorEnabled(color, env, stream))
  // spinner 是 LED 像素矩阵,完全靠颜色梯度表达亮度档位,无色模式下整片会变成纯白方块没意义,
  // 因此 colorSupported = false 时直接 fallback 到 ui.status 的单行 > / + 流程。
  const spinnerEnabled = Boolean(
    spinner && stream.isTTY && !env.CI && env.TERM !== 'dumb' && !quiet && colors.isColorSupported,
  )

  // 调色板严格限制为:cyan 唯一强调色 + 仅在错误/警告时启用的 red / yellow + dim 辅助。
  const accent = colors.cyan
  const dim = colors.dim
  const danger = colors.red
  const warn = colors.yellow

  // 状态符号统一压缩到 1 个字符,颜色承载语义,而非靠 [OK]/[ERR] 这种文本标签。
  const marker: Record<StatusType, string> = {
    ok: accent('+'),
    err: danger('x'),
    run: accent('>'),
    plan: accent('?'),
    info: dim('.'),
    warn: warn('!'),
    skip: dim('-'),
  }

  const titleStyle: Record<Tone, (text: string) => string> = {
    error: (text) => colors.bold(danger(text)),
    warn: (text) => colors.bold(warn(text)),
    success: (text) => colors.bold(accent(text)),
    info: (text) => colors.bold(accent(text)),
  }

  const maybeWrite = (line = '', { force = false } = {}) => {
    if (!quiet || force) {
      writeLine(stream, line)
    }
  }

  return {
    colors,
    stream,
    quiet,
    verbose,
    spinnerEnabled,

    // 面板:粗体彩色标题 + 暗色水平线 + 缩进正文,上下各留一空行。
    // 取代原 boxen 边框,以版面节奏代替 chrome。
    panel(title: string, lines: string[] = [], { force = false, tone = 'info' as Tone } = {}) {
      if (quiet && !force) {
        return
      }

      const styled = (titleStyle[tone] ?? titleStyle.info)(title)
      maybeWrite('', { force })
      maybeWrite(`${INDENT}${styled}`, { force })
      maybeWrite(`${INDENT}${dim(RULE)}`, { force })
      for (const line of lines) {
        maybeWrite(`${INDENT}${line}`, { force })
      }
      maybeWrite('', { force })
    },

    // 步骤:开启一段命令组的小标题,> 是 cursor,label 用强调色,正文默认色。
    step(label: string, message: string) {
      maybeWrite(`${INDENT}${accent('>')} ${accent(label)}  ${message}`)
    },

    // 单行状态:单字符符号 + 一空格 + 文本,所有类型保持同样宽度与缩进。
    status(type: StatusType, message: string, { force = false } = {}) {
      const m = marker[type] ?? marker.info
      maybeWrite(`${INDENT}${m} ${message}`, { force })
    },

    // 命令回显(verbose):再深一级缩进,统一暗色,$ 提示行业惯例。
    command(command: string, args: string[] = [], { force = false } = {}) {
      maybeWrite(dim(`${SUB_INDENT}$ ${formatCommand(command, args)}`), { force })
    },

    // 原始命令输出:最深缩进,失败时用 red,正常用 dim,与 UI 自身文本拉开距离。
    output(output: unknown, { force = false, error = false, maxLines = 30 } = {}) {
      const formatter = error ? danger : dim
      for (const line of outputLines(output, maxLines)) {
        maybeWrite(formatter(`${SUB_INDENT}${line}`), { force })
      }
    },

    // 错误面板:复用 panel 渲染,正文里通过空行 + dim 小节标题区分 "输出 / 下一步"。
    error(error: { message: string; details?: string[]; next?: string[] }) {
      const body: string[] = [error.message]

      if (error.details?.length) {
        body.push('', dim('输出'))
        for (const line of error.details) {
          body.push(dim(`  ${line}`))
        }
      }

      if (error.next?.length) {
        body.push('', dim('下一步'))
        for (const item of error.next) {
          body.push(`  ${accent('>')} ${item}`)
        }
      }

      this.panel('失败', body, { force: true, tone: 'error' })
    },
  }
}
