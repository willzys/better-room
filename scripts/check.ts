import { readdir } from 'node:fs/promises'
import { join } from 'node:path'

const files = async (directory: string): Promise<string[]> => {
  const entries = await readdir(directory, { withFileTypes: true }).catch(
    () => []
  )
  const nested = await Promise.all(
    entries.map(entry => {
      const path = join(directory, entry.name)

      return entry.isDirectory()
        ? files(path)
        : Promise.resolve(path.endsWith('.ts') ? [path] : [])
    })
  )

  return nested.flat()
}

const mode = process.argv[2]

if (mode !== 'lint' && mode !== 'format') {
  throw new Error('Expected lint or format')
}

const executable = mode === 'lint' ? 'oxlint' : 'oxfmt'
const child = Bun.spawn(
  [
    'node',
    `node_modules/${executable}/bin/${executable}`,
    ...process.argv.slice(3),
    '.',
    ...(await files('tests'))
  ],
  { stdout: 'inherit', stderr: 'inherit' }
)

process.exitCode = await child.exited
