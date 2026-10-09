import { describe, expect, spyOn, test } from 'bun:test'

import { signedIn } from '../../helpers/auth'
import { codeOf, jarOf, joinedMember } from '../../helpers/http'
import { join, ledger, promoting } from './harness'

import type { Auth, Harness } from './harness'

const once = (model: string, interruption: () => Promise<unknown>) => {
  const state = { interrupted: false }

  const before = async (query: { readonly model: string }) => {
    if (query.model !== model || state.interrupted) return

    state.interrupted = true
    await interruption()
  }

  return { state, before }
}

const beforeCreating = async (
  auth: Auth,
  model: string,
  interruption: () => Promise<unknown>
) => {
  const { adapter } = await auth.$context
  const real = adapter.create.bind(adapter)
  const pause = once(model, interruption)
  const spy = spyOn(adapter, 'create').mockImplementation(async data => {
    await pause.before(data)

    return real(data)
  })

  return { state: pause.state, restore: () => spy.mockRestore() }
}

const beforeDeleting = async (
  auth: Auth,
  model: string,
  interruption: () => Promise<unknown>
) => {
  const { adapter } = await auth.$context
  const real = adapter.delete.bind(adapter)
  const pause = once(model, interruption)
  const spy = spyOn(adapter, 'delete').mockImplementation(async query => {
    await pause.before(query)

    return real(query)
  })

  return { state: pause.state, restore: () => spy.mockRestore() }
}

const settled = async (auth: Auth) => {
  const { drifted, orphaned } = await ledger(auth)

  expect(drifted).toEqual([])
  expect(orphaned).toEqual([])
}

export const erasureRaceContract = ({ start }: Harness) => {
  describe('removing an actor while it joins', () => {
    test('keeps no seat for a join whose user is deleted before it writes', async () => {
      const auth = await start({})
      const lobby = await auth.api.createRoom({ body: {} })
      const breakout = await auth.api.createRoom({ body: {} })
      const cookie = await signedIn(auth, 'vanishing@example.com')
      await join(auth, lobby.code, cookie)
      const headers = new Headers({ cookie })
      const pause = await beforeCreating(auth, 'roomMember', () =>
        auth.api.deleteUser({ body: {}, headers, asResponse: true })
      )
      const joined = await join(auth, breakout.code, cookie).finally(
        pause.restore
      )

      expect(pause.state.interrupted).toBe(true)
      expect(joined.status).toBe(404)
      expect(await codeOf(joined)).toBe('UNKNOWN_ACTOR')
      await settled(auth)
    })
    test('keeps no seat for a join whose anonymous actor is merged before it writes', async () => {
      const auth = await start({})
      const lobby = await auth.api.createRoom({ body: {} })
      const breakout = await auth.api.createRoom({ body: {} })
      const grant = jarOf(await join(auth, lobby.code))
      const session = await signedIn(auth, 'merging@example.com')
      const pause = await beforeCreating(auth, 'roomMember', () =>
        promoting(auth, `${session}; ${grant}`)
      )
      const joined = await join(auth, breakout.code, grant).finally(
        pause.restore
      )

      expect(pause.state.interrupted).toBe(true)
      expect(joined.status).toBe(404)
      expect(await codeOf(joined)).toBe('UNKNOWN_ACTOR')
      await settled(auth)
    })
  })
}

export const forgettingRaceContract = ({ start }: Harness) => {
  describe('forgetting an actor while a membership lands', () => {
    test('releases a membership that lands just before the actor is forgotten', async () => {
      const auth = await start({})
      const lobby = await auth.api.createRoom({ body: {} })
      const breakout = await auth.api.createRoom({ body: {} })
      const cookie = await signedIn(auth, 'late@example.com')
      const { actorId } = await joinedMember(
        await join(auth, lobby.code, cookie)
      )
      const { adapter } = await auth.$context
      const pause = await beforeDeleting(auth, 'roomActor', async () => {
        await adapter.create({
          model: 'roomMember',
          data: { roomId: breakout.room.id, actorId, role: 'participant' }
        })
        await adapter.incrementOne({
          model: 'room',
          where: [{ field: 'id', value: breakout.room.id }],
          increment: { memberCount: 1 }
        })
      })
      await auth.api
        .deleteUser({
          body: {},
          headers: new Headers({ cookie }),
          asResponse: true
        })
        .finally(pause.restore)

      expect(pause.state.interrupted).toBe(true)
      await settled(auth)
    })
  })
}
