import { defineErrorCodes } from '@better-auth/core/utils/error-codes'

export const ROOM_ERROR_CODES = defineErrorCodes({
  CODE_DID_NOT_RESOLVE: 'The room code did not resolve',
  ROOM_LOCKED: 'The room is locked and refuses new memberships',
  ROOM_CLOSED: 'The room is closed',
  ROOM_CONTENDED: 'The room changed state while this request settled it',
  ROOM_EXPIRED: 'The room has expired',
  ROOM_AT_CAPACITY: 'The room is at capacity',
  MEMBERSHIP_REVOKED: 'The membership was revoked',
  MEMBERSHIP_EXPIRED: 'The membership has expired',
  TOO_MANY_ATTEMPTS: 'Too many room codes have been tried',
  CREATION_IS_SERVER_ONLY: 'Room creation is not exposed over http',
  CREATION_NEEDS_A_SESSION:
    'Room creation over http requires an authenticated caller',
  CODE_SPACE_EXHAUSTED: 'No free room code was found',
  ROTATION_IS_SERVER_ONLY: 'Rotating a room code is not exposed over http',
  UNKNOWN_ROOM: 'No such room',
  ADDITION_IS_SERVER_ONLY: 'Adding a member is not exposed over http',
  ALREADY_A_MEMBER: 'The actor already holds a membership in this room',
  EXACTLY_ONE_IDENTITY: 'Name the member by exactly one of userId or actorId',
  UNKNOWN_ACTOR: 'No such actor',
  NOT_A_MEMBER: 'The caller holds no membership in this room',
  ALREADY_REVOKED: 'The membership was already revoked',
  REVOCATION_IS_SERVER_ONLY: 'Revoking a membership is not exposed over http',
  LIFECYCLE_IS_SERVER_ONLY: 'Changing a room state is not exposed over http',
  RECONCILIATION_IS_SERVER_ONLY:
    'Reconciling capacity is not exposed over http',
  PROMOTION_NEEDS_A_SESSION:
    'Promoting an actor requires an authenticated caller',
  NO_GRANT_TO_PROMOTE: 'The caller carries no grant to promote',
  ALREADY_LINKED: 'The actor already belongs to a user',
  RESUME_IS_SERVER_ONLY: 'Resuming a promotion is not exposed over http',
  RESUME_NEEDS_BOTH_NAMES:
    'Resuming a promotion names both the actor and the user',
  GRANT_IS_STALE: 'The grant no longer matches the actor it names',
  MEMBERSHIP_EXPIRES_IN_THE_PAST: 'The membership would expire before it began'
})
