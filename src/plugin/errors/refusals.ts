import { APIError } from 'better-auth/api'

import { ROOM_ERROR_CODES } from '@/plugin/errors/codes'

import type { AdditionRefusal } from '@/core/operations/admission/addition'
import type { JoinRefusal } from '@/core/operations/admission/join'
import type { LeaveRefusal } from '@/core/operations/capacity/leave'
import type { RevocationRefusal } from '@/core/operations/capacity/revocation'
import type { RotationRefusal } from '@/core/operations/codes/rotation'
import type { PromotionRefusal } from '@/core/operations/identity/promotion'
import type { OccupancyRefusal } from '@/core/operations/reads/occupancy'
import type { CreationRefusal } from '@/core/operations/rooms/creation'
import type { LifecycleRefusal } from '@/core/operations/rooms/lifecycle'

type RoomError = {
  readonly code: string
  readonly message: string
}

type Status = Parameters<typeof APIError.from>[0]

type Refusal = readonly [Status, RoomError]

const failing = (status: Status, error: RoomError) => () =>
  APIError.from(status, error)

const refusing =
  <Name extends string>(refusals: Record<Name, Refusal>) =>
  (refusal: Name) => {
    const [status, error] = refusals[refusal]

    return APIError.from(status, error)
  }

export const joinError = refusing<JoinRefusal>({
  unresolved: ['BAD_REQUEST', ROOM_ERROR_CODES.CODE_DID_NOT_RESOLVE],
  locked: ['FORBIDDEN', ROOM_ERROR_CODES.ROOM_LOCKED],
  closed: ['FORBIDDEN', ROOM_ERROR_CODES.ROOM_CLOSED],
  expired: ['FORBIDDEN', ROOM_ERROR_CODES.ROOM_EXPIRED],
  'at-capacity': ['CONFLICT', ROOM_ERROR_CODES.ROOM_AT_CAPACITY],
  contended: ['CONFLICT', ROOM_ERROR_CODES.ROOM_CONTENDED],
  'unknown-actor': ['NOT_FOUND', ROOM_ERROR_CODES.UNKNOWN_ACTOR],
  revoked: ['FORBIDDEN', ROOM_ERROR_CODES.MEMBERSHIP_REVOKED],
  'membership-expired': ['FORBIDDEN', ROOM_ERROR_CODES.MEMBERSHIP_EXPIRED]
})

export const creationError = refusing<CreationRefusal>({
  'expires-in-the-past': [
    'BAD_REQUEST',
    ROOM_ERROR_CODES.ROOM_EXPIRES_IN_THE_PAST
  ],
  exhausted: ['SERVICE_UNAVAILABLE', ROOM_ERROR_CODES.CODE_SPACE_EXHAUSTED]
})

export const rotationError = refusing<RotationRefusal>({
  'unknown-room': ['NOT_FOUND', ROOM_ERROR_CODES.UNKNOWN_ROOM],
  closed: ['FORBIDDEN', ROOM_ERROR_CODES.ROOM_CLOSED],
  expired: ['FORBIDDEN', ROOM_ERROR_CODES.ROOM_EXPIRED],
  exhausted: ['SERVICE_UNAVAILABLE', ROOM_ERROR_CODES.CODE_SPACE_EXHAUSTED]
})

export const additionError = refusing<AdditionRefusal>({
  'unknown-room': ['NOT_FOUND', ROOM_ERROR_CODES.UNKNOWN_ROOM],
  'expires-in-the-past': [
    'BAD_REQUEST',
    ROOM_ERROR_CODES.MEMBERSHIP_EXPIRES_IN_THE_PAST
  ],
  'already-a-member': ['CONFLICT', ROOM_ERROR_CODES.ALREADY_A_MEMBER],
  revoked: ['FORBIDDEN', ROOM_ERROR_CODES.MEMBERSHIP_REVOKED],
  'at-capacity': ['CONFLICT', ROOM_ERROR_CODES.ROOM_AT_CAPACITY],
  contended: ['CONFLICT', ROOM_ERROR_CODES.ROOM_CONTENDED],
  'unknown-actor': ['NOT_FOUND', ROOM_ERROR_CODES.UNKNOWN_ACTOR],
  closed: ['FORBIDDEN', ROOM_ERROR_CODES.ROOM_CLOSED],
  expired: ['FORBIDDEN', ROOM_ERROR_CODES.ROOM_EXPIRED]
})

export const occupancyError = refusing<OccupancyRefusal>({
  'unknown-room': ['NOT_FOUND', ROOM_ERROR_CODES.UNKNOWN_ROOM],
  'not-a-member': ['FORBIDDEN', ROOM_ERROR_CODES.NOT_A_MEMBER]
})

export const leaveError = refusing<LeaveRefusal>({
  'unknown-room': ['NOT_FOUND', ROOM_ERROR_CODES.UNKNOWN_ROOM],
  'not-a-member': ['FORBIDDEN', ROOM_ERROR_CODES.NOT_A_MEMBER],
  revoked: ['FORBIDDEN', ROOM_ERROR_CODES.MEMBERSHIP_REVOKED],
  'membership-expired': ['FORBIDDEN', ROOM_ERROR_CODES.MEMBERSHIP_EXPIRED]
})

export const revocationError = refusing<RevocationRefusal>({
  'unknown-room': ['NOT_FOUND', ROOM_ERROR_CODES.UNKNOWN_ROOM],
  'not-a-member': ['NOT_FOUND', ROOM_ERROR_CODES.NOT_A_MEMBER],
  'already-revoked': ['CONFLICT', ROOM_ERROR_CODES.ALREADY_REVOKED]
})

export const lifecycleError = refusing<LifecycleRefusal>({
  'unknown-room': ['NOT_FOUND', ROOM_ERROR_CODES.UNKNOWN_ROOM],
  closed: ['FORBIDDEN', ROOM_ERROR_CODES.ROOM_CLOSED],
  contended: ['CONFLICT', ROOM_ERROR_CODES.ROOM_CONTENDED]
})

export const promotionError = refusing<PromotionRefusal>({
  'unknown-actor': ['NOT_FOUND', ROOM_ERROR_CODES.UNKNOWN_ACTOR],
  'already-linked': ['CONFLICT', ROOM_ERROR_CODES.ALREADY_LINKED],
  'stale-grant': ['CONFLICT', ROOM_ERROR_CODES.GRANT_IS_STALE]
})

export const tooManyAttemptsError = failing(
  'TOO_MANY_REQUESTS',
  ROOM_ERROR_CODES.TOO_MANY_ATTEMPTS
)

export const creationIsServerOnlyError = failing(
  'FORBIDDEN',
  ROOM_ERROR_CODES.CREATION_IS_SERVER_ONLY
)

export const creationNeedsASessionError = failing(
  'UNAUTHORIZED',
  ROOM_ERROR_CODES.CREATION_NEEDS_A_SESSION
)

export const exactlyOneIdentityError = failing(
  'BAD_REQUEST',
  ROOM_ERROR_CODES.EXACTLY_ONE_IDENTITY
)

export const unknownActorError = failing(
  'NOT_FOUND',
  ROOM_ERROR_CODES.UNKNOWN_ACTOR
)

export const unknownRoomError = failing(
  'NOT_FOUND',
  ROOM_ERROR_CODES.UNKNOWN_ROOM
)

export const promotionNeedsASessionError = failing(
  'UNAUTHORIZED',
  ROOM_ERROR_CODES.PROMOTION_NEEDS_A_SESSION
)

export const resumeIsServerOnlyError = failing(
  'FORBIDDEN',
  ROOM_ERROR_CODES.RESUME_IS_SERVER_ONLY
)

export const resumeNeedsBothNamesError = failing(
  'BAD_REQUEST',
  ROOM_ERROR_CODES.RESUME_NEEDS_BOTH_NAMES
)

export const noGrantToPromoteError = failing(
  'BAD_REQUEST',
  ROOM_ERROR_CODES.NO_GRANT_TO_PROMOTE
)
