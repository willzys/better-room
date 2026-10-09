import { describe, expect, test } from 'bun:test'

import { joinStore } from '@/plugin/stores/admission/join'

import { EARLIER, room } from '../../../helpers/fixtures'
import { empty } from '../../../helpers/memory'
import { adapterFor, codeRow } from '../../../helpers/stores'

describe('a row edited outside the plugin', () => {
  test('refuses a room holding a status the domain does not know', async () => {
    const db = empty()
    db.room.push({ ...room(), status: 'archived' })

    await expect(joinStore(adapterFor(db)).room('room-1')).rejects.toThrow(
      new TypeError("room room-1 holds an unknown status 'archived'")
    )
  })

  test('refuses a code holding a status the domain does not know', async () => {
    const db = empty()
    db.roomCode.push({ ...codeRow('paused', EARLIER), status: 'paused' })

    await expect(joinStore(adapterFor(db)).code('paused')).rejects.toThrow(
      new TypeError("roomCode row-paused holds an unknown status 'paused'")
    )
  })
})
