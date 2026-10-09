export const generateClient = async () => {
  const generation = Bun.spawn(
    [
      process.execPath,
      'node_modules/prisma/build/index.js',
      'generate',
      '--schema',
      'tests/integration/prisma/schema.prisma'
    ],
    {
      env: {
        ...process.env,
        PRISMA_GENERATE_SKIP_AUTOINSTALL: 'true',
        PRISMA_HIDE_UPDATE_MESSAGE: 'true'
      },
      stdout: 'inherit',
      stderr: 'inherit'
    }
  )
  if ((await generation.exited) !== 0)
    throw new Error('Could not generate the Prisma test client')
}

if (import.meta.main) await generateClient()
