import { APIError } from 'better-auth/api'

import { ROOM_ERROR_CODES } from '@/plugin/error-codes'

import type { AdditionRefusal } from '@/core/operations/admission/addition'
import type { JoinRefusal } from '@/core/operations/admission/join'
import type { LeaveRefusal } from '@/core/operations/capacity/leave'
import type { RevocationRefusal } from '@/core/operations/capacity/revocation'
import type { RotationRefusal } from '@/core/operations/codes/rotation'
import type { PromotionRefusal } from '@/core/operations/identity/promotion'
import type { LifecycleRefusal } from '@/core/operations/rooms/lifecycle'

type RoomError = {
  readonly code: string
  readonly message: string
}

type Refusal = readonly [Parameters<typeof APIError.from>[0], RoomError]

const REFUSALS = {
  unresolved: ['BAD_REQUEST', ROOM_ERROR_CODES.CODE_DID_NOT_RESOLVE],
  locked: ['FORBIDDEN', ROOM_ERROR_CODES.ROOM_LOCKED],
  closed: ['FORBIDDEN', ROOM_ERROR_CODES.ROOM_CLOSED],
  expired: ['FORBIDDEN', ROOM_ERROR_CODES.ROOM_EXPIRED],
  'at-capacity': ['CONFLICT', ROOM_ERROR_CODES.ROOM_AT_CAPACITY],
  revoked: ['FORBIDDEN', ROOM_ERROR_CODES.MEMBERSHIP_REVOKED],
  'membership-expired': ['FORBIDDEN', ROOM_ERROR_CODES.MEMBERSHIP_EXPIRED]
} as const satisfies Record<JoinRefusal, Refusal>

export const refusalError = (refusal: JoinRefusal) => {
  const [status, error] = REFUSALS[refusal]

  return APIError.from(status, error)
}

export const attemptError = () =>
  APIError.from('TOO_MANY_REQUESTS', ROOM_ERROR_CODES.TOO_MANY_ATTEMPTS)

export const serverOnlyError = () =>
  APIError.from('FORBIDDEN', ROOM_ERROR_CODES.CREATION_IS_SERVER_ONLY)

export const unauthenticatedError = () =>
  APIError.from('UNAUTHORIZED', ROOM_ERROR_CODES.CREATION_NEEDS_A_SESSION)

export const exhaustedError = () =>
  APIError.from('SERVICE_UNAVAILABLE', ROOM_ERROR_CODES.CODE_SPACE_EXHAUSTED)

export const rotationServerOnlyError = () =>
  APIError.from('FORBIDDEN', ROOM_ERROR_CODES.ROTATION_IS_SERVER_ONLY)

const ROTATION_REFUSALS = {
  'unknown-room': ['NOT_FOUND', ROOM_ERROR_CODES.UNKNOWN_ROOM],
  closed: ['FORBIDDEN', ROOM_ERROR_CODES.ROOM_CLOSED],
  exhausted: ['SERVICE_UNAVAILABLE', ROOM_ERROR_CODES.CODE_SPACE_EXHAUSTED]
} as const satisfies Record<RotationRefusal, Refusal>

export const rotationError = (refusal: RotationRefusal) => {
  const [status, error] = ROTATION_REFUSALS[refusal]

  return APIError.from(status, error)
}

export const additionServerOnlyError = () =>
  APIError.from('FORBIDDEN', ROOM_ERROR_CODES.ADDITION_IS_SERVER_ONLY)

const ADDITION_REFUSALS = {
  'unknown-room': ['NOT_FOUND', ROOM_ERROR_CODES.UNKNOWN_ROOM],
  'expires-in-the-past': [
    'BAD_REQUEST',
    ROOM_ERROR_CODES.MEMBERSHIP_EXPIRES_IN_THE_PAST
  ],
  'already-a-member': ['CONFLICT', ROOM_ERROR_CODES.ALREADY_A_MEMBER],
  'at-capacity': ['CONFLICT', ROOM_ERROR_CODES.ROOM_AT_CAPACITY],
  closed: ['FORBIDDEN', ROOM_ERROR_CODES.ROOM_CLOSED],
  expired: ['FORBIDDEN', ROOM_ERROR_CODES.ROOM_EXPIRED]
} as const satisfies Record<AdditionRefusal, Refusal>

export const additionError = (refusal: AdditionRefusal) => {
  const [status, error] = ADDITION_REFUSALS[refusal]

  return APIError.from(status, error)
}

export const oneIdentityError = () =>
  APIError.from('BAD_REQUEST', ROOM_ERROR_CODES.EXACTLY_ONE_IDENTITY)

export const unknownActorError = () =>
  APIError.from('NOT_FOUND', ROOM_ERROR_CODES.UNKNOWN_ACTOR)

const LEAVE_REFUSALS = {
  'unknown-room': ['NOT_FOUND', ROOM_ERROR_CODES.UNKNOWN_ROOM],
  'not-a-member': ['FORBIDDEN', ROOM_ERROR_CODES.NOT_A_MEMBER],
  revoked: ['FORBIDDEN', ROOM_ERROR_CODES.MEMBERSHIP_REVOKED],
  'membership-expired': ['FORBIDDEN', ROOM_ERROR_CODES.MEMBERSHIP_EXPIRED]
} as const satisfies Record<LeaveRefusal, Refusal>

export const leaveError = (refusal: LeaveRefusal) => {
  const [status, error] = LEAVE_REFUSALS[refusal]

  return APIError.from(status, error)
}

const REVOCATION_REFUSALS = {
  'unknown-room': ['NOT_FOUND', ROOM_ERROR_CODES.UNKNOWN_ROOM],
  'not-a-member': ['NOT_FOUND', ROOM_ERROR_CODES.NOT_A_MEMBER],
  'already-revoked': ['CONFLICT', ROOM_ERROR_CODES.ALREADY_REVOKED]
} as const satisfies Record<RevocationRefusal, Refusal>

export const revocationError = (refusal: RevocationRefusal) => {
  const [status, error] = REVOCATION_REFUSALS[refusal]

  return APIError.from(status, error)
}

export const revocationServerOnlyError = () =>
  APIError.from('FORBIDDEN', ROOM_ERROR_CODES.REVOCATION_IS_SERVER_ONLY)

const LIFECYCLE_REFUSALS = {
  'unknown-room': ['NOT_FOUND', ROOM_ERROR_CODES.UNKNOWN_ROOM],
  closed: ['FORBIDDEN', ROOM_ERROR_CODES.ROOM_CLOSED]
} as const satisfies Record<LifecycleRefusal, Refusal>

export const lifecycleError = (refusal: LifecycleRefusal) => {
  const [status, error] = LIFECYCLE_REFUSALS[refusal]

  return APIError.from(status, error)
}

export const lifecycleServerOnlyError = () =>
  APIError.from('FORBIDDEN', ROOM_ERROR_CODES.LIFECYCLE_IS_SERVER_ONLY)

export const reconciliationServerOnlyError = () =>
  APIError.from('FORBIDDEN', ROOM_ERROR_CODES.RECONCILIATION_IS_SERVER_ONLY)

const PROMOTION_REFUSALS = {
  'unknown-actor': ['NOT_FOUND', ROOM_ERROR_CODES.UNKNOWN_ACTOR],
  'already-linked': ['CONFLICT', ROOM_ERROR_CODES.ALREADY_LINKED],
  'stale-grant': ['CONFLICT', ROOM_ERROR_CODES.GRANT_IS_STALE]
} as const satisfies Record<PromotionRefusal, Refusal>

export const promotionError = (refusal: PromotionRefusal) => {
  const [status, error] = PROMOTION_REFUSALS[refusal]

  return APIError.from(status, error)
}

export const promotionNeedsASessionError = () =>
  APIError.from('UNAUTHORIZED', ROOM_ERROR_CODES.PROMOTION_NEEDS_A_SESSION)

export const resumeIsServerOnlyError = () =>
  APIError.from('FORBIDDEN', ROOM_ERROR_CODES.RESUME_IS_SERVER_ONLY)

export const resumeNeedsBothNamesError = () =>
  APIError.from('BAD_REQUEST', ROOM_ERROR_CODES.RESUME_NEEDS_BOTH_NAMES)

export const noGrantToPromoteError = () =>
  APIError.from('BAD_REQUEST', ROOM_ERROR_CODES.NO_GRANT_TO_PROMOTE)

export const unknownRoomError = () =>
  APIError.from('NOT_FOUND', ROOM_ERROR_CODES.UNKNOWN_ROOM)
