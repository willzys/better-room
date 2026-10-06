import { lowering } from '@/plugin/stores/capacity/release'
import { writeOrConfirm } from '@/plugin/stores/collision'
import { erasureStore } from '@/plugin/stores/identity/erasure'
import { membershipLookup, survivalLookup } from '@/plugin/stores/lookups'
import { toMembership } from '@/plugin/stores/rows'
import { memberTable, roomTable } from '@/plugin/stores/table'
import {
  byId,
  capacityGuard,
  SEATABLE,
  UNRELEASED
} from '@/plugin/stores/where'

import type { DBAdapter } from 'better-auth/types'

import type {
  Enrolment,
  SeatingStore,
  Terms
} from '@/core/operations/admission/seating'
import type { RoomStatus } from '@/core/room'
import type { MemberRow } from '@/plugin/stores/rows'
import type { Changes } from '@/plugin/stores/table'
import type { Clause } from '@/plugin/stores/where'
import type { Unbounded } from '@/types/absence'

const taking = (adapter: DBAdapter) => {
  const members = memberTable(adapter)

  return async (
    membershipId: string,
    guard: Clause<MemberRow>[],
    set: Changes<MemberRow>
  ) => {
    const taken = await members.incrementOne({
      where: [...byId(membershipId), ...guard],
      increment: { occupancy: 1 },
      set: { leftAt: null, releasedAt: null, ...set }
    })

    if (taken !== null) {
      return { membership: toMembership(taken), occupied: true }
    }

    const standing = await members.findOne(byId(membershipId))

    return standing === null
      ? null
      : { membership: toMembership(standing), occupied: false }
  }
}

export const seatingStore = (adapter: DBAdapter): SeatingStore => {
  const rooms = roomTable(adapter)
  const members = memberTable(adapter)
  const membership = membershipLookup(adapter)
  const take = taking(adapter)

  const admit = async (
    roomId: string,
    limit: Unbounded<number>,
    open: readonly RoomStatus[]
  ) => {
    const admitted = await rooms.incrementOne({
      where: capacityGuard(roomId, limit, open),
      increment: { memberCount: 1 }
    })

    return admitted !== null
  }

  const vacate = async (member: Enrolment) =>
    toMembership(
      await members.create({
        roomId: member.roomId,
        actorId: member.actorId,
        role: member.role,
        expiresAt: member.expiresAt,
        leftAt: new Date(),
        occupancy: 0
      })
    )

  const enroll = (member: Enrolment) =>
    writeOrConfirm(
      () => vacate(member),
      () => membership(member.roomId, member.actorId)
    )

  const occupy = (membershipId: string, terms: Terms) =>
    take(membershipId, [...SEATABLE, UNRELEASED], {
      role: terms.role,
      expiresAt: terms.expiresAt
    })

  const reinstate = (membershipId: string) => take(membershipId, SEATABLE, {})

  const readmit = (membershipId: string, terms: Terms) =>
    take(membershipId, SEATABLE, {
      role: terms.role,
      expiresAt: terms.expiresAt
    })

  return {
    admit,
    enroll,
    occupy,
    reinstate,
    readmit,
    lowerCount: lowering(adapter),
    survives: survivalLookup(adapter),
    erasure: erasureStore(adapter)
  }
}
