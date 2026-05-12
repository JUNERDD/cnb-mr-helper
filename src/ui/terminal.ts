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

const INDENT = '  '
const SUB_INDENT = '    '

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

  if (env.MR_NO_COLOR !== undefined && env.MR_NO_COLOR !== '') {
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
  const spinnerEnabled = Boolean(
    spinner && stream.isTTY && !env.CI && env.TERM !== 'dumb' && !quiet && colors.isColorSupported,
  )
  const liveStatusEnabled = Boolean(stream.isTTY && !quiet)

  const accent = colors.cyan
  const dim = colors.dim
  const danger = colors.red
  const warn = colors.yellow

  const marker: Record<StatusType, string> = {
    ok: accent('+'),
    err: danger('x'),
    run: accent('>'),
    plan: dim('-'),
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
    liveStatusEnabled,

    panel(title: string, lines: string[] = [], { force = false, tone = 'info' as Tone } = {}) {
      if (quiet && !force) {
        return
      }

      const styled = (titleStyle[tone] ?? titleStyle.info)(title)
      maybeWrite('', { force })
      maybeWrite(`${INDENT}${styled}`, { force })
      for (const line of lines) {
        maybeWrite(`${INDENT}${line}`, { force })
      }
      maybeWrite('', { force })
    },

    step(label: string, message: string) {
      maybeWrite(`${INDENT}${accent('>')} ${accent(label)}: ${message}`)
    },

    status(type: StatusType, message: string, { force = false } = {}) {
      const m = marker[type] ?? marker.info
      maybeWrite(`${INDENT}${m} ${message}`, { force })
    },

    command(command: string, args: string[] = [], { force = false } = {}) {
      maybeWrite(dim(`${SUB_INDENT}$ ${formatCommand(command, args)}`), { force })
    },

    output(output: unknown, { force = false, error = false, maxLines = 30 } = {}) {
      const formatter = error ? danger : dim
      for (const line of outputLines(output, maxLines)) {
        maybeWrite(formatter(`${SUB_INDENT}${line}`), { force })
      }
    },

    error(error: { message: string; details?: string[]; next?: string[] }) {
      const body: string[] = [`${danger('error')}: ${error.message}`]

      if (error.details?.length) {
        body.push('', dim('details:'))
        for (const line of error.details) {
          body.push(dim(`  ${line}`))
        }
      }

      if (error.next?.length) {
        body.push('', dim('next:'))
        for (const item of error.next) {
          body.push(`  ${accent('>')} ${item}`)
        }
      }

      maybeWrite('', { force: true })
      for (const line of body) {
        maybeWrite(`${INDENT}${line}`, { force: true })
      }
      maybeWrite('', { force: true })
    },
  }
}
