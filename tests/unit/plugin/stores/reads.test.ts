import { describe, expect, spyOn, test } from 'bun:test'

import { membershipsStore } from '@/plugin/stores/reads/memberships'

import { EARLIER, LATER, NOW } from '../../../helpers/fixtures'
import { empty } from '../../../helpers/memory'
import { adapterFor } from '../../../helpers/stores'

import type { Where } from 'better-auth/types'

import type { Usable } from '@/types/absence'

import type { Tables } from '../../../helpers/memory'

const HELD_CEILING = 200

const heldBy = (db: Tables) =>
  membershipsStore(adapterFor(db)).held('actor-1', NOW, null, HELD_CEILING)

const clauseFor = (where: Where[] | undefined, field: string) =>
  where?.find(clause => clause.field === field)

const seedHeld = (db: Tables, count: number, expiresAt: Usable<Date>) => {
  for (let index = 1; index <= count; index++) {
    db.roomMember.push({
      id: `member-${expiresAt === null ? 'p' : 'd'}-${index}`,
      roomId: `room-${expiresAt === null ? 'p' : 'd'}-${index}`,
      actorId: 'actor-1',
      role: 'participant',
      joinedAt: new Date(
        NOW.getTime() - index * 2 + (expiresAt === null ? 0 : 1)
      ),
      expiresAt,
      leftAt: null,
      revokedAt: null
    })
  }
}

describe('reading the memberships an actor holds', () => {
  test('excludes an expired membership in the query, not after it', async () => {
    const adapter = adapterFor()
    const seen: (Where[] | undefined)[] = []
    const read = spyOn(adapter, 'findMany').mockImplementation(
      ({ where }: { where?: Where[] | undefined }) => {
        seen.push(where)

        return Promise.resolve([])
      }
    )
    try {
      await membershipsStore(adapter).held('actor-1', NOW, null, HELD_CEILING)
    } finally {
      read.mockRestore()
    }

    expect(seen).toHaveLength(2)
    const [perpetual, dated] = seen
    expect(clauseFor(perpetual, 'expiresAt')).toEqual({
      field: 'expiresAt',
      value: null
    })
    expect(clauseFor(dated, 'expiresAt')).toEqual({
      field: 'expiresAt',
      operator: 'gt',
      value: NOW
    })
    for (const where of seen) {
      expect(clauseFor(where, 'actorId')?.value).toBe('actor-1')
      expect(clauseFor(where, 'leftAt')?.value).toBeNull()
      expect(clauseFor(where, 'revokedAt')?.value).toBeNull()
      expect(where?.some(clause => clause.connector === 'OR')).toBe(false)
    }
  })

  test('never lets an expired membership consume the window', async () => {
    const db = empty()
    seedHeld(db, HELD_CEILING, EARLIER)
    db.roomMember.push({
      id: 'member-oldest',
      roomId: 'room-oldest',
      actorId: 'actor-1',
      role: 'participant',
      joinedAt: new Date(NOW.getTime() - 10 ** 6),
      expiresAt: null,
      leftAt: null,
      revokedAt: null
    })

    const standing = await heldBy(db)

    expect(standing.memberships.map(entry => entry.id)).toEqual([
      'member-oldest'
    ])
    expect(standing.complete).toBe(true)
  })
})

describe('reading the memberships of a saturated window', () => {
  test('reports an incomplete answer once a window saturates', async () => {
    const db = empty()
    seedHeld(db, HELD_CEILING + 1, null)

    const standing = await heldBy(db)

    expect(standing.memberships).toHaveLength(HELD_CEILING)
    expect(standing.complete).toBe(false)
    expect(standing.next).not.toBeNull()
  })
})

describe('reading the memberships an actor holds across windows', () => {
  test('keeps the answer complete while both windows have room', async () => {
    const db = empty()
    seedHeld(db, 2, null)
    seedHeld(db, 2, LATER)

    const standing = await heldBy(db)

    expect(standing.memberships).toHaveLength(4)
    expect(standing.complete).toBe(true)
  })

  test('reports incompleteness when the merge had to drop rows', async () => {
    const db = empty()
    seedHeld(db, HELD_CEILING - 1, null)
    seedHeld(db, HELD_CEILING - 1, LATER)

    const standing = await heldBy(db)

    expect(standing.memberships).toHaveLength(HELD_CEILING)
    expect(standing.complete).toBe(false)
    expect(standing.next).not.toBeNull()
  })

  test('stays complete when both windows fit together exactly', async () => {
    const db = empty()
    seedHeld(db, HELD_CEILING / 2, null)
    seedHeld(db, HELD_CEILING / 2, LATER)

    const standing = await heldBy(db)

    expect(standing.memberships).toHaveLength(HELD_CEILING)
    expect(standing.complete).toBe(true)
  })

  test('lists every perpetual membership before the dated ones', async () => {
    const db = empty()
    seedHeld(db, 2, null)
    seedHeld(db, 2, LATER)

    const standing = await heldBy(db)

    expect(standing.memberships.map(entry => entry.id)).toEqual([
      'member-p-1',
      'member-p-2',
      'member-d-1',
      'member-d-2'
    ])
  })

  test('leaves another actor memberships out of the answer', async () => {
    const db = empty()
    seedHeld(db, 2, null)
    db.roomMember.push({
      id: 'member-someone-else',
      roomId: 'room-elsewhere',
      actorId: 'actor-2',
      role: 'participant',
      joinedAt: NOW,
      expiresAt: null,
      leftAt: null,
      revokedAt: null
    })

    const standing = await heldBy(db)

    expect(standing.memberships.map(entry => entry.actorId)).toEqual([
      'actor-1',
      'actor-1'
    ])
  })
})
