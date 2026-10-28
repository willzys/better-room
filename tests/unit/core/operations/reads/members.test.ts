import { describe, expect, test } from 'bun:test'

import { readMembers } from '@/core/operations/reads/members'

import { actor, membership, NOW, room } from '../../../../helpers/fixtures'

import type { Membership } from '@/core/membership'
import type { MembersStore, Person } from '@/core/operations/reads/members'
import type { Usable } from '@/types/absence'

const store = (seed: {
  held?: Usable<Membership>
  standing: Membership[]
  people: Person[]
}): MembersStore => ({
  room: () => Promise.resolve(room()),
  membership: () =>
    Promise.resolve(seed.held === undefined ? membership() : seed.held),
  standing: () =>
    Promise.resolve({ memberships: seed.standing, complete: true, next: null }),
  people: () => Promise.resolve(seed.people)
})

const request = (fromServer = false) => ({
  roomId: 'room-1',
  actor: actor(),
  fromServer,
  before: null,
  now: NOW
})

describe('readMembers', () => {
  test('names each member by its own name, then by its account', async () => {
    const outcome = await readMembers(
      request(),
      store({
        standing: [
          membership({ actorId: 'a', displayName: 'Ana' }),
          membership({ actorId: 'b' }),
          membership({ actorId: 'c' })
        ],
        people: [
          { actorId: 'a', anonymous: true, accountName: null },
          { actorId: 'b', anonymous: false, accountName: 'Bruno' },
          { actorId: 'c', anonymous: true, accountName: null }
        ]
      })
    )

    expect(
      outcome.read &&
        outcome.members.map(({ name, anonymous }) => ({ name, anonymous }))
    ).toEqual([
      { name: 'Ana', anonymous: true },
      { name: 'Bruno', anonymous: false },
      { name: null, anonymous: true }
    ])
  })

  test('refuses a caller who holds nothing there, but not the server', async () => {
    const seed = { held: null, standing: [], people: [] }

    expect(await readMembers(request(), store(seed))).toEqual({
      read: false,
      refusal: 'not-a-member'
    })
    expect((await readMembers(request(true), store(seed))).read).toBe(true)
  })
})
