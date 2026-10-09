import { describe, expect, test } from 'bun:test'

import { join } from '@/core/operations/admission/join'
import { leave } from '@/core/operations/capacity/leave'
import { joinStore } from '@/plugin/stores/admission/join'
import { leaveStore } from '@/plugin/stores/capacity/leave'
import { actorStore } from '@/plugin/stores/identity/actor'
import { codeFormat } from '@/security/code-format'
import { codeIdentifier } from '@/security/code-identifier'

import { SECRET } from '../../helpers/auth'
import { codeOf, onlyRow, stringField } from '../../helpers/http'
import { sqliteFixture } from '../../helpers/sqlite'

import type { Actor } from '@/core/actor'

const fixture = sqliteFixture()
const { auth, rows } = fixture

const gate = () => {
  const reached = Promise.withResolvers<void>()
  const released = Promise.withResolvers<void>()

  return {
    reached: reached.promise,
    release: () => released.resolve(),
    pause: async () => {
      reached.resolve()
      await released.promise
    }
  }
}

const joining = (instance: ReturnType<typeof auth>, code: string) =>
  instance.api.joinRoom({ body: { code }, asResponse: true })

const identify = (code: string) =>
  codeIdentifier({ format: codeFormat('crockford'), secret: SECRET })(code)

const joinedActor = async () => {
  const adapter = await fixture.adapter()
  const id = stringField(onlyRow(rows('roomActor')), 'id')
  const found = await actorStore(adapter).byId(id)

  if (found === null) throw new Error('the joined actor is missing')

  return { adapter, actor: found }
}

type Seam = ReturnType<typeof gate>

const identity = async (code: string) => {
  const found = await identify(code)

  if (found === null) throw new Error('the code is not usable')

  return found
}

const departing = async (
  seam: Seam,
  roomId: string,
  adapter: Awaited<ReturnType<typeof joinedActor>>['adapter'],
  actor: Actor
) => {
  const leaving = leaveStore(adapter)

  return leave(
    { roomId, actor, now: new Date() },
    {
      ...leaving,
      lowerCount: async id => {
        await seam.pause()
        await leaving.lowerCount(id)
      }
    }
  )
}

const reentering = async (
  seam: Seam,
  code: string,
  adapter: Awaited<ReturnType<typeof joinedActor>>['adapter'],
  actor: Actor
) => {
  const joins = joinStore(adapter)
  const resolved = await identity(code)

  return join(
    {
      codeIdentifier: resolved,
      actor: () => Promise.resolve(actor),
      now: new Date()
    },
    {
      ...joins,
      reinstate: async id => {
        await seam.pause()

        return joins.reinstate(id)
      }
    }
  )
}

describe('a rejoin overlapping the leave it follows', () => {
  test('pays for the seat the pending decrement is about to return', async () => {
    const instance = auth()
    const created = await instance.api.createRoom({ body: { maxMembers: 2 } })

    await joining(instance, created.code)

    const { adapter, actor } = await joinedActor()
    const afterClaim = gate()
    const afterAdmit = gate()

    const departure = departing(afterClaim, created.room.id, adapter, actor)

    await afterClaim.reached

    expect(onlyRow(rows('roomMember')).occupancy).toBe(0)

    const reentry = reentering(afterAdmit, created.code, adapter, actor)

    await afterAdmit.reached

    expect(onlyRow(rows('room')).memberCount).toBe(2)

    afterClaim.release()
    await departure

    expect(onlyRow(rows('room')).memberCount).toBe(1)

    afterAdmit.release()

    expect((await reentry).admitted).toBe(true)

    const member = onlyRow(rows('roomMember'))

    expect(member.occupancy).toBe(1)
    expect(member.leftAt).toBeNull()
    expect(onlyRow(rows('room')).memberCount).toBe(1)

    expect((await joining(instance, created.code)).status).toBe(200)
    expect(onlyRow(rows('room')).memberCount).toBe(2)

    const refused = await joining(instance, created.code)

    expect(refused.status).toBe(409)
    expect(await codeOf(refused)).toBe('ROOM_AT_CAPACITY')
  })
})
