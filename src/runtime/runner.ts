import { execa } from 'execa'
import ora from 'ora'
import { CliError, compactOutput } from '../core/errors.js'
import { formatCommand } from '../core/format.js'
import { createUi } from '../ui/terminal.js'

// LED dot matrix 像素动画 spinner —— 8×3 方块阵,5 级 cyan 亮度,模拟通电的 LED 显示屏。
//
// 每个 cell 渲染为 `██`(双字符,接近正方形),cell 之间留 1 列间距(像 LED 之间的 PCB 走线),
// 整体宽 23 cols × 高 3 行 ≈ 161×42 像素,接近 4:1 横向条形显示屏的比例。
//
// 亮度由三层叠加产生:
//   - 主波:对角推进的余弦波,沿 col 方向扫,row 错相 0.5 让亮带斜着走
//   - 行扰动:每行额外的正弦偏移,t 系数 = 1 保证 wraparound 处与主波周期同步
//   - 列闪烁:t 系数 = 2 的快频抖动,模拟真实 LED 在低 PWM 占空比时的不规则闪烁
//
// 10 帧 × 110ms ≈ 1.1s/cycle,主波每秒推进 ~7.3 cells,既能看出运动又不眼花。
//
// 命令完成后 ora.stop() 会清掉整个 3 行 matrix,只保留单字符 + / x 持久化标记,
// 形成"硬件像素屏 → 单点标记"的视觉收束,最终 scrollback 仍是每命令一行。
const MATRIX_W = 8
const MATRIX_H = 3
const MATRIX_FRAMES = 10

// 5 级亮度 cyan 256-color 调色板,从近熄灭到电光浅蓝。
// 选 256-indexed 而非 24-bit truecolor:兼容性更广(几乎所有现代终端都支持),
// 视觉差异已经足以表达 LED 的多档亮度。
const MATRIX_PALETTE = [
  '\x1b[38;5;235m', // 0: nearly off,暗到几乎沉到背景里,但仍可见(模拟未通电像素的反光)
  '\x1b[38;5;24m', // 1: dim,深 cyan
  '\x1b[38;5;38m', // 2: mid,标准 cyan
  '\x1b[38;5;45m', // 3: bright,亮 cyan
  '\x1b[38;5;123m', // 4: hot,电光浅 cyan
]
const RESET = '\x1b[0m'

function matrixBrightness(col: number, row: number, frame: number): number {
  const t = (frame / MATRIX_FRAMES) * Math.PI * 2
  const phase = (col / MATRIX_W + (row / MATRIX_H) * 0.5) * Math.PI * 2 - t
  const wave = (Math.cos(phase) + 1) / 2
  const scatter = Math.sin(row * 2.1 + t) * 0.22
  const flicker = Math.cos(col * 1.7 + t * 2) * 0.12
  return Math.max(0, Math.min(4, Math.round((wave + scatter + flicker) * 4)))
}

function buildMatrixFrame(frame: number): string {
  const lines: string[] = []
  for (let r = 0; r < MATRIX_H; r++) {
    const cells: string[] = []
    for (let c = 0; c < MATRIX_W; c++) {
      cells.push(`${MATRIX_PALETTE[matrixBrightness(c, r, frame)]}██`)
    }
    // 每行末尾 RESET,避免颜色泄漏到 ora 接在第 3 行后面的文本上。
    // 后续行的前 2 空格手写,与 ora indent: 2 一起让 3 行 matrix 与 UI 全局缩进对齐。
    lines.push(cells.join(' ') + RESET)
  }
  return lines.join('\n  ')
}

const LED_SPINNER = {
  interval: 110,
  frames: Array.from({ length: MATRIX_FRAMES }, (_, i) => buildMatrixFrame(i)),
}

const SUCCESS_RESULT = { exitCode: 0, stdout: '', stderr: '', all: '' }

type RunOptions = {
  allowFailure?: boolean
  context?: any
  label?: string
  mutates?: boolean
  quiet?: boolean
  showOutput?: boolean
}

export async function run(
  command: string,
  args: string[],
  { label, allowFailure = false, quiet = false, showOutput = false, mutates = false, context }: RunOptions = {},
): Promise<any> {
  const ui = context?.ui ?? createUi()
  const verbose = Boolean(context?.verbose)
  const commandLabel = label ?? formatCommand(command, args)

  if (context?.dryRun && mutates) {
    if (!quiet) {
      ui.status('plan', commandLabel)
      ui.command(command, args)
    }

    return SUCCESS_RESULT
  }

  if (verbose) {
    ui.command(command, args)
  }

  let spinner = null
  if (!quiet && !ui.quiet) {
    if (ui.spinnerEnabled) {
      // indent: 2 与 UI 全局 2 列缩进对齐,让 LED matrix 与 ui.status / ui.step 同一栏排版。
      spinner = ora({
        text: commandLabel,
        spinner: LED_SPINNER,
        stream: ui.stream,
        color: false,
        discardStdin: false,
        indent: 2,
      }).start()
    } else {
      ui.status('run', commandLabel)
    }
  }

  const result = await execute(command, args, spinner, ui, commandLabel)
  const succeeded = result.exitCode === 0
  persistResult(spinner, ui, quiet, succeeded, commandLabel)
  maybePrintOutput(result, ui, quiet, verbose, showOutput, succeeded)

  if (!allowFailure && !succeeded) {
    throw new CliError(`${formatCommand(command, args)} 执行失败。`, {
      exitCode: result.exitCode || 1,
      details: compactOutput(result.all),
      next: verbose ? [] : ['追加 --verbose 可查看完整命令和输出。'],
    })
  }

  return result
}

async function execute(command: string, args: string[], spinner: any, ui: ReturnType<typeof createUi>, commandLabel: string) {
  try {
    return await execa(command, args, { all: true, reject: false })
  } catch (error: any) {
    if (spinner) {
      spinner.stopAndPersist({ symbol: ui.colors.red('x'), text: commandLabel })
    }

    if (error?.code === 'ENOENT') {
      throw new CliError(`缺少命令: ${command}`, {
        next: ['确认依赖已安装，并且命令在 PATH 中。'],
      })
    }

    throw new CliError(`无法执行命令: ${formatCommand(command, args)}`, {
      details: compactOutput(error?.shortMessage ?? error?.message),
    })
  }
}

function persistResult(spinner: any, ui: ReturnType<typeof createUi>, quiet: boolean, succeeded: boolean, commandLabel: string) {
  if (spinner) {
    spinner.stopAndPersist({
      symbol: succeeded ? ui.colors.cyan('+') : ui.colors.red('x'),
      text: commandLabel,
    })
  } else if (!quiet && !ui.quiet) {
    ui.status(succeeded ? 'ok' : 'err', commandLabel)
  }
}

function maybePrintOutput(result: any, ui: ReturnType<typeof createUi>, quiet: boolean, verbose: boolean, showOutput: boolean, succeeded: boolean) {
  const combinedOutput = result.all ?? result.stderr ?? result.stdout ?? ''
  if (!combinedOutput || quiet || ui.quiet || !(verbose || showOutput || !succeeded)) {
    return
  }

  ui.output(combinedOutput, {
    error: !succeeded,
    maxLines: verbose ? Infinity : 30,
  })
}
