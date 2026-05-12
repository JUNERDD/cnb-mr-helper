import { basename } from 'node:path'
import { fileURLToPath } from 'node:url'

export function invokedNameFromArgv(argv: string[] = process.argv) {
  return basename(argv[1] ?? fileURLToPath(import.meta.url))
}
