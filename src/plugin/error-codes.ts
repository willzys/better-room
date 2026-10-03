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
  ROOM_CONTENDED: {
    code: 'ROOM_CONTENDED',
    message: 'The room changed state while this request settled it'
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
  },
  ROTATION_IS_SERVER_ONLY: {
    code: 'ROTATION_IS_SERVER_ONLY',
    message: 'Rotating a room code is not exposed over http'
  },
  UNKNOWN_ROOM: {
    code: 'UNKNOWN_ROOM',
    message: 'No such room'
  },
  ADDITION_IS_SERVER_ONLY: {
    code: 'ADDITION_IS_SERVER_ONLY',
    message: 'Adding a member is not exposed over http'
  },
  ALREADY_A_MEMBER: {
    code: 'ALREADY_A_MEMBER',
    message: 'The actor already holds a membership in this room'
  },
  EXACTLY_ONE_IDENTITY: {
    code: 'EXACTLY_ONE_IDENTITY',
    message: 'Name the member by exactly one of userId or actorId'
  },
  UNKNOWN_ACTOR: {
    code: 'UNKNOWN_ACTOR',
    message: 'No such actor'
  },
  NOT_A_MEMBER: {
    code: 'NOT_A_MEMBER',
    message: 'The caller holds no membership in this room'
  },
  ALREADY_REVOKED: {
    code: 'ALREADY_REVOKED',
    message: 'The membership was already revoked'
  },
  REVOCATION_IS_SERVER_ONLY: {
    code: 'REVOCATION_IS_SERVER_ONLY',
    message: 'Revoking a membership is not exposed over http'
  },
  LIFECYCLE_IS_SERVER_ONLY: {
    code: 'LIFECYCLE_IS_SERVER_ONLY',
    message: 'Changing a room state is not exposed over http'
  },
  RECONCILIATION_IS_SERVER_ONLY: {
    code: 'RECONCILIATION_IS_SERVER_ONLY',
    message: 'Reconciling capacity is not exposed over http'
  },
  PROMOTION_NEEDS_A_SESSION: {
    code: 'PROMOTION_NEEDS_A_SESSION',
    message: 'Promoting an actor requires an authenticated caller'
  },
  NO_GRANT_TO_PROMOTE: {
    code: 'NO_GRANT_TO_PROMOTE',
    message: 'The caller carries no grant to promote'
  },
  ALREADY_LINKED: {
    code: 'ALREADY_LINKED',
    message: 'The actor already belongs to a user'
  },
  RESUME_IS_SERVER_ONLY: {
    code: 'RESUME_IS_SERVER_ONLY',
    message: 'Resuming a promotion is not exposed over http'
  },
  RESUME_NEEDS_BOTH_NAMES: {
    code: 'RESUME_NEEDS_BOTH_NAMES',
    message: 'Resuming a promotion names both the actor and the user'
  },
  GRANT_IS_STALE: {
    code: 'GRANT_IS_STALE',
    message: 'The grant no longer matches the actor it names'
  },
  MEMBERSHIP_EXPIRES_IN_THE_PAST: {
    code: 'MEMBERSHIP_EXPIRES_IN_THE_PAST',
    message: 'The membership would expire before it began'
  }
} as const
