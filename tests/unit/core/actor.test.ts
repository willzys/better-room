import { describe, expect, test } from 'bun:test'

import { resolveActor } from '@/core/actor'

import { actor } from '../../helpers/fixtures'

import type { Actor, ActorStore } from '@/core/actor'
import type { Unlinked, Usable } from '@/types/absence'

const store = (seed: { byId?: Usable<Actor>; byUser?: Usable<Actor> }) => {
  const created: Unlinked<string>[] = []

  const instance: ActorStore = {
    byId: () => Promise.resolve(seed.byId ?? null),
    byUser: () => Promise.resolve(seed.byUser ?? null),
    create: userId => {
      created.push(userId)

      return Promise.resolve(actor({ id: 'actor-new', userId }))
    }
  }

  return { instance, created }
}

describe('resolveActor from a session', () => {
  test('returns the actor already linked to the user', async () => {
    const linked = actor({ id: 'actor-linked', userId: 'user-1' })
    const { instance, created } = store({ byUser: linked })

    expect(
      await resolveActor({ userId: 'user-1', claim: null }, instance)
    ).toEqual(linked)
    expect(created).toEqual([])
  })

  test('creates a linked actor the first time a user joins', async () => {
    const { instance, created } = store({})

    const resolved = await resolveActor(
      { userId: 'user-1', claim: null },
      instance
    )

    expect(resolved.userId).toBe('user-1')
    expect(created).toEqual(['user-1'])
  })

  test('lets the session win over a grant that arrives with it', async () => {
    const linked = actor({ id: 'actor-linked', userId: 'user-1' })
    const { instance } = store({ byUser: linked, byId: actor() })

    const resolved = await resolveActor(
      { userId: 'user-1', claim: { actorId: 'actor-1', epoch: 0 } },
      instance
    )

    expect(resolved).toEqual(linked)
  })
})

describe('resolveActor from a grant', () => {
  test('returns the anonymous actor a live grant claims', async () => {
    const anonymous = actor({ grantEpoch: 4 })
    const { instance, created } = store({ byId: anonymous })

    const resolved = await resolveActor(
      { userId: null, claim: { actorId: 'actor-1', epoch: 4 } },
      instance
    )

    expect(resolved).toEqual(anonymous)
    expect(created).toEqual([])
  })

  test.each([
    ['a stale epoch', actor({ grantEpoch: 5 }), 4],
    ['an actor that no longer exists', null, 0]
  ])('creates a fresh anonymous actor for %s', async (_label, byId, epoch) => {
    const { instance, created } = store({ byId })

    const resolved = await resolveActor(
      { userId: null, claim: { actorId: 'actor-1', epoch } },
      instance
    )

    expect(resolved.id).toBe('actor-new')
    expect(created).toEqual([null])
  })

  test('refuses a grant pointing at an actor linked to a user', async () => {
    const promoted = actor({ userId: 'user-1' })
    const { instance, created } = store({ byId: promoted })

    const resolved = await resolveActor(
      { userId: null, claim: { actorId: 'actor-1', epoch: 0 } },
      instance
    )

    expect(resolved.id).toBe('actor-new')
    expect(created).toEqual([null])
  })

  test('creates an anonymous actor when nothing was presented', async () => {
    const { instance, created } = store({})

    const resolved = await resolveActor({ userId: null, claim: null }, instance)

    expect(resolved.userId).toBeNull()
    expect(created).toEqual([null])
  })
})
