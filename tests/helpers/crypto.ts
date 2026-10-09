import { spyOn } from 'bun:test'

export const countingImports = async <T>(
  run: (imports: () => number) => Promise<T>
) => {
  const spy = spyOn(crypto.subtle, 'importKey')
  try {
    return await run(() => spy.mock.calls.length)
  } finally {
    spy.mockRestore()
  }
}
