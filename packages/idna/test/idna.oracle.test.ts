import { domainToASCII, domainToUnicode } from 'node:url'
import punycode from 'punycode/punycode.js'
import tr46 from 'tr46'
import { describe, expect, test } from 'vite-plus/test'
import * as Idna from '@portable/idna'
import { attempt, idnaTestCases } from './utils.js'

const pieces = [
  ...Array.from('abcxyzABCXYZ0189-_.éÉüÜßẞςΣαΩжЖאבשيه٠١۱日本語中文한국어。．｡＿ＡＢ①ﬁ㍿☕👁💩≠'),
  ...[
    0x300, 0x308, 0x94d, 0x915, 0x200c, 0x200d, 0xad, 0xfe0f, 0x627, 0x644, 0x640, 0x338, 0xff8a,
    0xff9f,
  ].map((code) => String.fromCodePoint(code)),
  'xn--',
  'xn--bcher-kva',
  'XN--ZCA',
  'xn--ls8h',
  'xn--a',
]

function randomDomains(count: number, seed: number): string[] {
  let state = seed
  const random = (n: number) => {
    state = (state * 1103515245 + 12345) % 2 ** 31
    return Math.floor((state / 2 ** 31) * n)
  }
  return Array.from({ length: count }, () => {
    let domain = ''
    for (let i = 1 + random(8); i > 0; i--) domain += pieces[random(pieces.length)]
    return domain
  })
}

const inputs = [
  ...new Set([...idnaTestCases.map(({ source }) => source), ...randomDomains(20_000, 7)]),
]
const isAscii = (text: string) => /^[\0-\x7f]*$/.test(text)

const viaTr46 = (domain: string, strict: boolean) => {
  const flags = {
    checkBidi: true,
    checkJoiners: true,
    checkHyphens: strict,
    useSTD3ASCIIRules: strict,
  }
  const { domain: result, error } = tr46.toUnicode(domain, flags)
  return error ? null : result
}

describe('matches tr46 7.0.0', () => {
  test.each([false, true])('toUnicode, strict: %s', (strict) => {
    const differences = inputs.filter(
      (input) => attempt(() => Idna.toUnicode(input, { strict })) !== viaTr46(input, strict),
    )
    expect(differences).toEqual([])
  })

  test('toAscii, strict: true', () => {
    const flags = {
      checkBidi: true,
      checkJoiners: true,
      checkHyphens: true,
      useSTD3ASCIIRules: true,
      verifyDNSLength: true,
    }
    const differences = inputs.filter(
      (input) =>
        attempt(() => Idna.toAscii(input, { strict: true })) !== tr46.toASCII(input, flags),
    )
    expect(differences).toEqual([])
  })

  test('toAscii, except where the URL Standard adds rules to UTS #46', () => {
    const differences = inputs.filter((input) => {
      const expected = tr46.toASCII(input, { checkBidi: true, checkJoiners: true })
      const actual = attempt(() => Idna.toAscii(input))
      if (isAscii(input)) return actual !== null && actual !== input.toLowerCase()
      if (expected === '' || (expected !== null && /[\0-\x20#%/:<>?@[\\\]^|\x7f]/.test(expected)))
        return actual !== null
      return actual !== expected
    })
    expect(differences).toEqual([])
  })
})

describe('matches node:url', () => {
  // domainToASCII and domainToUnicode run Node's whole host parser, which also reads IPv4 addresses,
  // percent-encoding and URL delimiters. Node's tables predate Unicode 18 and lack its new characters.
  const endsInNumber = /(^|\.)(0x[0-9a-f]*|[0-9]+)\.?$/i
  const domains = inputs.filter(
    (input) =>
      !/[%?#/\\@:]/.test(input) &&
      !/\P{Assigned}/u.test(input + (attempt(() => Idna.toUnicode(input)) ?? '')) &&
      !endsInNumber.test(attempt(() => Idna.toAscii(input)) ?? ''),
  )

  test('domainToASCII, except that Node skips the bidi rule', () => {
    let bidi = 0
    const differences = domains.filter((input) => {
      const actual = attempt(() => Idna.toAscii(input)) ?? ''
      if (actual === domainToASCII(input)) return false
      const withoutBidi = tr46.toASCII(input, { checkJoiners: true }) ?? ''
      if (actual === '' && withoutBidi === domainToASCII(input)) {
        bidi++
        return false
      }
      return true
    })
    expect(differences).toEqual([])
    expect(bidi).toBeGreaterThan(0)
  })

  test('domainToUnicode, for every domain toAscii and toUnicode accept', () => {
    const differences = domains.filter((input) => {
      const actual = attempt(() => Idna.toUnicode(input))
      return actual !== null && toAsciiAccepts(input) && actual !== domainToUnicode(input)
    })
    expect(differences).toEqual([])
  })
})

const toAsciiAccepts = (input: string) => attempt(() => Idna.toAscii(input)) !== null

function randomLabel(length: number, seed: number): string {
  let state = seed
  let label = ''
  for (let i = 0; i < length; i++) {
    state = (state * 1103515245 + 12345) % 2 ** 31
    const offset = (state >> 2) % 32
    const start = [0x61, 0x430, 0x4e00, 0x1f600][state % 4]!
    label += String.fromCodePoint(start + (start === 0x61 ? offset % 26 : offset))
  }
  return label
}

describe('matches punycode.js 2.3.1', () => {
  test.each([1, 2, 3])('on a 3000-character label, seed %i', (seed) => {
    const label = randomLabel(3000, seed)
    const ascii = Idna.toAscii(label)
    expect(ascii).toBe(punycode.toASCII(label))
    expect(Idna.toUnicode(ascii)).toBe(punycode.toUnicode(ascii))
  })
})
