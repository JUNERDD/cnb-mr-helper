import Pastel from 'pastel'
import { normalizeHelpArgv, resolveLifecycleCommand } from '../core/targets.js'
import { runLifecycleCommand } from '../runtime/lifecycle.js'
import { invokedNameFromArgv } from './invocation.js'
import { setCurrentArgv } from './runtime-state.js'

declare const __PACKAGE_VERSION__: string

const DESCRIPTION = '从目标分支准备 CNB 合并请求分支，并在本地处理冲突'
const PACKAGE_VERSION = typeof __PACKAGE_VERSION__ === 'undefined' ? '0.0.0-dev' : __PACKAGE_VERSION__

export async function main(argv = process.argv) {
  argv = normalizeHelpArgv(argv)
  setCurrentArgv(argv)

  const lifecycleCommand = resolveLifecycleCommand(invokedNameFromArgv(argv), argv[2])
  if (lifecycleCommand && !argv.some((arg) => arg === '-h' || arg === '--help')) {
    const exitCode = await runLifecycleCommand(lifecycleCommand, { argv })
    process.exitCode = exitCode
    return
  }

  await new Pastel({
    name: 'mr',
    version: PACKAGE_VERSION,
    description: DESCRIPTION,
    importMeta: import.meta,
  }).run(argv)
}
