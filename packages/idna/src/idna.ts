import * as Errors from '@portable/errors'
import * as Table from './internal/lookup.js'
import * as Punycode from './internal/punycode.js'

export declare namespace toAscii {
  type Options = {
    /**
     * Apply the hostname rules of STD 3 and the DNS length limits: only `a-z`, `0-9` and `-` in a
     * label, no `-` at either end of a label or in its third and fourth positions, and at most 63
     * characters in a label and 253 in the name. This is the URL Standard's `beStrict`.
     * @default false
     */
    strict?: boolean | undefined
  }
}

export declare namespace toUnicode {
  type Options = {
    /**
     * Apply the hostname rules of STD 3: only `a-z`, `0-9` and `-` in a label, and no `-` at either
     * end of a label or in its third and fourth positions.
     * @default false
     */
    strict?: boolean | undefined
  }
}

/**
 * Converts a domain name to the ASCII form that DNS and `URL` use, with Punycode `xn--` labels for
 * non-ASCII labels. Follows UTS #46 and the URL Standard's domain parser, so the result equals
 * `new URL('http://' + domain).hostname` for any domain that doesn't end in a number.
 *
 * @example
 * ```ts
 * import * as Idna from '@portable/idna'
 *
 * Idna.toAscii('Bücher.example') // 'xn--bcher-kva.example'
 * ```
 *
 * @throws {InvalidInputError} if the domain isn't valid.
 */
export function toAscii(domain: string, options: toAscii.Options = {}): string {
  const { strict = false } = options
  let result: string
  if (!strict && isAscii(domain)) result = domain.toLowerCase()
  else {
    const labels = process(domain, strict)
    for (let i = 0; i < labels.length; i++) {
      const label = labels[i]!
      if (isAscii(label)) continue
      const encoded = Punycode.encode(label)
      if (encoded === undefined)
        throw new InvalidInputError(`Label "${label}" is too long to encode.`)
      labels[i] = `xn--${encoded}`
    }
    result = labels.join('.')
    if (strict) {
      for (const label of labels) {
        if (label.length === 0 || label.length > 63)
          throw new InvalidInputError(`Label "${label}" is not 1 to 63 characters long.`)
      }
      if (result.length > 253) throw new InvalidInputError('Domain is longer than 253 characters.')
    }
  }
  if (result === '') throw new InvalidInputError('Domain is empty.')
  const forbidden = result.match(forbiddenCodePoint)
  if (forbidden) throw new InvalidInputError(`Domain contains ${JSON.stringify(forbidden[0])}.`)
  return result
}

/**
 * Converts a domain name to Unicode for display, decoding its Punycode `xn--` labels. Follows
 * UTS #46 ToUnicode with the URL Standard's settings, and also maps and normalizes Unicode
 * input, so `toUnicode('xn--bcher-kva.example')` and `toUnicode('BÜCHER.example')` agree.
 *
 * @example
 * ```ts
 * import * as Idna from '@portable/idna'
 *
 * Idna.toUnicode(new URL('https://xn--bcher-kva.example/').hostname) // 'bücher.example'
 * ```
 *
 * @throws {InvalidInputError} if the domain isn't valid, such as a label that isn't valid
 * Punycode or decodes to characters IDNA doesn't allow.
 */
export function toUnicode(domain: string, options: toUnicode.Options = {}): string {
  const { strict = false } = options
  if (!strict && isAscii(domain) && !punycodeLabel.test(domain)) return domain.toLowerCase()
  return process(domain, strict).join('.')
}

/**
 * Thrown when a domain name breaks the rules of UTS #46.
 *
 * @example
 * ```ts
 * import * as Idna from '@portable/idna'
 *
 * try {
 *   Idna.toUnicode('www.xn--b.com')
 * } catch (error) {
 *   if (error instanceof Idna.InvalidInputError) console.log(error.message)
 * }
 * ```
 */
export class InvalidInputError extends Errors.InvalidInputError {
  static override readonly kind: string = 'Idna.InvalidInputError'
}

const nonAscii = /[^\0-\x7f]/
const isAscii = (text: string) => !nonAscii.test(text)
const punycodeLabel = /(?:^|\.)xn--/i
const forbiddenCodePoint = /[\0-\x20#%/:<>?@[\\\]^|\x7f]/
const std3 = /[^a-z0-9-]/

function process(domain: string, strict: boolean): string[] {
  const labels = map(domain).split('.')
  const decoded: boolean[] = []
  let bidiDomain = false
  for (let i = 0; i < labels.length; i++) {
    let label = labels[i]!
    if (label.startsWith('xn--')) {
      if (!isAscii(label))
        throw new InvalidInputError(`Label "${label}" mixes Punycode and Unicode.`)
      const text = Punycode.decode(label.slice(4))
      if (text === undefined) throw new InvalidInputError(`Label "${label}" isn't valid Punycode.`)
      if (isAscii(text)) throw new InvalidInputError(`Label "${label}" decodes to ASCII.`)
      labels[i] = label = text
      decoded[i] = true
    }
    if (label !== '' && validate(label, strict, decoded[i] === true)) bidiDomain = true
  }
  if (bidiDomain)
    for (const label of labels)
      if (label !== '' && !satisfiesBidiRule(label))
        throw new InvalidInputError(`Label "${label}" breaks the bidi rule of RFC 5893.`)
  return labels
}

/** UTS #46 steps 1 and 2: map each code point, then normalize to NFC. */
function map(domain: string): string {
  if (isAscii(domain)) return domain.toLowerCase()
  let result = ''
  let kept = 0
  for (let i = 0; i < domain.length; i++) {
    let code = domain.charCodeAt(i)
    if (code < 0x80) {
      if (code < 0x41 || code > 0x5a) continue
      result += domain.slice(kept, i) + String.fromCharCode(code + 32)
      kept = i + 1
      continue
    }
    const start = i
    if (code >= 0xd800 && code <= 0xdbff) {
      const low = domain.charCodeAt(i + 1)
      if (low >= 0xdc00 && low <= 0xdfff) {
        code = 0x10000 + ((code - 0xd800) << 10) + (low - 0xdc00)
        i++
      }
    }
    const entry = Table.lookup(code)
    const kind = entry & 3
    if (kind === Table.valid || kind === Table.disallowed) continue
    result += domain.slice(kept, start) + Table.mapping(code, entry)
    kept = i + 1
  }
  return (result + domain.slice(kept)).normalize('NFC')
}

/**
 * UTS #46 validity criteria except CheckBidi. Returns whether the label has right-to-left
 * characters.
 */
function validate(label: string, strict: boolean, decoded: boolean): boolean {
  const invalid = (reason: string) => new InvalidInputError(`Label "${label}" ${reason}.`)
  if (decoded) {
    if (label.normalize('NFC') !== label) throw invalid('is not in Unicode normalization form C')
    if (label.includes('.')) throw invalid('contains "."')
  }
  if (strict) {
    const start = Array.from(label.slice(0, 8))
    if (start[2] === '-' && start[3] === '-')
      throw invalid('has "-" in its third and fourth positions')
    if (label.startsWith('-') || label.endsWith('-')) throw invalid('starts or ends with "-"')
  } else if (label.startsWith('xn--')) throw invalid('decodes to a label that starts with "xn--"')

  if (isAscii(label)) {
    if (strict && std3.test(label)) throw invalid('contains a disallowed character')
    return false
  }

  let rtl = false
  let joiner = false
  for (let i = 0; i < label.length; i++) {
    const code = label.codePointAt(i)!
    const first = i === 0
    if (code > 0xffff) i++
    if (code < 0x80) {
      if (strict ? std3.test(label[i]!) : code >= 0x41 && code <= 0x5a)
        throw invalid('contains a disallowed character')
      continue
    }
    const entry = Table.lookup(code)
    if ((entry & 3) !== Table.valid)
      throw invalid(`contains U+${hex(code)}, which IDNA doesn't allow`)
    if (first && entry & mark) throw invalid('starts with a combining mark')
    const bidi = (entry >> 2) & 15
    if (bidi === Table.bidiR || bidi === Table.bidiAL || bidi === Table.bidiAN) rtl = true
    if (code === 0x200c || code === 0x200d) joiner = true
  }
  if (joiner) checkJoiners(label, invalid)
  return rtl
}

const mark = 1 << 9
const virama = 1 << 10
const hex = (code: number) => code.toString(16).toUpperCase().padStart(4, '0')

const properties = (code: number) => Table.lookup(code) >> 2
const joiningType = (code: number) => (properties(code) >> 4) & 7

/**
 * The ContextJ rules of RFC 5892 appendix A for U+200C ZERO WIDTH NON-JOINER and U+200D ZERO WIDTH
 * JOINER.
 */
function checkJoiners(label: string, invalid: (reason: string) => InvalidInputError): void {
  const codePoints = Array.from(label, (char) => char.codePointAt(0)!)
  for (let i = 0; i < codePoints.length; i++) {
    const code = codePoints[i]!
    if (code !== 0x200c && code !== 0x200d) continue
    if (i > 0 && Table.lookup(codePoints[i - 1]!) & virama) continue
    if (code === 0x200d) throw invalid('has a zero width joiner that does not follow a virama')
    let before = i - 1
    while (before >= 0 && joiningType(codePoints[before]!) === Table.joiningT) before--
    let after = i + 1
    while (after < codePoints.length && joiningType(codePoints[after]!) === Table.joiningT) after++
    const left = before >= 0 ? joiningType(codePoints[before]!) : 0
    const right = after < codePoints.length ? joiningType(codePoints[after]!) : 0
    if (
      (left !== Table.joiningL && left !== Table.joiningD) ||
      (right !== Table.joiningR && right !== Table.joiningD)
    )
      throw invalid('has a zero width non-joiner outside a joining context')
  }
}

/**
 * The six conditions of RFC 5893 section 2, which each label of a domain with right-to-left
 * characters must meet.
 */
function satisfiesBidiRule(label: string): boolean {
  const classes = Array.from(label, (char) => properties(char.codePointAt(0)!) & 15)
  const first = classes[0]
  let end = classes.length - 1
  while (end > 0 && classes[end] === Table.bidiNSM) end--
  const last = classes[end]
  if (first === Table.bidiR || first === Table.bidiAL) {
    let en = false
    let an = false
    for (const bidi of classes) {
      if (bidi === Table.bidiL || bidi === 0) return false
      if (bidi === Table.bidiEN) en = true
      if (bidi === Table.bidiAN) an = true
    }
    return (
      !(en && an) &&
      (last === Table.bidiR ||
        last === Table.bidiAL ||
        last === Table.bidiEN ||
        last === Table.bidiAN)
    )
  }
  if (first !== Table.bidiL) return false
  for (const bidi of classes)
    if (bidi === Table.bidiR || bidi === Table.bidiAL || bidi === Table.bidiAN || bidi === 0)
      return false
  return last === Table.bidiL || last === Table.bidiEN
}
