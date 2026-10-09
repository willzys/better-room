import { describe, expect, test } from 'bun:test'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, dirname, join, relative } from 'node:path'

import { betterRoomClient } from '@/client'
import { betterRoom } from '@/plugin'

const ROOT = join(import.meta.dir, '../..')

const filesUnder = (directory: string): string[] =>
  readdirSync(join(ROOT, directory)).flatMap(entry => {
    const path = join(directory, entry)

    return statSync(join(ROOT, path)).isDirectory() ? filesUnder(path) : [path]
  })

const sources = filesUnder('src').filter(path => path.endsWith('.ts'))
const tests = filesUnder('tests').filter(path => path.endsWith('.ts'))
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8')
const stem = (path: string) => basename(path, '.ts')
const lines = (path: string) => read(path).split('\n').length - 1

const offending = (paths: string[], pattern: RegExp, allowed: string[] = []) =>
  paths.filter(path => !allowed.includes(path) && pattern.test(read(path)))

type Endpoints = ReturnType<typeof betterRoom>['endpoints']
type Endpoint = Endpoints[keyof Endpoints]

const serverOnly = (endpoint: Endpoint) => {
  const metadata: unknown =
    'metadata' in endpoint.options ? endpoint.options.metadata : undefined

  return (
    typeof metadata === 'object' &&
    metadata !== null &&
    'SERVER_ONLY' in metadata &&
    metadata.SERVER_ONLY === true
  )
}
const routed = Object.values(betterRoom().endpoints).filter(
  endpoint => !serverOnly(endpoint)
)

const camel = (code: string) =>
  code
    .toLowerCase()
    .replaceAll(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())

describe('the layout of the source', () => {
  test('keeps only the plugin and its options at the root of plugin/', () => {
    const loose = readdirSync(join(ROOT, 'src/plugin')).filter(entry =>
      entry.endsWith('.ts')
    )

    expect(new Set(loose)).toEqual(new Set(['index.ts', 'options.ts']))
  })

  test('has no barrel besides the two public entry points', () => {
    expect(new Set(sources.filter(path => stem(path) === 'index'))).toEqual(
      new Set(['src/index.ts', 'src/plugin/index.ts'])
    )
  })

  test('gives every domain operation a store of the same subject and name', () => {
    const operations = sources.filter(path =>
      path.startsWith('src/core/operations/')
    )
    const missing = operations.filter(
      path =>
        !existsSync(
          join(ROOT, path.replace('src/core/operations/', 'src/plugin/stores/'))
        )
    )

    expect(missing).toEqual([])
  })

  test('mirrors every unit test on a file or a folder of the source', () => {
    const unmirrored = tests
      .filter(
        path => path.startsWith('tests/unit/') && path.endsWith('.test.ts')
      )
      .map(path => relative('tests/unit', path).replace(/\.test\.ts$/, ''))
      .filter(path => path !== 'conventions')
      .filter(path => {
        const subjects = [path, path.replace(/-[a-z]+$/, '')]

        return !subjects.some(
          subject =>
            existsSync(join(ROOT, 'src', `${subject}.ts`)) ||
            existsSync(join(ROOT, 'src', subject))
        )
      })

    expect(unmirrored).toEqual([])
  })

  test('keeps a source file within 200 lines and a test file within 300', () => {
    const long = [
      ...sources.filter(path => lines(path) > 200),
      ...tests.filter(path => lines(path) > 300)
    ]

    expect(long).toEqual([])
  })
})

describe('the names the layers share', () => {
  test('exports <file>Store from every store', () => {
    const stores = sources.filter(path =>
      /^src\/plugin\/stores\/[a-z]+\//.test(path)
    )
    const misnamed = stores.filter(
      path => !read(path).includes(`export const ${stem(path)}Store =`)
    )

    expect(misnamed).toEqual([])
  })

  test('exports <file>Endpoint from every endpoint, answering the method of its folder', () => {
    const endpoints = sources.filter(path =>
      path.startsWith('src/plugin/endpoints/')
    )
    const misplaced = endpoints.filter(path => {
      const method = basename(dirname(path)).toUpperCase()
      const source = read(path)

      return (
        !source.includes(`export const ${stem(path)}Endpoint =`) ||
        !source.includes(`method: '${method}'`)
      )
    })

    expect(misplaced).toEqual([])
  })

  test('serves every route in kebab case under /better-room/', () => {
    const paths = routed.map(endpoint => endpoint.path ?? '')

    expect(
      paths.filter(path => !/^\/better-room\/[a-z]+(-[a-z]+)*$/.test(path))
    ).toEqual([])
  })
})

describe('the boundary of the http router', () => {
  test('keeps every administrative operation off the router', () => {
    const administrative = Object.entries(betterRoom().endpoints)
      .filter(([, endpoint]) => serverOnly(endpoint))
      .map(([name]) => name)

    expect(new Set(administrative)).toEqual(
      new Set([
        'addRoomMember',
        'revokeRoomMember',
        'rotateRoomCode',
        'lockRoom',
        'unlockRoom',
        'closeRoom',
        'reconcileRoomCapacity'
      ])
    )
  })
})

describe('the names the client and the errors share', () => {
  test('declares exactly the POST routes in the client', () => {
    const posted = routed
      .filter(endpoint => endpoint.options.method === 'POST')
      .map(endpoint => endpoint.path)

    const declared = Object.keys(betterRoomClient().pathMethods)

    expect(new Set(declared)).toEqual(new Set(posted))
  })

  test('names each single error after the code it raises', () => {
    const declared = [
      ...read('src/plugin/errors/refusals.ts').matchAll(
        /export const (\w+) = failing\(\s*'\w+',\s*ROOM_ERROR_CODES\.(\w+)/g
      )
    ]
    const misnamed = declared
      .filter(([, name, code]) => name !== `${camel(code ?? '')}Error`)
      .map(([, name]) => name)

    expect(declared.length).toBeGreaterThan(0)
    expect(misnamed).toEqual([])
  })

  test('names each refusal table <operation>Error', () => {
    const tables = [
      ...read('src/plugin/errors/refusals.ts').matchAll(
        /export const (\w+) = refusing</g
      )
    ].map(([, name]) => name)

    expect(tables.length).toBeGreaterThan(0)
    expect(tables.filter(name => !name?.endsWith('Error'))).toEqual([])
  })
})

describe('the rules the code keeps', () => {
  test.each([
    [
      'reaches the adapter only through the typed tables',
      /\badapter\.\w+\(/,
      ['src/plugin/stores/table.ts']
    ],
    [
      'asks for a server call only through isServerCall',
      /ctx\.request [!=]== undefined/,
      ['src/plugin/http/carrier.ts']
    ],
    [
      'binds a guarded answer to a name before testing it',
      /if \(!\(await /,
      []
    ],
    [
      'names every absence instead of spelling | null',
      /\| null\b/,
      ['src/types/absence.ts']
    ],
    ['never groups a query with a connector', /\bconnector:/, []],
    [
      'folds case only through the explicit ASCII table',
      /\.to(?:Upper|Lower)Case\(/,
      ['src/security/code-format.ts']
    ],
    [
      'carries no comment beyond the one already there',
      /^\s*(?:\/\/|\/\*)/m,
      ['src/index.ts']
    ]
  ] as const)('%s', (_rule, pattern, allowed) => {
    expect(offending(sources, pattern, [...allowed])).toEqual([])
  })

  test('leaves no focused, skipped or pending test behind', () => {
    expect(
      offending(
        tests.filter(path => path !== 'tests/unit/conventions.test.ts'),
        /\b(?:test|describe|it)\.(?:only|skip|todo)\(/
      )
    ).toEqual([])
  })
})
