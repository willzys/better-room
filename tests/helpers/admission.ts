import { join } from '@/core/operations/admission/join'

import {
  actor as actorFixture,
  room,
  membership,
  roomCode as code,
  NOW
} from './fixtures'

import type { Membership } from '@/core/membership'
import type { JoinStore } from '@/core/operations/admission/join'
import type { ErasureStore } from '@/core/operations/identity/erasure'
import type { Room } from '@/core/room'
import type { RoomCode } from '@/core/room-code'
import type { Usable } from '@/types/absence'

export const actor = actorFixture()

type Calls = {
  actor: number
  admit: number
  enroll: number
  occupy: number
  reinstate: number
  lowered: number
  erased: number
}

export const erasure = (calls: { erased: number }): ErasureStore => ({
  heldBy: () => Promise.resolve([]),
  disown: () => Promise.resolve(),
  forget: () => {
    calls.erased++

    return Promise.resolve()
  },
  discard: () => Promise.resolve(),
  endOccupancy: () => Promise.resolve(true),
  lowerCount: () => Promise.resolve()
})

type Seed = {
  code?: Usable<RoomCode>
  room?: Usable<Room>
  membership?: Usable<Membership>
  admits?: boolean
  occupies?: boolean
  reinstated?: Partial<Membership>
  vanishes?: boolean
  survives?: boolean
}

const taking = (seed: Seed) => (id: string, overrides: Partial<Membership>) =>
  Promise.resolve(
    seed.vanishes === true
      ? null
      : {
          membership: membership({ id, leftAt: null, ...overrides }),
          occupied: seed.occupies ?? true
        }
  )

export const joinFake = (seed: Seed) => {
  const taken = taking(seed)
  const calls: Calls = {
    actor: 0,
    admit: 0,
    enroll: 0,
    occupy: 0,
    reinstate: 0,
    lowered: 0,
    erased: 0
  }
  const instance: JoinStore = {
    code: () => Promise.resolve(seed.code === undefined ? code() : seed.code),
    room: () => Promise.resolve(seed.room === undefined ? room() : seed.room),
    membership: () => Promise.resolve(seed.membership ?? null),
    admit: () => {
      calls.admit++

      return Promise.resolve(seed.admits ?? true)
    },
    enroll: member => {
      calls.enroll++

      return Promise.resolve(membership({ ...member, leftAt: NOW }))
    },
    occupy: (id, terms) => {
      calls.occupy++

      return taken(id, { ...terms, ...seed.reinstated })
    },
    reinstate: id => {
      calls.reinstate++

      return taken(id, seed.reinstated ?? {})
    },
    readmit: () => Promise.reject(new Error('a join never readmits')),
    lowerCount: () => {
      calls.lowered++

      return Promise.resolve()
    },
    survives: () => Promise.resolve(seed.survives ?? true),
    erasure: erasure(calls)
  }

  const resolveActor = () => {
    calls.actor++

    return Promise.resolve(actor)
  }

  return { instance, calls, resolveActor }
}

export const attempt = async (seed: Parameters<typeof joinFake>[0]) => {
  const { instance, calls, resolveActor } = joinFake(seed)
  const outcome = await join(
    { codeIdentifier: 'identifier', actor: resolveActor, now: NOW },
    instance
  )
  return { outcome, calls }
}
