#!/usr/bin/env node

import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { main } from './cli/program.js'
import { CliError, compactOutput } from './core/errors.js'
import { createUi } from './ui/terminal.js'

function isDirectRun() {
  const entry = process.argv[1]
  if (!entry) {
    return false
  }

  try {
    return realpathSync(entry) === fileURLToPath(import.meta.url)
  } catch {
    return false
  }
}

function colorOptionFromArgv(argv: string[]) {
  if (argv.includes('--color')) {
    return true
  }

  if (argv.includes('--no-color')) {
    return false
  }

  return undefined
}

if (isDirectRun()) {
  main().catch((error) => {
    const ui = createUi({ color: colorOptionFromArgv(process.argv) })
    if (error instanceof CliError) {
      ui.error(error)
      process.exit(error.exitCode || 1)
    }

    ui.error(new CliError(error?.message ?? '未知错误。', { details: compactOutput(error?.stack) }))
    process.exit(1)
  })
}
