import type { BetterAuthClientPlugin } from 'better-auth/types'

import type { betterRoom } from '@/plugin'

export const betterRoomClient = () =>
  ({
    id: 'better-room',
    $InferServerPlugin: {} as ReturnType<typeof betterRoom>
  }) satisfies BetterAuthClientPlugin

export { ROOM_ERROR_CODES } from '@/plugin/error-codes'
