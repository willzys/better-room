import { writeOrConfirm } from '@/plugin/stores/collision'
import { found, toAttempt } from '@/plugin/stores/rows'
import { attemptTable } from '@/plugin/stores/table'
import { byKey } from '@/plugin/stores/where'

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

  const bump = async (key: string, after: Date, at: Date) => {
    const advanced = await attempts.incrementOne({
      where: [
        ...byKey(key),
        { field: 'lastAttemptAt', operator: 'gt', value: after },
        { field: 'lastAttemptAt', operator: 'lte', value: at }
      ],
      increment: { count: 1 },
      set: { lastAttemptAt: at }
    })

    if (advanced !== null) return true

    const counted = await attempts.incrementOne({
      where: [
        ...byKey(key),
        { field: 'lastAttemptAt', operator: 'gt', value: at }
      ],
      increment: { count: 1 }
    })

    return counted !== null
  }

  const prune = async (before: Date) => {
    await attempts.deleteMany([
      { field: 'lastAttemptAt', operator: 'lt', value: before }
    ])
  }

  return { read, open, restart, bump, prune }
}
