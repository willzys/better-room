import { describe, expect, test } from 'bun:test'

import { betterAuth } from 'better-auth'
import { memoryAdapter } from 'better-auth/adapters/memory'

import { betterRoom } from '@/plugin'
import { ROOM_ERROR_CODES } from '@/plugin/errors/codes'

describe('betterRoom options', () => {
  test.each([0, -1, 1.5, Number.NaN, 60 * 60 * 24 * 401])(
    'rejects the grant lifetime %p at construction',
    lifetime => {
      expect(() => betterRoom({ grant: { lifetime } })).toThrow(RangeError)
    }
  )

  test.each([0, -1, 1.5, Number.NaN])(
    'rejects the grace window %p at construction',
    grace => {
      expect(() => betterRoom({ code: { grace } })).toThrow(RangeError)
    }
  )

  test.each(['window', 'perIp', 'everyone'] as const)(
    'rejects invalid attempt %s at construction',
    field => {
      for (const value of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
        expect(() => betterRoom({ attempts: { [field]: value } })).toThrow(
          RangeError
        )
      }
    }
  )

  test.each(['true', 1, null])(
    'rejects the join session requirement %p at construction',
    requireSession => {
      expect(() => betterRoom({ join: { requireSession } as never })).toThrow(
        TypeError
      )
    }
  )
})

describe('betterRoom bounding its windows', () => {
  test.each([60 * 60 * 24 + 1, Number.MAX_SAFE_INTEGER])(
    'rejects the grace window %p for exceeding its ceiling',
    grace => {
      expect(() => betterRoom({ code: { grace } })).toThrow(RangeError)
    }
  )

  test.each([60 * 60 * 24 + 1, Number.MAX_SAFE_INTEGER])(
    'rejects the attempt window %p for exceeding its ceiling',
    window => {
      expect(() => betterRoom({ attempts: { window } })).toThrow(RangeError)
    }
  )

  test('accepts a grace window and an attempt window of a whole day', () => {
    expect(() =>
      betterRoom({
        code: { grace: 60 * 60 * 24 },
        attempts: { window: 60 * 60 * 24 }
      })
    ).not.toThrow()
  })
})

describe('betterRoom accepting a usable code', () => {
  test('rejects an unusable code length at construction', () => {
    expect(() => betterRoom({ code: { length: 0 } })).toThrow(RangeError)
  })

  test.each(['hex', 'toString', ''])(
    'rejects the unknown code format %p at construction',
    format => {
      expect(() =>
        Reflect.apply(betterRoom, undefined, [{ code: { format } }])
      ).toThrow(new TypeError('code format must be one of crockford, numeric'))
    }
  )

  test('accepts the numeric format with its own length', () => {
    expect(() =>
      betterRoom({ code: { format: 'numeric', length: 6 } })
    ).not.toThrow()
  })

  test('declares the room endpoint and every room table', () => {
    const plugin = betterRoom()

    expect(new Set(Object.keys(plugin.endpoints))).toEqual(
      new Set([
        'addRoomMember',
        'closeRoom',
        'createRoom',
        'lockRoom',
        'pruneRoomAttempts',
        'reconcileRoomCapacity',
        'revokeRoomMember',
        'unlockRoom',
        'getRoomAccess',
        'getRoomOccupancy',
        'joinRoom',
        'leaveRoom',
        'listRoomMemberships',
        'renameRoomMember',
        'promoteRoomActor',
        'rotateRoomCode'
      ])
    )
    expect(new Set(Object.keys(plugin.schema))).toEqual(
      new Set(['room', 'roomActor', 'roomAttempt', 'roomCode', 'roomMember'])
    )
  })
})

describe('betterRoom error codes', () => {
  test('reaches the application through the auth instance', () => {
    const auth = betterAuth({
      secret: 'options-secret',
      baseURL: 'http://localhost:3000',
      database: memoryAdapter({}),
      plugins: [betterRoom()]
    })

    expect(auth.$ERROR_CODES.CODE_DID_NOT_RESOLVE).toEqual(
      ROOM_ERROR_CODES.CODE_DID_NOT_RESOLVE
    )
  })

  test('keeps every code equal to its own key', () => {
    for (const [key, error] of Object.entries(ROOM_ERROR_CODES)) {
      expect(key).toBe(error.code)
    }
  })
})

describe('the hooks option', () => {
  test.each(['broadcast', 1, null])(
    'refuses %p at construction, since it is not an object',
    hooks => {
      expect(() => Reflect.apply(betterRoom, undefined, [{ hooks }])).toThrow(
        new TypeError('hooks must be an object')
      )
    }
  )

  test.each(['broadcast', 1, {}])(
    'refuses a hook of %p at construction, since it is not a function',
    onJoined => {
      expect(() =>
        Reflect.apply(betterRoom, undefined, [{ hooks: { onJoined } }])
      ).toThrow(new TypeError('hooks.onJoined must be a function'))
    }
  )

  test('refuses a name that is not a hook, listing the ones that are', () => {
    expect(() =>
      Reflect.apply(betterRoom, undefined, [
        { hooks: { onJoin: () => undefined } }
      ])
    ).toThrow(
      /hooks\.onJoin is not a hook; expected one of onJoined, .*onEvent/
    )
  })

  test('refuses the onChange it replaced, pointing at hooks.onEvent', () => {
    expect(() =>
      Reflect.apply(betterRoom, undefined, [{ onChange: () => undefined }])
    ).toThrow(new TypeError('onChange was replaced by hooks.onEvent'))
  })
})

describe('the option groups', () => {
  test.each(['code', 'grant', 'creation', 'join', 'attempts'])(
    'refuses a %s group that is not an object',
    group => {
      for (const value of [true, 'true', 1, null, []]) {
        expect(() =>
          Reflect.apply(betterRoom, undefined, [{ [group]: value }])
        ).toThrow(new TypeError(`${group} must be an object`))
      }
    }
  )

  test.each([null, 'true', 1])('refuses %p as the options', options => {
    expect(() => Reflect.apply(betterRoom, undefined, [options])).toThrow(
      new TypeError('better-room options must be an object')
    )
  })

  test('refuses a null value instead of falling back to its default', () => {
    const nulls = [
      [{ grant: { lifetime: null } }, RangeError],
      [{ code: { grace: null } }, RangeError],
      [{ attempts: { window: null } }, RangeError],
      [{ code: { format: null } }, TypeError],
      [{ code: { length: null } }, TypeError],
      [{ creation: { overHttp: null } }, TypeError]
    ] as const

    for (const [options, error] of nulls) {
      expect(() => Reflect.apply(betterRoom, undefined, [options])).toThrow(
        error
      )
    }
  })

  test('accepts empty groups and explicit undefined values', () => {
    expect(() =>
      Reflect.apply(betterRoom, undefined, [
        {
          code: {},
          grant: { lifetime: undefined },
          join: {},
          attempts: { window: undefined }
        }
      ])
    ).not.toThrow()
  })
})

describe('options a caller misspells or contradicts', () => {
  test.each([
    [
      { attempts: { perIP: 1 } },
      /attempts has no option perIP; expected one of window, perIp, everyone/
    ],
    [{ code: { lenght: 3 } }, /code has no option lenght/],
    [{ grants: { lifetime: 5 } }, /better-room options has no option grants/]
  ])(
    'refuses the misspelt option %p instead of ignoring it',
    (options, message) => {
      expect(() => Reflect.apply(betterRoom, undefined, [options])).toThrow(
        message
      )
    }
  )

  test('refuses a ceiling per address above the ceiling for everyone', () => {
    expect(() => betterRoom({ attempts: { perIp: 50, everyone: 5 } })).toThrow(
      new RangeError('attempts per ip must not exceed attempts for everyone')
    )
    expect(() =>
      betterRoom({ attempts: { perIp: 5, everyone: 5 } })
    ).not.toThrow()
    expect(() => betterRoom({ attempts: { everyone: 5 } })).not.toThrow()
  })
})
