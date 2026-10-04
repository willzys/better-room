import type { BetterAuthClientPlugin } from 'better-auth/types'

import type { betterRoom } from '@/plugin'

export const betterRoomClient = () =>
  ({
    id: 'better-room',
    $InferServerPlugin: {} as ReturnType<typeof betterRoom>,
    pathMethods: {
      '/better-room/add-member': 'POST',
      '/better-room/create': 'POST',
      '/better-room/join': 'POST',
      '/better-room/leave': 'POST',
      '/better-room/lock': 'POST',
      '/better-room/unlock': 'POST',
      '/better-room/close': 'POST',
      '/better-room/promote': 'POST',
      '/better-room/reconcile': 'POST',
      '/better-room/revoke-member': 'POST',
      '/better-room/rotate-code': 'POST'
    }
  }) satisfies BetterAuthClientPlugin

export { ROOM_ERROR_CODES } from '@/plugin/error-codes'
