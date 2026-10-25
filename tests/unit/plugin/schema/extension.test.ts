import { describe, expect, test } from 'bun:test'

import { betterRoom } from '@/plugin'

describe('naming the columns of a table', () => {
  test('refuses a field renamed onto a column the plugin uses', () => {
    expect(() =>
      betterRoom({
        schema: { room: { fields: { maxMembers: 'memberCount' } } }
      })
    ).toThrow(
      new TypeError(
        'room.maxMembers is stored as memberCount, which room.memberCount already uses'
      )
    )
  })

  test('refuses a field renamed onto the id', () => {
    expect(() =>
      betterRoom({ schema: { roomCode: { fields: { identifier: 'id' } } } })
    ).toThrow(
      new TypeError(
        'roomCode.identifier is stored as id, which roomCode.id already uses'
      )
    )
  })

  test('refuses an additional field stored in a column the plugin uses', () => {
    expect(() =>
      betterRoom({
        schema: {
          roomMember: {
            additionalFields: {
              nickname: { type: 'string', required: false, fieldName: 'role' }
            }
          }
        }
      })
    ).toThrow(TypeError)
  })

  test('accepts two fields that trade their columns', () => {
    expect(() =>
      betterRoom({
        schema: {
          room: {
            fields: { maxMembers: 'memberCount', memberCount: 'maxMembers' }
          }
        }
      })
    ).not.toThrow()
  })
})
