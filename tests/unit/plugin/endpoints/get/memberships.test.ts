import { describe, expect, test } from 'bun:test'

import { writeCursor } from '@/plugin/http/cursor'

import { getRoute, jarOf, listedMemberships } from '../../../../helpers/http'
import { empty, memoryAuth, seedRoom } from '../../../../helpers/memory'

const scenario = async () => {
  const db = empty()
  const code = await seedRoom(db)
  const auth = memoryAuth(db)
  const cookie = jarOf(
    await auth.api.joinRoom({ body: { code }, asResponse: true })
  )
  const list = (before?: string) =>
    getRoute(
      auth,
      before === undefined
        ? 'memberships'
        : `memberships?before=${encodeURIComponent(before)}`,
      { cookie }
    )

  return { list }
}

describe('resuming a membership listing over http', () => {
  test('continues from the branch the cursor names', async () => {
    const { list } = await scenario()
    const cursor = writeCursor({ branch: 'dated', after: null })

    if (cursor === null) throw new Error('a resumption always has a cursor')

    const first = await listedMemberships(await list())
    const resumed = await listedMemberships(await list(cursor))

    expect(first.memberships).toHaveLength(1)
    expect(resumed.memberships).toEqual([])
  })

  test('refuses a cursor it cannot read', async () => {
    const { list } = await scenario()

    const response = await list('not-a-cursor')

    expect(response.status).toBe(400)
    expect(await response.text()).toContain('Unreadable listing cursor')
  })
})
