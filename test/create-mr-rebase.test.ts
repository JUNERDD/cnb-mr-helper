import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { test } from 'vitest'
import { createContext } from '../src/core/context.js'
import { createUi } from '../src/ui/terminal.js'
import { createMrFromTargetBranch } from '../src/workflow/create-mr.js'

const execFileAsync = promisify(execFile)

async function git(cwd: string, args: string[]) {
  await execFileAsync('git', args, { cwd })
}

async function gitOutput(cwd: string, args: string[]) {
  const result = await execFileAsync('git', args, { cwd })
  return result.stdout.trim()
}

test('creates the MR branch by rebasing current changes onto the target branch', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mr-rebase-'))
  const originalCwd = process.cwd()
  const originalPath = process.env.PATH

  try {
    const remote = join(root, 'origin.git')
    const repo = join(root, 'repo')
    const bin = join(root, 'bin')
    await mkdir(repo)
    await mkdir(bin)
    await writeFile(
      join(bin, 'git-cnb'),
      [
        '#!/bin/sh',
        'if [ "$1" = "-h" ]; then exit 0; fi',
        'if [ "$1" = "pull" ] && [ "$2" = "create" ]; then exit 0; fi',
        'echo "unexpected git cnb $*" >&2',
        'exit 1',
        '',
      ].join('\n'),
    )
    await chmod(join(bin, 'git-cnb'), 0o755)

    await git(root, ['init', '--bare', remote])
    await git(repo, ['init'])
    await git(repo, ['config', 'user.name', 'Test User'])
    await git(repo, ['config', 'user.email', 'test@example.com'])
    await writeFile(join(repo, 'README.md'), 'base\n')
    await git(repo, ['add', 'README.md'])
    await git(repo, ['commit', '-m', 'base'])
    await git(repo, ['branch', '-M', 'main'])
    await git(repo, ['remote', 'add', 'origin', remote])
    await git(repo, ['push', '-u', 'origin', 'main'])

    await git(repo, ['switch', '-c', 'test'])
    await writeFile(join(repo, 'target.txt'), 'target\n')
    await git(repo, ['add', 'target.txt'])
    await git(repo, ['commit', '-m', 'target'])
    await git(repo, ['push', '-u', 'origin', 'test'])

    await git(repo, ['switch', 'main'])
    await git(repo, ['switch', '-c', 'feature/demo'])
    await writeFile(join(repo, 'feature.txt'), 'feature\n')
    await git(repo, ['add', 'feature.txt'])
    await git(repo, ['commit', '-m', 'feature'])

    process.chdir(repo)
    process.env.PATH = `${bin}:${originalPath ?? ''}`

    const context = createContext({
      ui: createUi({
        quiet: true,
        stream: { isTTY: false, write() { return true } } as any,
      }),
    })

    await createMrFromTargetBranch('test', context)

    assert.equal(await gitOutput(repo, ['branch', '--show-current']), 'feature/demo')
    await git(repo, ['merge-base', '--is-ancestor', 'origin/test', 'mr/test/feature/demo'])
    assert.equal(await gitOutput(repo, ['rev-list', '--merges', '--count', 'origin/test..mr/test/feature/demo']), '0')
    assert.equal(await gitOutput(repo, ['log', '--format=%s', 'origin/test..mr/test/feature/demo']), 'feature')
  } finally {
    process.chdir(originalCwd)
    if (originalPath === undefined) {
      delete process.env.PATH
    } else {
      process.env.PATH = originalPath
    }
    await rm(root, { recursive: true, force: true })
  }
})
