import { APIError } from 'better-auth/api'

import { lowering } from '@/plugin/stores/capacity/release'
import {
  byId,
  byIdentifier,
  capacityGuard,
  found,
  MODELS,
  pairing,
  toCode,
  toMembership,
  toRoom,
  VACATED
} from '@/plugin/stores/rows'

import type { DBAdapter } from 'better-auth/types'

import type {
  Enrolment,
  JoinStore,
  Seated
} from '@/core/operations/admission/join'
import type { CodeRow, Input, MemberRow, RoomRow } from '@/plugin/stores/rows'

const enrolling =
  (adapter: DBAdapter) =>
  async (member: Enrolment): Promise<Seated> => {
    try {
      return {
        membership: toMembership(
          await adapter.create<Input, MemberRow>({
            model: MODELS.member,
            data: {
              roomId: member.roomId,
              actorId: member.actorId,
              role: member.role,
              expiresAt: member.expiresAt
            }
          })
        ),
        occupied: true
      }
    } catch (error) {
      const taken = await adapter.findOne<MemberRow>({
        model: MODELS.member,
        where: pairing(member.roomId, member.actorId)
      })

      if (taken === null) throw error

      return { membership: toMembership(taken), occupied: true }
    }
  }

const reinstating =
  (adapter: DBAdapter) =>
  async (membershipId: string): Promise<Seated> => {
    const reoccupied = await adapter.incrementOne<MemberRow>({
      model: MODELS.member,
      where: [...byId(membershipId), VACATED],
      increment: { occupancy: 1 },
      set: { leftAt: null, releasedAt: null }
    })

    if (reoccupied !== null) {
      return { membership: toMembership(reoccupied), occupied: true }
    }

    const standing = await adapter.findOne<MemberRow>({
      model: MODELS.member,
      where: byId(membershipId)
    })

    if (standing === null) {
      throw new APIError('INTERNAL_SERVER_ERROR', {
        code: 'MEMBERSHIP_VANISHED',
        message: 'The membership disappeared while rejoining'
      })
    }

    return { membership: toMembership(standing), occupied: false }
  }

export const joinStore = (adapter: DBAdapter): JoinStore => ({
  code: async identifier =>
    found(
      await adapter.findOne<CodeRow>({
        model: MODELS.code,
        where: byIdentifier(identifier)
      }),
      toCode
    ),
  room: async id =>
    found(
      await adapter.findOne<RoomRow>({ model: MODELS.room, where: byId(id) }),
      toRoom
    ),
  membership: async (roomId, actorId) =>
    found(
      await adapter.findOne<MemberRow>({
        model: MODELS.member,
        where: pairing(roomId, actorId)
      }),
      toMembership
    ),
  admit: async (roomId, limit) =>
    (await adapter.incrementOne<RoomRow>({
      model: MODELS.room,
      where: capacityGuard(roomId, limit),
      increment: { memberCount: 1 }
    })) !== null,
  enroll: enrolling(adapter),
  reinstate: reinstating(adapter),
  lowerCount: lowering(adapter)
})
