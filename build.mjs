import { chmod, mkdir, readdir, rm, stat } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { build } from 'esbuild'

const require = createRequire(import.meta.url)
const packageJson = require('./package.json')

await rm('dist', { recursive: true, force: true })
await mkdir('dist', { recursive: true })

async function commandEntryPoints(directory) {
  const entries = await readdir(directory)
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry)
      const stats = await stat(path)
      if (stats.isDirectory()) {
        return commandEntryPoints(path)
      }

      return /\.(ts|tsx)$/.test(entry) ? [path] : []
    }),
  )

  return files.flat()
}

await build({
  entryPoints: ['src/index.ts', ...(await commandEntryPoints('src/commands'))],
  outbase: 'src',
  outdir: 'dist',
  bundle: true,
  splitting: true,
  platform: 'node',
  format: 'esm',
  target: ['node20.12'],
  minify: true,
  legalComments: 'none',
  entryNames: '[dir]/[name]',
  chunkNames: 'chunks/[name]-[hash]',
  banner: {
    js: 'import{createRequire as __cnbCreateRequire}from"node:module";const require=__cnbCreateRequire(import.meta.url);',
  },
  define: {
    __PACKAGE_VERSION__: JSON.stringify(packageJson.version),
  },
  logLevel: 'info',
})

await chmod('dist/index.js', 0o755)
