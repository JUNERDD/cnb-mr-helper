import { chmod, mkdir, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { build } from 'esbuild'

const require = createRequire(import.meta.url)
const packageJson = require('./package.json')

await rm('dist', { recursive: true, force: true })
await mkdir('dist', { recursive: true })

await build({
  entryPoints: ['src/index.ts'],
  outfile: 'dist/index.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: ['node20.12'],
  minify: true,
  legalComments: 'none',
  banner: {
    js: 'import{createRequire as __cnbCreateRequire}from"node:module";const require=__cnbCreateRequire(import.meta.url);',
  },
  define: {
    __PACKAGE_VERSION__: JSON.stringify(packageJson.version),
  },
  logLevel: 'info',
})

await chmod('dist/index.js', 0o755)
