import { accessEndpoint } from '@/plugin/endpoints/get/access'
import { membershipsEndpoint } from '@/plugin/endpoints/get/memberships'
import { occupancyEndpoint } from '@/plugin/endpoints/get/occupancy'
import { addEndpoint } from '@/plugin/endpoints/post/add'
import { createEndpoint } from '@/plugin/endpoints/post/create'
import { joinEndpoint } from '@/plugin/endpoints/post/join'
import { leaveEndpoint } from '@/plugin/endpoints/post/leave'
import { lifecycleEndpoint } from '@/plugin/endpoints/post/lifecycle'
import { promoteEndpoint } from '@/plugin/endpoints/post/promote'
import { reconcileEndpoint } from '@/plugin/endpoints/post/reconcile'
import { revokeEndpoint } from '@/plugin/endpoints/post/revoke'
import { rotateEndpoint } from '@/plugin/endpoints/post/rotate'
import { ROOM_ERROR_CODES } from '@/plugin/errors/codes'
import { erasureHooks } from '@/plugin/hooks/erasure'
import { settingsOf } from '@/plugin/options'
import { createRoomSchema } from '@/plugin/schema/tables'
import { generate } from '@/security/code-format'
import { codeIdentifier } from '@/security/code-identifier'

import type { BetterAuthPlugin } from 'better-auth'

import type { RoomOptions } from '@/plugin/options'
import type { CodeIdentifier } from '@/security/code-identifier'

export const betterRoom = (options?: RoomOptions) => {
  const {
    format,
    grace,
    grantLifetime,
    overHttp,
    requireSession,
    perIp,
    everyone,
    signal
  } = settingsOf(options)

  let identifier: CodeIdentifier | undefined
  let boundSecret: string | undefined

  const identify = (secret: string) =>
    (identifier ??= codeIdentifier({ format, secret }))

  return {
    id: 'better-room',
    init: async context => {
      if (boundSecret !== undefined && boundSecret !== context.secret) {
        throw new Error(
          'better-room is already bound to an auth instance with another secret; call betterRoom() once per instance'
        )
      }

      boundSecret = context.secret
      await identify(context.secret)(generate(format))

      return {
        options: {
          databaseHooks: erasureHooks(context.adapter, signal, context.logger)
        }
      }
    },
    endpoints: {
      addRoomMember: addEndpoint(signal),
      getRoomAccess: accessEndpoint(),
      getRoomOccupancy: occupancyEndpoint(),
      createRoom: createEndpoint({ format, identify, overHttp, signal }),
      joinRoom: joinEndpoint({
        identify,
        grantLifetime,
        requireSession,
        perIp,
        everyone,
        signal
      }),
      leaveRoom: leaveEndpoint(signal),
      listRoomMemberships: membershipsEndpoint(),
      promoteRoomActor: promoteEndpoint(signal),
      rotateRoomCode: rotateEndpoint({ format, identify, grace, signal }),
      revokeRoomMember: revokeEndpoint(signal),
      lockRoom: lifecycleEndpoint('lock', signal),
      unlockRoom: lifecycleEndpoint('unlock', signal),
      closeRoom: lifecycleEndpoint('close', signal),
      reconcileRoomCapacity: reconcileEndpoint(signal)
    },
    schema: createRoomSchema(options?.schema),
    $ERROR_CODES: ROOM_ERROR_CODES
  } satisfies BetterAuthPlugin
}
