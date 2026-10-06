import { createAuthEndpoint } from 'better-auth/api'
import * as z from 'zod'

import { settleRoom } from '@/core/operations/rooms/lifecycle'
import {
  lifecycleError,
  lifecycleIsServerOnlyError
} from '@/plugin/errors/refusals'
import { isServerCall } from '@/plugin/http/carrier'
import { roomReport } from '@/plugin/http/report'
import { lifecycleStore } from '@/plugin/stores/rooms/lifecycle'

import type { Transition } from '@/core/operations/rooms/lifecycle'
import type { RoomEvent, Signal } from '@/plugin/hooks/events'

const lifecycleBody = z.object({
  roomId: z.string().meta({ description: 'The room whose state changes' })
})

const CHANGES = {
  lock: 'locked',
  unlock: 'unlocked',
  close: 'closed'
} as const satisfies Record<Transition, RoomEvent['type']>

export const lifecycleEndpoint = (transition: Transition, signal: Signal) =>
  createAuthEndpoint(
    `/better-room/${transition}`,
    { method: 'POST', body: lifecycleBody },
    async ctx => {
      if (!isServerCall(ctx)) throw lifecycleIsServerOnlyError()

      const outcome = await settleRoom(
        { roomId: ctx.body.roomId, transition },
        lifecycleStore(ctx.context.adapter)
      )

      if (!outcome.settled) throw lifecycleError(outcome.refusal)

      const room = roomReport(outcome.room)

      if (outcome.changed) {
        await signal(
          { type: CHANGES[transition], roomId: room.id, room },
          ctx.context.logger
        )
      }

      return ctx.json({ room })
    }
  )
