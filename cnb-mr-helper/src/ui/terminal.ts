import boxen from 'boxen'
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

export function resolveColorEnabled(colorOption?: boolean, env = process.env, stream: { isTTY?: boolean } = process.stderr) {
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
  const spinnerEnabled = Boolean(spinner && stream.isTTY && !env.CI && env.TERM !== 'dumb' && !quiet)

  const maybeWrite = (line = '', { force = false } = {}) => {
    if (!quiet || force) {
      writeLine(stream, line)
    }
  }

  const symbol = {
    ok: colors.green('[OK]'),
    err: colors.red('[ERR]'),
    run: colors.cyan('[RUN]'),
    plan: colors.yellow('[PLAN]'),
    info: colors.cyan('[INFO]'),
    warn: colors.yellow('[WARN]'),
    skip: colors.gray('[SKIP]'),
  }

  return {
    colors,
    stream,
    quiet,
    verbose,
    spinnerEnabled,

    panel(title: string, lines: string[] = [], { force = false, tone = 'info' as Tone } = {}) {
      if (quiet && !force) {
        return
      }

      const borderColor = colors.isColorSupported
        ? { error: 'red', warn: 'yellow', success: 'green', info: 'cyan' }[tone]
        : undefined

      maybeWrite(
        boxen(lines.join('\n'), {
          title,
          titleAlignment: 'left',
          borderStyle: 'classic',
          borderColor,
          padding: { top: 0, bottom: 0, left: 1, right: 1 },
          margin: { top: 1, bottom: 1 },
        }),
        { force },
      )
    },

    step(label: string, message: string) {
      maybeWrite(`${colors.cyan(`[${label}]`)} ${message}`)
    },

    status(type: StatusType, message: string, { force = false } = {}) {
      maybeWrite(`${symbol[type] ?? symbol.info} ${message}`, { force })
    },

    command(command: string, args: string[] = [], { force = false } = {}) {
      maybeWrite(colors.dim(`      $ ${formatCommand(command, args)}`), { force })
    },

    output(output: unknown, { force = false, error = false, maxLines = 30 } = {}) {
      const formatter = error ? colors.red : colors.gray
      for (const line of outputLines(output, maxLines)) {
        maybeWrite(formatter(`      ${line}`), { force })
      }
    },

    error(error: { message: string; details?: string[]; next?: string[] }) {
      const details = error.details?.length ? ['', '输出:', ...error.details] : []
      const next = error.next?.length ? ['', '下一步:', ...error.next.map((item) => `- ${item}`)] : []
      this.panel('执行失败', [error.message, ...details, ...next], { force: true, tone: 'error' })
    },
  }
}
