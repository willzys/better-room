import { describe, expect, spyOn, test } from 'bun:test'

import { actorStore } from '@/plugin/stores/identity/actor'

import { EARLIER } from '../../../helpers/fixtures'
import { empty } from '../../../helpers/memory'
import { adapterFor } from '../../../helpers/stores'

describe('creating the actor a user resolves to', () => {
  test('hands back the actor another request created first', async () => {
    const db = empty()
    db.roomActor.push({
      id: 'winner',
      userId: 'user-1',
      grantEpoch: 0,
      createdAt: EARLIER
    })
    const adapter = adapterFor(db)
    const insert = spyOn(adapter, 'create').mockRejectedValue(
      new Error('duplicate')
    )
    try {
      expect((await actorStore(adapter).create('user-1')).id).toBe('winner')
    } finally {
      insert.mockRestore()
    }
  })

  test('propagates a failure that no existing actor explains', async () => {
    const adapter = adapterFor()
    const failure = new Error('database unavailable')
    const insert = spyOn(adapter, 'create').mockRejectedValue(failure)
    try {
      await expect(actorStore(adapter).create('user-1')).rejects.toBe(failure)
    } finally {
      insert.mockRestore()
    }
  })

  test('never recovers an anonymous actor from another row', async () => {
    const adapter = adapterFor()
    const failure = new Error('database unavailable')
    const insert = spyOn(adapter, 'create').mockRejectedValue(failure)
    try {
      await expect(actorStore(adapter).create(null)).rejects.toBe(failure)
    } finally {
      insert.mockRestore()
    }
  })
})
