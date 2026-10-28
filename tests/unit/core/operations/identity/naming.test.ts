import { describe, expect, test } from 'bun:test'

import { renameMember } from '@/core/operations/identity/naming'

import {
  actor,
  EARLIER,
  membership,
  NOW,
  room
} from '../../../../helpers/fixtures'

import type { Membership } from '@/core/membership'
import type { NamingStore } from '@/core/operations/identity/naming'
import type { Room } from '@/core/room'
import type { Usable } from '@/types/absence'

const store = (seed: { room?: Usable<Room>; held?: Usable<Membership> }) => {
  const renamed: string[] = []
  const instance: NamingStore = {
    room: () => Promise.resolve(seed.room === undefined ? room() : seed.room),
    membership: () =>
      Promise.resolve(seed.held === undefined ? membership() : seed.held),
    rename: (id, displayName) => {
      renamed.push(id)

      return Promise.resolve(membership({ id, displayName }))
    }
  }

  return { instance, renamed }
}

const naming = (displayName: string, seed = {}) => {
  const { instance, renamed } = store(seed)

  return renameMember(
    { roomId: 'room-1', actor: actor(), displayName, now: NOW },
    instance
  ).then(outcome => ({ outcome, renamed }))
}

describe('renameMember', () => {
  test('names the membership the caller holds', async () => {
    const { outcome } = await naming('Ana')

    expect(outcome).toEqual({
      named: true,
      membership: membership({ displayName: 'Ana' }),
      changed: true
    })
  })

  test('writes nothing for the name it already carries', async () => {
    const { outcome, renamed } = await naming('Ana', {
      held: membership({ displayName: 'Ana' })
    })

    expect(outcome.named && outcome.changed).toBe(false)
    expect(renamed).toEqual([])
  })

  test.each([
    ['no membership', { held: null }, 'not-a-member'],
    [
      'a membership it left',
      { held: membership({ leftAt: EARLIER }) },
      'not-a-member'
    ],
    ['a missing room', { room: null }, 'unknown-room']
  ] as const)('refuses a caller with %s', async (_label, seed, refusal) => {
    const { outcome, renamed } = await naming('Ana', seed)

    expect(outcome).toEqual({ named: false, refusal })
    expect(renamed).toEqual([])
  })
})
