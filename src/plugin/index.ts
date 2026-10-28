import { accessEndpoint } from '@/plugin/endpoints/get/access'
import { membersEndpoint } from '@/plugin/endpoints/get/members'
import { membershipsEndpoint } from '@/plugin/endpoints/get/memberships'
import { occupancyEndpoint } from '@/plugin/endpoints/get/occupancy'
import { addEndpoint } from '@/plugin/endpoints/post/add'
import { createEndpoint } from '@/plugin/endpoints/post/create'
import { joinEndpoint } from '@/plugin/endpoints/post/join'
import { leaveEndpoint } from '@/plugin/endpoints/post/leave'
import { lifecycleEndpoint } from '@/plugin/endpoints/post/lifecycle'
import { promoteEndpoint } from '@/plugin/endpoints/post/promote'
import { pruneEndpoint } from '@/plugin/endpoints/post/prune'
import { reconcileEndpoint } from '@/plugin/endpoints/post/reconcile'
import { recountEndpoint } from '@/plugin/endpoints/post/recount'
import { renameEndpoint } from '@/plugin/endpoints/post/rename'
import { retireEndpoint } from '@/plugin/endpoints/post/retire'
import { revokeEndpoint } from '@/plugin/endpoints/post/revoke'
import { rotateEndpoint } from '@/plugin/endpoints/post/rotate'
import { ROOM_ERROR_CODES } from '@/plugin/errors/codes'
import { erasureHooks } from '@/plugin/hooks/erasure'
import { signOutHooks } from '@/plugin/hooks/sign-out'
import { settingsOf } from '@/plugin/options'
import { createRoomSchema } from '@/plugin/schema/tables'
import { addressIdentifier } from '@/security/address-identifier'
import { generate } from '@/security/code-format'
import { codeIdentifier } from '@/security/code-identifier'

import type { BetterAuthPlugin } from 'better-auth'

import type { RoomOptions } from '@/plugin/options'
import type { CodeFormat } from '@/security/code-format'
import type { CodeIdentifier } from '@/security/code-identifier'
import type { KeyedDigest } from '@/security/keyed-digest'

const SWEEPABLE_WARNING =
  'better-room room codes span fewer than a billion values, so a distributed sweep can find live rooms; turn on join.requireSession or lengthen code.length'

const derivations = (format: CodeFormat) => {
  let identifier: CodeIdentifier | undefined
  let addresses: KeyedDigest | undefined

  return {
    identify: (secret: string) =>
      (identifier ??= codeIdentifier({ format, secret })),
    locate: (secret: string) => (addresses ??= addressIdentifier(secret))
  }
}

export const betterRoom = (options?: RoomOptions) => {
  const settings = settingsOf(options)
  const { format, grace, overHttp, perIp, sweepable, signal } = settings

  const { identify, locate } = derivations(format)
  let boundSecret: string | undefined

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

      if (sweepable) context.logger.warn(SWEEPABLE_WARNING)

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
      joinRoom: joinEndpoint({ ...settings, identify, locate }),
      leaveRoom: leaveEndpoint(signal),
      renameRoomMember: renameEndpoint(signal),
      listRoomMemberships: membershipsEndpoint(),
      listRoomMembers: membersEndpoint(),
      promoteRoomActor: promoteEndpoint(signal),
      rotateRoomCode: rotateEndpoint({ format, identify, grace, signal }),
      revokeRoomMember: revokeEndpoint(signal),
      lockRoom: lifecycleEndpoint('lock', signal),
      unlockRoom: lifecycleEndpoint('unlock', signal),
      closeRoom: lifecycleEndpoint('close', signal),
      reconcileRoomCapacity: reconcileEndpoint(signal),
      recountRoomCapacity: recountEndpoint(),
      pruneRoomAttempts: pruneEndpoint(perIp.window),
      retireRoomCodes: retireEndpoint()
    },
    hooks: signOutHooks(),
    schema: createRoomSchema(options?.schema),
    $ERROR_CODES: ROOM_ERROR_CODES
  } satisfies BetterAuthPlugin
}
