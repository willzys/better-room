import { describe, expect, test } from 'bun:test'

import { survivalLookup } from '@/plugin/stores/lookups'

import { EARLIER } from '../../../helpers/fixtures'
import { empty } from '../../../helpers/memory'
import { adapterFor } from '../../../helpers/stores'

const actorRow = (userId: string | null) => ({
  id: 'actor-1',
  userId,
  grantEpoch: 0,
  createdAt: EARLIER
})

const userRow = {
  id: 'user-1',
  name: 'Someone',
  email: 'someone@example.com',
  emailVerified: false,
  createdAt: EARLIER,
  updatedAt: EARLIER
}

describe('asking whether an actor is still there', () => {
  test('finds an anonymous actor whose row remains', async () => {
    const db = empty()
    db.roomActor.push(actorRow(null))

    expect(
      await survivalLookup(adapterFor(db))({ id: 'actor-1', userId: null })
    ).toBe(true)
  })

  test('finds an actor whose user remains', async () => {
    const db = empty()
    db.user.push(userRow)
    db.roomActor.push(actorRow('user-1'))

    expect(
      await survivalLookup(adapterFor(db))({ id: 'actor-1', userId: 'user-1' })
    ).toBe(true)
  })

  test('misses an actor whose row was forgotten', async () => {
    expect(
      await survivalLookup(adapterFor())({ id: 'actor-1', userId: null })
    ).toBe(false)
  })

  test('misses an actor whose user was deleted', async () => {
    const db = empty()
    db.roomActor.push(actorRow('user-1'))

    expect(
      await survivalLookup(adapterFor(db))({ id: 'actor-1', userId: 'user-1' })
    ).toBe(false)
  })

  test('misses an actor whose link no longer names the same user', async () => {
    const db = empty()
    db.user.push(userRow)
    db.roomActor.push(actorRow(null))

    expect(
      await survivalLookup(adapterFor(db))({ id: 'actor-1', userId: 'user-1' })
    ).toBe(false)
  })
})
