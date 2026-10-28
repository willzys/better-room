import { writeOrConfirm } from '@/plugin/stores/collision'
import { found, toAttempt } from '@/plugin/stores/rows'
import { attemptTable } from '@/plugin/stores/table'
import { byKey, staleBefore } from '@/plugin/stores/where'

import type { DBAdapter } from 'better-auth/types'

import type { AttemptStore } from '@/core/attempt'

export const attemptStore = (adapter: DBAdapter): AttemptStore => {
  const attempts = attemptTable(adapter)

  const read = async (key: string) =>
    found(await attempts.findOne(byKey(key)), toAttempt)

  const open = (key: string, at: Date) =>
    writeOrConfirm(
      async () => {
        await attempts.create({ key, count: 1, lastAttemptAt: at })

        return true
      },
      async () => ((await read(key)) === null ? null : false)
    )

  const restart = async (key: string, unchangedSince: Date, at: Date) => {
    const restarted = await attempts.incrementOne({
      where: [
        ...byKey(key),
        { field: 'lastAttemptAt', operator: 'lte', value: unchangedSince }
      ],
      increment: {},
      set: { count: 1, lastAttemptAt: at }
    })

    return restarted !== null
  }

  const bump = async (key: string, after: Date) => {
    const counted = await attempts.incrementOne({
      where: [
        ...byKey(key),
        { field: 'lastAttemptAt', operator: 'gt', value: after }
      ],
      increment: { count: 1 }
    })

    return counted !== null
  }

  const refund = async (key: string, after: Date) => {
    const refunded = await attempts.incrementOne({
      where: [
        ...byKey(key),
        { field: 'lastAttemptAt', operator: 'gt', value: after },
        { field: 'count', operator: 'gt', value: 0 }
      ],
      increment: { count: -1 }
    })

    return refunded !== null
  }

  const prune = async (before: Date) => {
    await attempts.deleteMany([staleBefore(before)])
  }

  return { read, open, restart, bump, prune, refund }
}
