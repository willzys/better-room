import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import EmbeddedPostgres from 'embedded-postgres'
import { MongoMemoryServer } from 'mongodb-memory-server'

const LAUNCH_TIMEOUT = 30000

const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      server.close(error => {
        if (error) reject(error)
        else if (address === null || typeof address === 'string')
          reject(new Error('No TCP port assigned'))
        else resolve(address.port)
      })
    })
  })

const windowsControl = async (
  databaseDir: string,
  port: number,
  action: 'start' | 'stop'
) => {
  if (action === 'stop' && !existsSync(join(databaseDir, 'postmaster.pid')))
    return
  const executable = fileURLToPath(
    new URL(
      '../native/bin/pg_ctl.exe',
      import.meta.resolve('@embedded-postgres/windows-x64')
    )
  )
  const flags =
    action === 'start'
      ? [
          '-l',
          join(databaseDir, 'postgres.log'),
          '-o',
          `-h 127.0.0.1 -p ${port}`
        ]
      : ['-m', 'fast']
  const child = Bun.spawn(
    [executable, action, '-D', databaseDir, '-w', '-t', '15', ...flags],
    { stdout: 'ignore', stderr: 'inherit' }
  )
  if ((await child.exited) !== 0)
    throw new Error(`Could not ${action} temporary PostgreSQL`)
}

const startPostgres = async () => {
  const port = await freePort()
  const databaseDir = await mkdtemp(join(tmpdir(), 'better-room-postgres-'))
  const password = crypto.randomUUID()
  const postgres = new EmbeddedPostgres({
    databaseDir,
    port,
    user: 'postgres',
    password,
    persistent: true,
    postgresFlags: ['-h', '127.0.0.1'],
    onLog: () => undefined
  })
  const stop = () =>
    process.platform === 'win32'
      ? windowsControl(databaseDir, port, 'stop')
      : postgres.stop()
  try {
    await postgres.initialise()
    if (process.platform === 'win32')
      await windowsControl(databaseDir, port, 'start')
    else await postgres.start()
  } catch (error) {
    await stop()
    await rm(databaseDir, { recursive: true, force: true })
    throw error
  }
  return {
    url: `postgresql://postgres:${password}@127.0.0.1:${port}/postgres`,
    close: async () => {
      await stop()
      await rm(databaseDir, { recursive: true, force: true })
    }
  }
}

const startMongo = async () => {
  const server = await MongoMemoryServer.create({
    binary: {
      version: '8.2.1',
      downloadDir: 'node_modules/.cache/mongodb-binaries'
    },
    instance: { ip: '127.0.0.1', launchTimeout: LAUNCH_TIMEOUT }
  })
  return {
    url: server.getUri(),
    close: async () => {
      await server.stop()
    }
  }
}

type TestServer = { url: string; close: () => Promise<void> }

const sharedServer = (variable: string, start: () => Promise<TestServer>) => {
  let pending: Promise<TestServer> | undefined
  let stopped = false

  return {
    address: async () => {
      if (stopped) {
        throw new Error(
          `The shared test server was stopped when an earlier pass ended, and it is never restarted from inside a test. Repeat the run from the shell, or set ${variable} to a server the harness does not own.`
        )
      }

      pending ??= start()
      try {
        return (await pending).url
      } catch (error) {
        pending = undefined
        throw error
      }
    },
    close: async () => {
      const started = pending
      pending = undefined
      stopped ||= started !== undefined
      await (await started)?.close()
    }
  }
}

const postgres = sharedServer('ROOM_POSTGRES_URL', startPostgres)
const mongo = sharedServer('ROOM_MONGODB_URL', startMongo)

export const postgresUrl = async () =>
  process.env.ROOM_POSTGRES_URL ?? (await postgres.address())

export const mongoUrl = async () =>
  process.env.ROOM_MONGODB_URL ?? (await mongo.address())

const closeServers = async () => {
  const results = await Promise.allSettled([postgres.close(), mongo.close()])
  const errors: unknown[] = []
  for (const result of results)
    if (result.status === 'rejected') errors.push(result.reason)
  if (errors.length > 0)
    throw new AggregateError(errors, 'Could not clean up test servers')
}

let shutdown: Promise<void> | undefined
export const stopServers = () => (shutdown ??= closeServers())
