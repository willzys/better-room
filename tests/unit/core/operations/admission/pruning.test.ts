import { describe, expect, test } from 'bun:test'

import { pruneAttempts } from '@/core/operations/admission/pruning'

import { NOW } from '../../../../helpers/fixtures'

import type { PruningStore } from '@/core/operations/admission/pruning'

const store = (pages: (before: Date) => string[]) => {
  const discarded: string[][] = []
  const instance: PruningStore = {
    expired: before => Promise.resolve(pages(before)),
    discard: keys => {
      discarded.push(keys)

      return Promise.resolve(keys.length)
    }
  }

  return { instance, discarded }
}

describe('pruneAttempts', () => {
  test('reads past the window and discards each page until none is left', async () => {
    const reads: Date[] = []
    const pages = [['ip:a', 'ip:b'], ['ip:c'], []]
    const { instance, discarded } = store(before => {
      reads.push(before)

      return pages.shift() ?? []
    })

    expect(await pruneAttempts({ now: NOW, window: 60 }, instance)).toEqual({
      pruned: 3,
      complete: true
    })
    expect(discarded).toEqual([['ip:a', 'ip:b'], ['ip:c']])
    expect(
      reads.every(before => before.getTime() === NOW.getTime() - 60_000)
    ).toBe(true)
  })

  test('says it stopped short when its passes run out', async () => {
    const { instance, discarded } = store(() => ['ip:a'])

    expect(await pruneAttempts({ now: NOW, window: 60 }, instance)).toEqual({
      pruned: 50,
      complete: false
    })
    expect(discarded).toHaveLength(50)
  })
})
