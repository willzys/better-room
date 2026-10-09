import { describe, expect, spyOn, test } from 'bun:test'

import { codeFormat, generate, normalize } from '@/security/code-format'

const crockford = codeFormat('crockford')
const numeric = codeFormat('numeric')

describe('codeFormat', () => {
  test('applies the default length of each format', () => {
    expect(crockford.length).toBe(8)
    expect(numeric.length).toBe(6)
  })

  test('honours an explicit length', () => {
    expect(codeFormat('crockford', 12).length).toBe(12)
    expect(codeFormat('numeric', 4).length).toBe(4)
  })

  test.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 65, 1024])(
    'rejects the invalid length %p',
    length => {
      expect(() => codeFormat('crockford', length)).toThrow(RangeError)
    }
  )

  test('accepts the boundary lengths', () => {
    expect(codeFormat('crockford', 1).length).toBe(1)
    expect(codeFormat('crockford', 64).length).toBe(64)
  })

  test('exposes a crockford alphabet of 32 unambiguous symbols', () => {
    expect(crockford.symbols).toHaveLength(32)
    expect(crockford.symbols).not.toMatch(/[ILOU]/)
    expect(new Set(crockford.symbols).size).toBe(32)
  })

  test('exposes a numeric alphabet of 10 digits', () => {
    expect(numeric.symbols).toBe('0123456789')
  })

  test('accepts a code made of any symbol of its own alphabet', () => {
    for (const symbol of crockford.symbols) {
      const code = symbol.repeat(crockford.length)

      expect(normalize(code, crockford)).toBe(code)
    }
  })
})

describe('normalize', () => {
  const short = codeFormat('crockford', 4)

  test.each([
    ['ABCD', 'ABCD'],
    ['abcd', 'ABCD'],
    ['AB-CD', 'ABCD'],
    ['AB--CD', 'ABCD'],
    ['A-B-C-D', 'ABCD'],
    ['--ABCD--', 'ABCD'],
    ['A B  C   D', 'ABCD'],
    ['\tABCD\n', 'ABCD']
  ])('canonicalises %p to %p', (input, expected) => {
    expect(normalize(input, short)).toBe(expected)
  })

  test.each([
    ['ILO1', '1101'],
    ['ilo1', '1101'],
    ['LOI1', '1011'],
    ['oooo', '0000']
  ])('maps the crockford aliases in %p to %p', (input, expected) => {
    expect(normalize(input, short)).toBe(expected)
  })

  test.each(['ABCU', 'abcu', 'AB_C', 'AB.C', 'AB+C', 'AB@C'])(
    'rejects %p for symbols outside the alphabet',
    input => {
      expect(normalize(input, short)).toBeNull()
    }
  )

  test.each(['', '   ', '--', 'AB', 'ABC', 'ABCDE', 'ABCDEFGHJ'])(
    'rejects %p for not matching the configured length',
    input => {
      expect(normalize(input, short)).toBeNull()
    }
  )

  test('rejects an input beyond the maximum accepted size', () => {
    expect(normalize(`${'-'.repeat(1024)}ABCD`, short)).toBeNull()
    expect(normalize(`${'-'.repeat(1020)}ABCD`, short)).toBe('ABCD')
  })

  test.each(['AB🙂', 'AB\u0000', 'ABÇ', 'ABİ', 'Aß', 'Aﬁ'])(
    'rejects the non-ascii input %p',
    input => {
      expect(normalize(input, codeFormat('crockford', 3))).toBeNull()
    }
  )

  test('rejects letters for the numeric format', () => {
    expect(normalize('12A456', numeric)).toBeNull()
    expect(normalize('48 21-93', numeric)).toBe('482193')
  })
})

const withBytes = (chunks: number[][], run: () => void) => {
  const draw = <T extends ArrayBufferView>(buffer: T): T => {
    const bytes = chunks.shift()
    if (!(buffer instanceof Uint8Array) || bytes === undefined)
      throw new Error('Unexpected random draw')
    buffer.set(bytes)
    return buffer
  }
  const spy = spyOn(crypto, 'getRandomValues').mockImplementation(draw)
  try {
    run()
  } finally {
    spy.mockRestore()
  }
}

describe('generate', () => {
  test('maps every byte in the Crockford alphabet, including 255', () => {
    const format = codeFormat('crockford', 32)
    withBytes([Array.from({ length: 32 }, (_, index) => 224 + index)], () => {
      expect(generate(format)).toBe(format.symbols)
    })
  })
  test('rejects bytes at and beyond the numeric bias boundary and fills the remaining positions', () => {
    withBytes(
      [
        [250, 251, 249, 0, 255, 19],
        [1, 2, 3, 4, 5, 6]
      ],
      () => {
        expect(generate(numeric)).toBe('909123')
      }
    )
  })
  test.each([1, 8, 64])('honours the configured length %p', length => {
    const format = codeFormat('crockford', length)
    withBytes([Array.from({ length }, () => 10)], () => {
      const code = generate(format)
      expect(code).toBe('A'.repeat(length))
      expect(normalize(code, format)).toBe(code)
    })
  })
})
