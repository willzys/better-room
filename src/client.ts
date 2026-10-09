import type { BetterAuthClientPlugin } from 'better-auth/client'

import type { betterRoom } from '@/plugin'

export const betterRoomClient = () =>
  ({
    id: 'better-room',
    $InferServerPlugin: {} as ReturnType<typeof betterRoom>,
    pathMethods: {
      '/better-room/create': 'POST',
      '/better-room/join': 'POST',
      '/better-room/leave': 'POST',
      '/better-room/promote': 'POST'
    }
  }) satisfies BetterAuthClientPlugin

export { ROOM_ERROR_CODES } from '@/plugin/errors/codes'
