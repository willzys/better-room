import type { MembershipReport, RoomReport } from '@/plugin/http/report'

type MembershipType =
  | 'joined'
  | 'added'
  | 'renamed'
  | 'left'
  | 'revoked'
  | 'expired'

type MembershipChange = {
  readonly [T in MembershipType]: {
    readonly type: T
    readonly roomId: string
    readonly membership: MembershipReport
  }
}[MembershipType]

type RoomType = 'created' | 'locked' | 'unlocked' | 'closed'

type RoomChange = {
  readonly [T in RoomType]: {
    readonly type: T
    readonly roomId: string
    readonly room: RoomReport
  }
}[RoomType]

type CodeChange = {
  readonly type: 'rotated'
  readonly roomId: string
}

type ActorChange =
  | {
      readonly type: 'promoted'
      readonly actorId: string
      readonly merged: string
    }
  | {
      readonly type: 'erased'
      readonly actorId: string
    }

export type RoomEvent = MembershipChange | RoomChange | CodeChange | ActorChange

export type RoomEventOf<T extends RoomEvent['type']> = Extract<
  RoomEvent,
  { readonly type: T }
>

type RoomHook<E extends RoomEvent> = (event: E) => void | Promise<void>

type HookName<T extends RoomEvent['type']> = `on${Capitalize<T>}`

export type RoomHooks = {
  readonly [T in RoomEvent['type'] as HookName<T>]?:
    | RoomHook<RoomEventOf<T>>
    | undefined
} & {
  readonly onEvent?: RoomHook<RoomEvent> | undefined
}

const EVENT_HOOKS = {
  joined: 'onJoined',
  added: 'onAdded',
  renamed: 'onRenamed',
  left: 'onLeft',
  revoked: 'onRevoked',
  expired: 'onExpired',
  created: 'onCreated',
  locked: 'onLocked',
  unlocked: 'onUnlocked',
  closed: 'onClosed',
  rotated: 'onRotated',
  promoted: 'onPromoted',
  erased: 'onErased'
} as const satisfies { readonly [T in RoomEvent['type']]: HookName<T> }

const HOOK_NAMES: readonly string[] = [...Object.values(EVENT_HOOKS), 'onEvent']

type Reporter = {
  readonly error: (message: string, ...details: unknown[]) => void
}

export const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export const assertRoomHooks: (
  value: unknown
) => asserts value is RoomHooks = value => {
  if (!isObject(value)) {
    throw new TypeError('hooks must be an object')
  }

  for (const [name, hook] of Object.entries(value)) {
    if (!HOOK_NAMES.includes(name)) {
      throw new TypeError(
        `hooks.${name} is not a hook; expected one of ${HOOK_NAMES.join(', ')}`
      )
    }
    if (hook !== undefined && typeof hook !== 'function') {
      throw new TypeError(`hooks.${name} must be a function`)
    }
  }
}

const hookFor = (hooks: RoomHooks, event: RoomEvent) =>
  (hooks[EVENT_HOOKS[event.type]] as RoomHook<RoomEvent> | undefined) ??
  hooks.onEvent

export const signalling =
  (hooks: RoomHooks = {}) =>
  async (event: RoomEvent, logger: Reporter) => {
    const hook = hookFor(hooks, event)
    if (hook === undefined) return

    try {
      await hook(structuredClone(event))
    } catch (error) {
      logger.error(
        `better-room could not deliver a ${event.type} event; the change itself was saved`,
        error
      )
    }
  }

export type Signal = ReturnType<typeof signalling>

export const signalOf = (hooks: unknown) => {
  if (hooks === undefined) return signalling()

  assertRoomHooks(hooks)

  return signalling(hooks)
}
