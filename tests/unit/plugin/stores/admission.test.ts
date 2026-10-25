import { describe, expect, spyOn, test } from 'bun:test'

import { attemptStore } from '@/plugin/stores/admission/attempt'
import { pruningStore } from '@/plugin/stores/admission/pruning'

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

describe('counting an attempt inside its window', () => {
  const before = new Date(EARLIER.getTime() - 60_000)

  test('moves the last attempt forward to a later one', async () => {
    const { db, store } = spent()

    expect(await store.bump('global', before, NOW)).toBe(true)
    expect(onlyRow(db.roomAttempt)).toMatchObject({
      count: 6,
      lastAttemptAt: NOW
    })
  })

  test('counts an attempt that finished late without moving the last one back', async () => {
    const { db, store } = spent()
    const started = new Date(EARLIER.getTime() - 1000)

    expect(await store.bump('global', before, started)).toBe(true)
    expect(onlyRow(db.roomAttempt)).toMatchObject({
      count: 6,
      lastAttemptAt: EARLIER
    })
  })
})

describe('pruning attempt budgets', () => {
  test('keeps a budget that came back to life after it was read', async () => {
    const { db } = spent()
    const store = pruningStore(adapterFor(db))

    const keys = await store.expired(NOW, 10)
    db.roomAttempt[0] = { ...onlyRow(db.roomAttempt), lastAttemptAt: NOW }

    expect(keys).toEqual(['global'])
    expect(await store.discard(keys, NOW)).toBe(0)
    expect(db.roomAttempt).toHaveLength(1)
  })
})
