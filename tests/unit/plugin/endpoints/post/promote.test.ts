import { describe, expect, test } from 'bun:test'

import { registered } from '../../../../helpers/auth'
import {
  codeOf,
  joinedMember,
  onlyRow,
  postRoute
} from '../../../../helpers/http'
import { empty, memoryAuth, seedRoom } from '../../../../helpers/memory'

const scenario = async () => {
  const db = empty()
  const code = await seedRoom(db)
  const auth = memoryAuth(db)
  const { actorId } = await joinedMember(
    await auth.api.joinRoom({ body: { code }, asResponse: true })
  )
  const userId = await registered(auth, 'resumed@example.com')

  return { db, auth, actorId, userId }
}

describe('resuming a promotion from the server', () => {
  test('merges the named actor into the user it names', async () => {
    const { db, auth, actorId, userId } = await scenario()

    const resumed = await auth.api.promoteRoomActor({
      body: { actorId, userId }
    })

    expect(resumed).toMatchObject({
      merged: actorId,
      carried: 1,
      discarded: 0,
      complete: true
    })
    const owner = onlyRow(db.roomActor)
    expect(owner.userId).toBe(userId)
    expect(onlyRow(db.roomMember).actorId).toBe(owner.id)
    expect(onlyRow(db.room).memberCount).toBe(1)
  })
})

describe('resuming a promotion refused', () => {
  test('is refused over http, where the caller could name any actor', async () => {
    const { db, auth, actorId, userId } = await scenario()

    const refused = await postRoute(auth, 'promote', { actorId, userId })

    expect(refused.status).toBe(403)
    expect(await codeOf(refused)).toBe('RESUME_IS_SERVER_ONLY')
    expect(onlyRow(db.roomMember).actorId).toBe(actorId)
  })

  test('refuses an actor named without the user it merges into', async () => {
    const { db, auth, actorId } = await scenario()

    const refused = await auth.api.promoteRoomActor({
      body: { actorId },
      asResponse: true
    })

    expect(refused.status).toBe(400)
    expect(await codeOf(refused)).toBe('RESUME_NEEDS_BOTH_NAMES')
    expect(onlyRow(db.roomMember).actorId).toBe(actorId)
  })
})
