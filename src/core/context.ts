import { createUi } from '../ui/terminal.js'

type ContextOptions = {
  color?: boolean
  dryRun?: boolean
  env?: NodeJS.ProcessEnv
  quiet?: boolean
  spinner?: boolean
  ui?: ReturnType<typeof createUi>
  verbose?: boolean
}

export function createContext(options: ContextOptions = {}) {
  const verboseFromEnv = String(options.env?.DEBUG ?? process.env.DEBUG ?? '')
    .split(',')
    .includes('cnb-mr')

  const verbose = Boolean(options.verbose || verboseFromEnv)
  const ui =
    options.ui ??
    createUi({
      color: options.color,
      verbose,
      quiet: options.quiet,
      spinner: options.spinner,
      env: options.env,
    })

  return {
    dryRun: Boolean(options.dryRun),
    verbose,
    ui,
  }
}
