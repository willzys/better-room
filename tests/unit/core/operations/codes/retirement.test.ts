import { describe, expect, test } from 'bun:test'

import { retireCodes } from '@/core/operations/codes/retirement'

import { NOW } from '../../../../helpers/fixtures'

import type { RetirementStore } from '@/core/operations/codes/retirement'

const store = (pages: string[][]) => {
  const discarded: string[][] = []
  const instance: RetirementStore = {
    spent: () => Promise.resolve(pages.shift() ?? []),
    discard: ids => {
      discarded.push(ids)

      return Promise.resolve(ids.length)
    }
  }

  return { instance, discarded }
}

describe('retireCodes', () => {
  test('discards each page of spent codes until none is left', async () => {
    const { instance, discarded } = store([['code-1', 'code-2'], ['code-3']])

    expect(await retireCodes({ now: NOW }, instance)).toEqual({
      retired: 3,
      complete: true
    })
    expect(discarded).toEqual([['code-1', 'code-2'], ['code-3']])
  })

  test('says it stopped short when its passes run out', async () => {
    const endless = Array.from({ length: 60 }, (_, index) => [`code-${index}`])
    const { instance, discarded } = store(endless)

    expect(await retireCodes({ now: NOW }, instance)).toEqual({
      retired: 50,
      complete: false
    })
    expect(discarded).toHaveLength(50)
  })
})
