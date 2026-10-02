import { existsSync } from 'node:fs'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'

import { defineConfig } from 'tsdown'

// Toolchain debt: dts map referenced, never emitted; drop when fixed upstream.
const trailingSourceMap = /\n\/\/# sourceMappingURL=(.+?)\s*$/

const stripDanglingDeclarationMaps = async (outDir: string) => {
  const declarations = (await readdir(outDir, { recursive: true }))
    .filter(entry => /\.d\.[cm]?ts$/.test(entry))
    .map(entry => join(outDir, entry))

  await Promise.all(
    declarations.map(async file => {
      const content = await readFile(file, 'utf8')
      const target = trailingSourceMap.exec(content)?.[1]

      if (!target || existsSync(resolve(dirname(file), target))) return

      await writeFile(file, content.replace(trailingSourceMap, '\n'))
    })
  )
}

export default defineConfig({
  entry: ['src/index.ts', 'src/client.ts'],
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  dts: true,
  clean: true,
  treeshake: true,
  sourcemap: true,
  publint: true,
  hooks: {
    'build:done': ctx => stripDanglingDeclarationMaps(ctx.options.outDir)
  }
})
