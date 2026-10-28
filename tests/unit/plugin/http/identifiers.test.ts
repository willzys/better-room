import { describe, expect, test } from 'bun:test'

import { isStoredId } from '@/plugin/http/identifiers'

const mode = (generateId?: 'serial' | 'uuid') =>
  generateId === undefined ? {} : { advanced: { database: { generateId } } }

describe('isStoredId', () => {
  test.each([
    ['serial', '1', true],
    ['serial', '2147483647', true],
    ['serial', '2147483648', false],
    ['serial', '0', false],
    ['serial', '01', false],
    ['serial', '1.5', false],
    ['serial', 'abc', false],
    ['uuid', '0b5c6f1e-8a2d-4c3b-9f00-1d2e3f4a5b6c', true],
    ['uuid', '0B5C6F1E-8A2D-4C3B-9F00-1D2E3F4A5B6C', true],
    ['uuid', '0b5c6f1e8a2d4c3b9f001d2e3f4a5b6c', false],
    ['uuid', 'abc', false]
  ] as const)('answers %s %p as %p', (generateId, value, expected) => {
    expect(isStoredId(mode(generateId), value)).toBe(expected)
  })

  test('accepts any bounded text under the default ids', () => {
    expect(isStoredId(mode(), 'p.abc')).toBe(true)
    expect(isStoredId(mode(), '')).toBe(false)
    expect(isStoredId(mode(), 'x'.repeat(256))).toBe(false)
  })
})
