import { afterAll } from 'bun:test'

import { devDependencies } from '../package.json'

if (!Bun.semver.satisfies(Bun.version, `>=${devDependencies.bun}`)) {
  console.error(
    `Bun ${Bun.version} cannot run the database suite. Use yarn test (local Bun ${devDependencies.bun}) or update your global Bun.`
  )
  process.exit(1)
}

const { stopServers } = await import('./helpers/servers')
afterAll(stopServers, 30000)

const interrupt = async () => {
  try {
    await stopServers()
  } finally {
    process.exit(130)
  }
}
process.once('SIGINT', interrupt)
process.once('SIGTERM', interrupt)
