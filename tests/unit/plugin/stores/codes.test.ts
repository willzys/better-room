import { describe, expect, spyOn, test } from 'bun:test'

import { rotationStore } from '@/plugin/stores/codes/rotation'
import { creationStore } from '@/plugin/stores/rooms/creation'

import { EARLIER, NOW } from '../../../helpers/fixtures'
import { onlyRow } from '../../../helpers/http'
import { empty, seedRoom } from '../../../helpers/memory'
import { adapterFor, codeRow } from '../../../helpers/stores'

describe('adapter errors at the store boundary', () => {
  test('propagates an insertion failure when no code collision can be confirmed', async () => {
    const adapter = adapterFor()
    const failure = new Error('database unavailable')
    const insert = spyOn(adapter, 'create').mockRejectedValue(failure)
    try {
      await expect(
        creationStore(adapter).issueCode('unused', 'room-1', NOW, [])
      ).rejects.toBe(failure)
    } finally {
      insert.mockRestore()
    }
  })
})

describe('a code issued for the room that already carries it', () => {
  test('treats it as its own write rather than a collision', async () => {
    const db = empty()
    await seedRoom(db)
    const adapter = adapterFor(db)
    const existing = await adapter.findMany<{ identifier: string }>({
      model: 'roomCode'
    })
    const code = onlyRow(existing)
    const insert = spyOn(adapter, 'create').mockRejectedValue(
      new Error('connection lost')
    )
    try {
      expect(
        await creationStore(adapter).issueCode(
          code.identifier,
          'room-1',
          NOW,
          []
        )
      ).toBe(true)
    } finally {
      insert.mockRestore()
    }
  })
})

describe('a code drawn again from the space', () => {
  test('refuses one of this room that is no longer active', async () => {
    const db = empty()
    await seedRoom(db, { code: { status: 'revoked', revokedAt: EARLIER } })
    const adapter = adapterFor(db)
    const code = onlyRow(
      await adapter.findMany<{ identifier: string }>({
        model: 'roomCode'
      })
    )
    const insert = spyOn(adapter, 'create').mockRejectedValue(
      new Error('connection lost')
    )
    try {
      expect(
        await creationStore(adapter).issueCode(
          code.identifier,
          'room-1',
          NOW,
          []
        )
      ).toBe(false)
    } finally {
      insert.mockRestore()
    }
  })

  test('refuses a code the rotation is about to replace', async () => {
    const db = empty()
    await seedRoom(db)
    const adapter = adapterFor(db)
    const code = onlyRow(
      await adapter.findMany<{ identifier: string }>({
        model: 'roomCode'
      })
    )
    const insert = spyOn(adapter, 'create').mockRejectedValue(
      new Error('connection lost')
    )
    try {
      expect(
        await creationStore(adapter).issueCode(code.identifier, 'room-1', NOW, [
          code.identifier
        ])
      ).toBe(false)
    } finally {
      insert.mockRestore()
    }
  })
})

describe('a code that belongs to another room', () => {
  test('is the collision the retry exists for', async () => {
    const db = empty()
    await seedRoom(db)
    const adapter = adapterFor(db)
    const existing = await adapter.findMany<{ identifier: string }>({
      model: 'roomCode'
    })
    const code = onlyRow(existing)
    const insert = spyOn(adapter, 'create').mockRejectedValue(
      new Error('duplicate')
    )
    try {
      expect(
        await creationStore(adapter).issueCode(
          code.identifier,
          'room-elsewhere',
          NOW,
          []
        )
      ).toBe(false)
    } finally {
      insert.mockRestore()
    }
  })
})

describe('demoting the codes a rotation replaced', () => {
  test('demotes only the codes it was handed', async () => {
    const db = empty()
    const later = new Date(NOW.getTime() + 1000)
    db.roomCode.push(
      codeRow('older', EARLIER),
      codeRow('mine', NOW),
      codeRow('newer', later)
    )

    await rotationStore(adapterFor(db)).demoteOthers(
      'room-1',
      ['older'],
      new Date(NOW.getTime() + 120_000)
    )

    const status = new Map(
      db.roomCode.map(row => [row.identifier, row.status] as const)
    )
    expect(status.get('older')).toBe('grace')
    expect(status.get('mine')).toBe('active')
    expect(status.get('newer')).toBe('active')
  })

  test('reads and demotes every active code, however many there are', async () => {
    const db = empty()
    const identifiers = Array.from(
      { length: 1050 },
      (_, index) => `code-${String(index).padStart(4, '0')}`
    )
    db.roomCode.push(
      ...identifiers.map(identifier => codeRow(identifier, EARLIER))
    )
    const store = rotationStore(adapterFor(db))

    const active = await store.activeCodes('room-1')
    await store.demoteOthers(
      'room-1',
      active,
      new Date(NOW.getTime() + 120_000)
    )

    expect(active).toEqual(identifiers)
    expect(db.roomCode.every(row => row.status === 'grace')).toBe(true)
  })

  test('never demotes a code belonging to another room', async () => {
    const db = empty()
    db.roomCode.push(codeRow('mine', EARLIER), {
      ...codeRow('elsewhere', EARLIER),
      roomId: 'room-2'
    })

    await rotationStore(adapterFor(db)).demoteOthers(
      'room-1',
      ['mine', 'elsewhere'],
      new Date(NOW.getTime() + 120_000)
    )

    const status = new Map(
      db.roomCode.map(row => [row.identifier, row.status] as const)
    )
    expect(status.get('mine')).toBe('grace')
    expect(status.get('elsewhere')).toBe('active')
  })
})
