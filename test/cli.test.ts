import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { buildDryRunCommands } from '../src/core/dry-run.js'
import { formatCommand } from '../src/core/format.js'
import { isInteractiveInvocation, normalizeHelpArgv, resolveLifecycleCommand, resolveTargetFromInvocation } from '../src/core/targets.js'
import { createSelectConfig, selectTarget } from '../src/ui/select-target.js'
import { createUi, resolveColorEnabled } from '../src/ui/terminal.js'

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)))

async function listSourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = await Promise.all(
    entries.map((entry) => {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) {
        return listSourceFiles(path)
      }

      return entry.name.endsWith('.ts') ? [path] : []
    }),
  )

  return files.flat()
}

test('resolveTargetFromInvocation maps short binaries to target branches', () => {
  assert.equal(resolveTargetFromInvocation('mrm'), 'master')
  assert.equal(resolveTargetFromInvocation('mrt'), 'test')
  assert.equal(resolveTargetFromInvocation('mrp'), 'prerelease')
})

test('resolveTargetFromInvocation maps short target aliases', () => {
  assert.equal(resolveTargetFromInvocation('mr', 'mrm'), 'master')
  assert.equal(resolveTargetFromInvocation('mr', 'release/2026-05'), 'release/2026-05')
})

test('mr without a target is interactive, explicit targets are not', () => {
  assert.equal(isInteractiveInvocation('mr'), true)
  assert.equal(isInteractiveInvocation('mr', 'test'), false)
  assert.equal(isInteractiveInvocation('mrm'), false)
})

test('mr reserves lifecycle subcommands', () => {
  assert.equal(resolveLifecycleCommand('mr', 'update'), 'update')
  assert.equal(resolveLifecycleCommand('mr', 'uninstall'), 'uninstall')
  assert.equal(resolveLifecycleCommand('mrm', 'update'), undefined)
})

test('normalizeHelpArgv maps mr -help to --help', () => {
  assert.deepEqual(normalizeHelpArgv(['node', 'mr', '-help']), ['node', 'mr', '--help'])
  assert.deepEqual(normalizeHelpArgv(['node', 'mr', '-h']), ['node', 'mr', '-h'])
})

test('selectTarget fails fast outside an interactive terminal', async () => {
  await assert.rejects(
    selectTarget({ input: { isTTY: false } as any, output: { isTTY: false } as any, ui: createUi() }),
    /交互式终端/,
  )
})

test('createSelectConfig maps the three target choices', () => {
  const ui = createUi({ color: false, stream: { isTTY: false, write() { return true } } as any, env: {} })
  const config = createSelectConfig(ui)

  assert.equal(config.theme.indexMode, 'number')
  assert.deepEqual(
    config.choices.map((choice) => choice.value),
    ['master', 'test', 'prerelease'],
  )
})

test('formatCommand keeps shell-like output readable', () => {
  assert.equal(formatCommand('git', ['push', 'origin', 'HEAD:mr/master/feature/a']), 'git push origin HEAD:mr/master/feature/a')
  assert.equal(formatCommand('git', ['switch', 'feature with space']), 'git switch "feature with space"')
})

test('resolveColorEnabled follows explicit flags and terminal conventions', () => {
  assert.equal(resolveColorEnabled(true, { NO_COLOR: '1' }, { isTTY: false } as any), true)
  assert.equal(resolveColorEnabled(false, { FORCE_COLOR: '1' }, { isTTY: true } as any), false)
  assert.equal(resolveColorEnabled(undefined, { NO_COLOR: '1' }, { isTTY: true } as any), false)
  assert.equal(resolveColorEnabled(undefined, { TERM: 'dumb' }, { isTTY: true } as any), false)
  assert.equal(resolveColorEnabled(undefined, { FORCE_COLOR: '1' }, { isTTY: false } as any), true)
  assert.equal(resolveColorEnabled(undefined, {}, { isTTY: true } as any), true)
})

test('buildDryRunCommands includes the core MR workflow', () => {
  const commands = buildDryRunCommands('test', 'feature/demo')
  const rendered = commands.map(({ command, args }) => formatCommand(command, args))

  assert.deepEqual(rendered, [
    'git fetch origin +test:refs/remotes/origin/test',
    'git ls-remote --exit-code --heads origin mr/test/feature/demo',
    'git push origin HEAD:mr/test/feature/demo',
    'git cnb pull create -H mr/test/feature/demo -B test',
    'git switch -C mr/test/feature/demo origin/test',
    'git branch --set-upstream-to origin/mr/test/feature/demo mr/test/feature/demo',
    'git merge --no-edit feature/demo',
    'git push origin HEAD:mr/test/feature/demo',
    'git switch feature/demo',
  ])
})

test('source files stay below the 300 line module limit', async () => {
  const sourceFiles = await listSourceFiles(join(projectRoot, 'src'))

  for (const file of sourceFiles) {
    const source = await readFile(file, 'utf8')
    const lineCount = source.trimEnd().split('\n').length
    assert.ok(lineCount <= 300, `${file} has ${lineCount} lines`)
  }
})
