import { describe, expect, test } from 'bun:test'

import { rotateCode } from '@/core/operations/codes/rotation'

import { room } from '../../../../helpers/fixtures'

import type { RotationStore } from '@/core/operations/codes/rotation'

const GRACE = 120
const ORIGIN = new Date('2026-10-02T11:59:00.000Z')
const FIRST = new Date('2026-10-02T12:00:00.000Z')
const SECOND = new Date(FIRST.getTime() + 1000)
const LATEST = new Date(FIRST.getTime() + 2000)

type Code = {
  id: string
  status: 'active' | 'grace' | 'revoked'
  createdAt: Date
}

const deferred = () => {
  let release: (() => void) | undefined
  const reached = new Promise<void>(resolve => {
    release = resolve
  })

  return {
    reached,
    release: () => {
      if (release === undefined) throw new Error('Nothing is waiting yet')

      release()
    }
  }
}

const shared = () => {
  const codes: Code[] = [
    { id: 'original', status: 'active', createdAt: ORIGIN }
  ]
  let minted = 0

  const storeFor = (gate?: Promise<void>): RotationStore => ({
    room: () => Promise.resolve(room()),
    retireGrace: () => {
      for (const code of codes) {
        if (code.status === 'grace') code.status = 'revoked'
      }

      return Promise.resolve()
    },
    activeCodes: () =>
      Promise.resolve(
        codes.filter(code => code.status === 'active').map(code => code.id)
      ),
    issueCode: (identifier, _roomId, at) => {
      codes.push({ id: identifier, status: 'active', createdAt: at })

      return Promise.resolve(true)
    },
    demoteOthers: async (_roomId, codeIds) => {
      if (gate !== undefined) await gate

      for (const code of codes) {
        if (code.status === 'active' && codeIds.includes(code.id)) {
          code.status = 'grace'
        }
      }
    }
  })

  const mint = () => {
    minted++

    return Promise.resolve({
      code: `CODE${minted}`,
      identifier: `identifier-${minted}`
    })
  }

  return { codes, storeFor, mint }
}

const active = (codes: Code[]) => codes.filter(code => code.status === 'active')

describe('two rotations racing on one room', () => {
  test('leaves exactly one active code when they do not overlap', async () => {
    const { codes, storeFor, mint } = shared()

    await rotateCode(
      { roomId: 'room-1', mint, grace: GRACE, now: FIRST },
      storeFor()
    )
    await rotateCode(
      { roomId: 'room-1', mint, grace: GRACE, now: SECOND },
      storeFor()
    )

    expect(active(codes)).toHaveLength(1)
    expect(active(codes)[0]?.createdAt).toEqual(SECOND)
  })

  test('leaves exactly one active code when the clock does not advance', async () => {
    const { codes, storeFor, mint } = shared()

    await rotateCode(
      { roomId: 'room-1', mint, grace: GRACE, now: FIRST },
      storeFor()
    )
    await rotateCode(
      { roomId: 'room-1', mint, grace: GRACE, now: FIRST },
      storeFor()
    )

    expect(active(codes)).toHaveLength(1)
  })
})

describe('two rotations overlapping on one room', () => {
  test('never leaves a room without an active code', async () => {
    const { codes, storeFor, mint } = shared()
    const gate = deferred()

    const first = rotateCode(
      { roomId: 'room-1', mint, grace: GRACE, now: FIRST },
      storeFor(gate.reached)
    )
    const second = rotateCode(
      { roomId: 'room-1', mint, grace: GRACE, now: SECOND },
      storeFor()
    )

    await second
    gate.release()
    await first

    expect(active(codes).length).toBeGreaterThan(0)
  })

  test('collapses back to one active code on the next rotation', async () => {
    const { codes, storeFor, mint } = shared()
    const gate = deferred()

    const first = rotateCode(
      { roomId: 'room-1', mint, grace: GRACE, now: FIRST },
      storeFor(gate.reached)
    )
    const second = rotateCode(
      { roomId: 'room-1', mint, grace: GRACE, now: SECOND },
      storeFor()
    )

    await second
    gate.release()
    await first

    await rotateCode(
      { roomId: 'room-1', mint, grace: GRACE, now: LATEST },
      storeFor()
    )

    expect(active(codes)).toHaveLength(1)
    expect(active(codes)[0]?.createdAt).toEqual(LATEST)
  })
})
