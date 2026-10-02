import { APIError } from 'better-auth/api'

import type { JoinRefusal } from '@/core/join'

type RoomError = {
  readonly code: string
  readonly message: string
}

type Refusal = readonly [Parameters<typeof APIError.from>[0], RoomError]

export const ROOM_ERROR_CODES = {
  CODE_DID_NOT_RESOLVE: {
    code: 'CODE_DID_NOT_RESOLVE',
    message: 'The room code did not resolve'
  },
  ROOM_LOCKED: {
    code: 'ROOM_LOCKED',
    message: 'The room is locked and refuses new memberships'
  },
  ROOM_CLOSED: {
    code: 'ROOM_CLOSED',
    message: 'The room is closed'
  },
  ROOM_EXPIRED: {
    code: 'ROOM_EXPIRED',
    message: 'The room has expired'
  },
  ROOM_AT_CAPACITY: {
    code: 'ROOM_AT_CAPACITY',
    message: 'The room is at capacity'
  },
  MEMBERSHIP_REVOKED: {
    code: 'MEMBERSHIP_REVOKED',
    message: 'The membership was revoked'
  },
  MEMBERSHIP_EXPIRED: {
    code: 'MEMBERSHIP_EXPIRED',
    message: 'The membership has expired'
  },
  TOO_MANY_ATTEMPTS: {
    code: 'TOO_MANY_ATTEMPTS',
    message: 'Too many room codes have been tried'
  },
  CREATION_IS_SERVER_ONLY: {
    code: 'CREATION_IS_SERVER_ONLY',
    message: 'Room creation is not exposed over http'
  },
  CREATION_NEEDS_A_SESSION: {
    code: 'CREATION_NEEDS_A_SESSION',
    message: 'Room creation over http requires an authenticated caller'
  },
  CODE_SPACE_EXHAUSTED: {
    code: 'CODE_SPACE_EXHAUSTED',
    message: 'No free room code was found'
  }
} as const

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
