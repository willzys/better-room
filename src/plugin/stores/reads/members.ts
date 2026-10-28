import { accessStore } from '@/plugin/stores/reads/access'
import { standingPage } from '@/plugin/stores/standing'
import { actorTable, userTable } from '@/plugin/stores/table'

import type { DBAdapter } from 'better-auth/types'

import type { MembersStore, Person } from '@/core/operations/reads/members'
import type { Resumption } from '@/core/operations/reads/memberships'
import type { Unstarted } from '@/types/absence'

export const membersStore = (adapter: DBAdapter): MembersStore => {
  const actors = actorTable(adapter)
  const users = userTable(adapter)

  const standing = (
    roomId: string,
    now: Date,
    before: Unstarted<Resumption>,
    page: number
  ) =>
    standingPage(
      adapter,
      {
        owner: { field: 'roomId', value: roomId },
        key: 'actorId',
        now,
        ceiling: page
      },
      before
    )

  const people = async (actorIds: string[]): Promise<Person[]> => {
    if (actorIds.length === 0) return []

    const actorRows = await actors.findMany({
      where: [{ field: 'id', operator: 'in', value: actorIds }],
      limit: actorIds.length
    })
    const userIds = actorRows.flatMap(row => row.userId ?? [])
    const userRows =
      userIds.length === 0
        ? []
        : await users.findMany({
            where: [{ field: 'id', operator: 'in', value: userIds }],
            limit: userIds.length
          })
    const names = new Map(userRows.map(row => [row.id, row.name]))

    return actorRows.map(row => {
      const userId = row.userId ?? null

      return {
        actorId: row.id,
        anonymous: userId === null,
        accountName: userId === null ? null : (names.get(userId) ?? null)
      }
    })
  }

  return { ...accessStore(adapter), standing, people }
}
