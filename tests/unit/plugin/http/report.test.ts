import { describe, expect, test } from 'bun:test'

import { codeFormat, generate } from '@/security/code-format'

import {
  jarOf,
  listedMemberships,
  onlyRow,
  reportedRoom,
  stringField
} from '../../../helpers/http'
import { empty, memoryAuth, seedRoom } from '../../../helpers/memory'

const format = codeFormat('crockford')

const seeded = async () => {
  const db = empty()
  const code = generate(format)
  await seedRoom(db, { plaintext: code })
  onlyRow(db.room).topic = 'retrospective'

  const auth = memoryAuth(db)
  const cookie = jarOf(
    await auth.api.joinRoom({ body: { code }, asResponse: true })
  )

  return { auth, cookie, db, roomId: stringField(onlyRow(db.room), 'id') }
}

describe('a report publishing a room', () => {
  test('leaves an application column out of the access it reports', async () => {
    const { auth, cookie, db, roomId } = await seeded()

    const reported = await reportedRoom(
      await auth.api.getRoomAccess({
        query: { roomId },
        headers: new Headers({ cookie }),
        asResponse: true
      })
    )

    expect(reported.id).toBe(roomId)
    expect(reported).not.toHaveProperty('topic')
    expect(onlyRow(db.room).topic).toBe('retrospective')
  })

  test('leaves an application column out of every membership it lists', async () => {
    const { auth, cookie, db } = await seeded()

    const { memberships: listed } = await listedMemberships(
      await auth.api.listRoomMemberships({
        headers: new Headers({ cookie }),
        asResponse: true
      })
    )

    expect(listed).toHaveLength(1)
    expect(listed[0]?.room).not.toHaveProperty('topic')
    expect(onlyRow(db.room).topic).toBe('retrospective')
  })
})
