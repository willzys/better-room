import { spyOn } from 'bun:test'
import { createHmac } from 'node:crypto'

import { SECRET } from './auth'

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

export const addressKey = (ip: string) =>
  `address:${createHmac('sha256', createHmac('sha256', SECRET).update('better-room:address:v1').digest()).update(ip).digest('hex')}`
