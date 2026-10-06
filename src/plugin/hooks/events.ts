import type { MembershipReport, RoomReport } from '@/plugin/http/report'

type MembershipChange = {
  readonly type: 'joined' | 'added' | 'left' | 'revoked'
  readonly roomId: string
  readonly membership: MembershipReport
}

type RoomChange = {
  readonly type: 'locked' | 'unlocked' | 'closed'
  readonly roomId: string
  readonly room: RoomReport
}

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

export type RoomEventListener = (event: RoomEvent) => void | Promise<void>

type Reporter = {
  readonly error: (message: string, ...details: unknown[]) => void
}

export const isRoomEventListener = (
  value: unknown
): value is RoomEventListener => typeof value === 'function'

export const signalling =
  (listener?: RoomEventListener) =>
  async (event: RoomEvent, logger: Reporter) => {
    if (listener === undefined) return

    try {
      await listener(event)
    } catch (error) {
      logger.error(
        `better-room could not deliver a ${event.type} event; the change itself was saved`,
        error
      )
    }
  }

export type Signal = ReturnType<typeof signalling>
