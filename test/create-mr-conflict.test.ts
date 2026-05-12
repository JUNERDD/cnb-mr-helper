import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { test } from 'vitest'
import { createContext } from '../src/core/context.js'
import { CliError } from '../src/core/errors.js'
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

test('merge conflicts leave the user on the MR branch with the conflict unresolved', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mr-conflict-'))
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
    await writeFile(join(repo, 'file.txt'), 'base\n')
    await git(repo, ['add', 'file.txt'])
    await git(repo, ['commit', '-m', 'base'])
    await git(repo, ['branch', '-M', 'main'])
    await git(repo, ['remote', 'add', 'origin', remote])
    await git(repo, ['push', '-u', 'origin', 'main'])

    await git(repo, ['switch', '-c', 'test'])
    await writeFile(join(repo, 'file.txt'), 'target\n')
    await git(repo, ['commit', '-am', 'target'])
    await git(repo, ['push', '-u', 'origin', 'test'])

    await git(repo, ['switch', 'main'])
    await git(repo, ['switch', '-c', 'feature/demo'])
    await writeFile(join(repo, 'file.txt'), 'feature\n')
    await git(repo, ['commit', '-am', 'feature'])

    process.chdir(repo)
    process.env.PATH = `${bin}:${originalPath ?? ''}`

    const context = createContext({
      ui: createUi({
        quiet: true,
        stream: { isTTY: false, write() { return true } } as any,
      }),
    })

    await assert.rejects(
      createMrFromTargetBranch('test', context),
      (error: unknown) => {
        assert.ok(error instanceof CliError)
        assert.match(error.message, /发生冲突/)
        assert.equal(error.next[0], '当前停留在 mr/test/feature/demo 的冲突状态，请直接解决冲突。')
        return true
      },
    )

    assert.equal(await gitOutput(repo, ['branch', '--show-current']), 'mr/test/feature/demo')
    assert.match(await gitOutput(repo, ['rev-parse', '--verify', 'MERGE_HEAD']), /^[0-9a-f]{40}$/u)
    assert.match(await gitOutput(repo, ['status', '--porcelain']), /^UU file\.txt/m)
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
