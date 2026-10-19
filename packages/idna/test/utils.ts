import idnaTestV2 from './fixtures/IdnaTestV2.txt?raw'

/** One line of Unicode's IdnaTestV2.txt, with blank columns filled in as its header describes. */
export type IdnaTestCase = {
  line: number
  source: string
  toUnicode: string
  toUnicodeStatus: readonly string[]
  toAsciiN: string
  toAsciiNStatus: readonly string[]
}

function unescape(text: string): string {
  return text
    .replace(/\\u([0-9A-Fa-f]{4})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\x\{([0-9A-Fa-f]+)\}/g, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
}

function column(text: string | undefined): string | undefined {
  const value = text?.trim() ?? ''
  if (value === '') return undefined
  return value === '""' ? '' : unescape(value)
}

function status(text: string | undefined): string[] | undefined {
  const value = text?.trim() ?? ''
  if (value === '') return undefined
  return value
    .slice(1, -1)
    .split(',')
    .map((code) => code.trim())
    .filter((code) => code !== '' && code !== 'X4_2')
}

export const idnaTestCases: readonly IdnaTestCase[] = idnaTestV2
  .split('\n')
  .flatMap((text, index) => {
    const fields = text.replace(/#.*/, '').split(';')
    if (fields.length < 7) return []
    const source = column(fields[0])!
    const toUnicode = column(fields[1]) ?? source
    const toUnicodeStatus = status(fields[2]) ?? []
    const toAsciiN = column(fields[3]) ?? toUnicode
    const toAsciiNStatus = status(fields[4]) ?? toUnicodeStatus
    return [{ line: index + 1, source, toUnicode, toUnicodeStatus, toAsciiN, toAsciiNStatus }]
  })

/**
 * Status codes for the checks that the `strict` option turns on: CheckHyphens, UseSTD3ASCIIRules
 * and VerifyDnsLength.
 */
export const strictCodes: ReadonlySet<string> = new Set(['V2', 'V3', 'U1', 'A4_1', 'A4_2'])

/** The result of `fn`, or `null` if it throws. */
export function attempt(fn: () => string): string | null {
  try {
    return fn()
  } catch {
    return null
  }
}
