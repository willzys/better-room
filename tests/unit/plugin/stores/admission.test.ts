import { describe, expect, spyOn, test } from 'bun:test'

import { attemptStore } from '@/plugin/stores/admission/attempt'

import { EARLIER, NOW } from '../../../helpers/fixtures'
import { onlyRow } from '../../../helpers/http'
import { empty } from '../../../helpers/memory'
import { adapterFor } from '../../../helpers/stores'

describe('opening an attempt budget', () => {
  test('propagates a counter write failure instead of treating it as contention', async () => {
    const adapter = adapterFor()
    const failure = new Error('database unavailable')
    const insert = spyOn(adapter, 'create').mockRejectedValue(failure)
    try {
      await expect(attemptStore(adapter).open('global', NOW)).rejects.toBe(
        failure
      )
    } finally {
      insert.mockRestore()
    }
  })
})

const spent = () => {
  const db = empty()
  db.roomAttempt.push({
    id: 'attempt-1',
    key: 'global',
    count: 5,
    lastAttemptAt: EARLIER
  })

  return { db, store: attemptStore(adapterFor(db)) }
}

describe('restarting an attempt budget whose window elapsed', () => {
  test('starts the count again from one', async () => {
    const { db, store } = spent()

    expect(await store.restart('global', EARLIER, NOW)).toBe(true)
    expect(onlyRow(db.roomAttempt)).toMatchObject({
      count: 1,
      lastAttemptAt: NOW
    })
  })

  test('leaves alone a budget another attempt touched since it was read', async () => {
    const { db, store } = spent()
    const readAt = new Date(EARLIER.getTime() - 1000)

    expect(await store.restart('global', readAt, NOW)).toBe(false)
    expect(onlyRow(db.roomAttempt)).toMatchObject({
      count: 5,
      lastAttemptAt: EARLIER
    })
  })
})
