import { accessEndpoint } from '@/plugin/endpoints/get/access'
import { membershipsEndpoint } from '@/plugin/endpoints/get/memberships'
import { addEndpoint } from '@/plugin/endpoints/post/add'
import { createEndpoint } from '@/plugin/endpoints/post/create'
import { joinEndpoint } from '@/plugin/endpoints/post/join'
import { leaveEndpoint } from '@/plugin/endpoints/post/leave'
import { lifecycleEndpoint } from '@/plugin/endpoints/post/lifecycle'
import { promoteEndpoint } from '@/plugin/endpoints/post/promote'
import { reconcileEndpoint } from '@/plugin/endpoints/post/reconcile'
import { revokeEndpoint } from '@/plugin/endpoints/post/revoke'
import { rotateEndpoint } from '@/plugin/endpoints/post/rotate'
import { ROOM_ERROR_CODES } from '@/plugin/error-codes'
import { settingsOf } from '@/plugin/options'
import { createRoomSchema } from '@/plugin/schema'
import { generate } from '@/security/code-format'
import { codeIdentifier } from '@/security/code-identifier'

import type { BetterAuthPlugin } from 'better-auth/types'

import type { RoomOptions } from '@/plugin/options'
import type { CodeIdentifier } from '@/security/code-identifier'

export const betterRoom = (options?: RoomOptions) => {
  const { format, grace, grantLifetime, overHttp, perIp, everyone } =
    settingsOf(options)

  let identifier: CodeIdentifier | undefined

  const identify = (secret: string) =>
    (identifier ??= codeIdentifier({ format, secret }))

  return {
    id: 'better-room',
    init: async context => {
      await identify(context.secret)(generate(format))
    },
    endpoints: {
      addRoomMember: addEndpoint(),
      getRoomAccess: accessEndpoint(),
      createRoom: createEndpoint({ format, identify, overHttp }),
      joinRoom: joinEndpoint({ identify, grantLifetime, perIp, everyone }),
      leaveRoom: leaveEndpoint(),
      listRoomMemberships: membershipsEndpoint(),
      promoteRoomActor: promoteEndpoint(),
      rotateRoomCode: rotateEndpoint({ format, identify, grace }),
      revokeRoomMember: revokeEndpoint(),
      lockRoom: lifecycleEndpoint('lock'),
      unlockRoom: lifecycleEndpoint('unlock'),
      closeRoom: lifecycleEndpoint('close'),
      reconcileRoomCapacity: reconcileEndpoint()
    },
    schema: createRoomSchema(options?.schema),
    $ERROR_CODES: ROOM_ERROR_CODES
  } satisfies BetterAuthPlugin
}
