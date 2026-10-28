import { describe, expect, test } from 'bun:test'

import { readDisplayName } from '@/plugin/http/display-name'

describe('readDisplayName', () => {
  test.each([
    ['  Ana  ', 'Ana'],
    ['Ana  Maria', 'Ana Maria'],
    ['José', 'José'],
    ['名前', '名前']
  ])('keeps %p as %p', (input, name) => {
    expect(readDisplayName(input)).toBe(name)
  })

  test.each([
    ['empty', ''],
    ['blank', '   '],
    ['a line break', 'Ana\nMaria'],
    ['a zero width space', 'An​a'],
    ['a bidirectional override', '‮anA'],
    ['too long', 'a'.repeat(49)]
  ])('refuses a name that is %s', (_label, input) => {
    expect(readDisplayName(input)).toBeNull()
  })

  test('counts characters, not code units', () => {
    expect(readDisplayName('😀'.repeat(48))).toBe('😀'.repeat(48))
  })
})
