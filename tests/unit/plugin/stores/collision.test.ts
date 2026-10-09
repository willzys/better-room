import { describe, expect, spyOn, test } from 'bun:test'

import { joinStore } from '@/plugin/stores/admission/join'
import { promotionStore } from '@/plugin/stores/identity/promotion'

import { onlyRow, stringField } from '../../../helpers/http'
import { empty } from '../../../helpers/memory'
import { adapterFor, occupied, seated, lost } from '../../../helpers/stores'

const losingAnInsert = (adapter: ReturnType<typeof adapterFor>) => {
  const real = adapter.create.bind(adapter)

  return spyOn(adapter, 'create').mockImplementation(async data => {
    await real(data)

    throw lost
  })
}

const losingAnUpdate = (adapter: ReturnType<typeof adapterFor>) => {
  const real = adapter.update.bind(adapter)

  return spyOn(adapter, 'update').mockImplementation(async data => {
    await real(data)

    throw lost
  })
}

describe('a write whose acknowledgement is lost', () => {
  test('keeps the vacant membership an enrolment actually wrote', async () => {
    const db = empty()
    seated(db, 1)
    const adapter = adapterFor(db)
    const write = losingAnInsert(adapter)
    try {
      const vacant = await joinStore(adapter).enroll({
        roomId: 'room-1',
        actorId: 'actor-1',
        role: 'participant',
        expiresAt: null
      })

      expect(vacant.id).toBe(stringField(onlyRow(db.roomMember), 'id'))
    } finally {
      write.mockRestore()
    }

    expect(onlyRow(db.roomMember).occupancy).toBe(0)
  })

  test('keeps the membership a promotion actually moved', async () => {
    const db = empty()
    seated(db, 1)
    db.roomMember.push(occupied())
    const adapter = adapterFor(db)
    const write = losingAnUpdate(adapter)
    try {
      expect(
        await promotionStore(adapter).reassign('member-1', 'room-1', 'owner-1')
      ).toBe(true)
    } finally {
      write.mockRestore()
    }

    expect(onlyRow(db.roomMember).actorId).toBe('owner-1')
  })

  test('still reports a genuine collision on another actor row', async () => {
    const db = empty()
    seated(db, 1)
    db.roomMember.push(occupied())
    db.roomMember.push(
      occupied({ id: 'member-2', actorId: 'owner-1', roomId: 'room-1' })
    )
    const adapter = adapterFor(db)
    const write = spyOn(adapter, 'update').mockRejectedValue(
      new Error('constraint')
    )
    try {
      expect(
        await promotionStore(adapter).reassign('member-1', 'room-1', 'owner-1')
      ).toBe(false)
    } finally {
      write.mockRestore()
    }
  })
})
