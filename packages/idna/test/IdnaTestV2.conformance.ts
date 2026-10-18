import { describe, expect, test } from 'vite-plus/test'
import * as Idna from '@portable/idna'
import { attempt, idnaTestCases, strictCodes } from './utils.js'

type Mismatch = { line: number; source: string; expected: string | null; actual: string | null }

function check(
  convert: (source: string) => string,
  expected: (testCase: (typeof idnaTestCases)[number]) => string | null,
): Mismatch[] {
  const mismatches: Mismatch[] = []
  for (const testCase of idnaTestCases) {
    const actual = attempt(() => convert(testCase.source))
    if (actual !== expected(testCase))
      mismatches.push({
        line: testCase.line,
        source: testCase.source,
        expected: expected(testCase),
        actual,
      })
  }
  return mismatches
}

const lenient = (codes: readonly string[]) => codes.filter((code) => !strictCodes.has(code))

describe('IdnaTestV2.txt (Unicode 18.0.0)', () => {
  test('has the test cases', () => {
    expect(idnaTestCases.length).toBe(6396)
  })

  test('toUnicode with strict: true matches toUnicode', () => {
    const mismatches = check(
      (source) => Idna.toUnicode(source, { strict: true }),
      (testCase) => (testCase.toUnicodeStatus.length > 0 ? null : testCase.toUnicode),
    )
    expect(mismatches).toEqual([])
  })

  test('toAscii with strict: true matches toAsciiN', () => {
    const mismatches = check(
      (source) => Idna.toAscii(source, { strict: true }),
      (testCase) => (testCase.toAsciiNStatus.length > 0 ? null : testCase.toAsciiN),
    )
    expect(mismatches).toEqual([])
  })

  test('toUnicode matches toUnicode, ignoring the errors that only strict checks', () => {
    const mismatches = check(
      (source) => Idna.toUnicode(source),
      (testCase) => (lenient(testCase.toUnicodeStatus).length > 0 ? null : testCase.toUnicode),
    )
    expect(mismatches).toEqual([])
  })
})
