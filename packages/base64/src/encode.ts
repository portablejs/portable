export type Alphabet = 'base64' | 'base64url'

export declare namespace encode {
  type Options = {
    /** `'base64'` uses `+` and `/`, `'base64url'` uses `-` and `_` (RFC 4648 §5). @default 'base64' */
    alphabet?: Alphabet | undefined
    /** Characters per line, or `false` for one line. MIME uses 76. @default false */
    lineLength?: number | false | undefined
    /** Inserted between lines when `lineLength` is set. @default '\r\n' */
    lineEnding?: string | undefined
    /** Leave out the trailing `=` characters. @default false */
    omitPadding?: boolean | undefined
  }
}

/**
 * Encodes bytes, or a string as UTF-8, to base64. Uses `Uint8Array.prototype.toBase64` where the
 * runtime has it.
 *
 * @example
 * ```ts
 * import { encode } from '@portable/base64'
 *
 * encode('hello') // 'aGVsbG8='
 * encode(new Uint8Array([0xfb, 0xff]), { alphabet: 'base64url', omitPadding: true }) // '-_8'
 * encode(attachment, { lineLength: 76 }) // MIME body, lines joined with CRLF
 * ```
 */
export function encode(input: Uint8Array | string, options: encode.Options = {}): string {
  const {
    alphabet = 'base64',
    lineEnding = '\r\n',
    lineLength = false,
    omitPadding = false,
  } = options
  checkAlphabet(alphabet)
  checkLineLength(lineLength)
  const text = toBase64(
    typeof input === 'string' ? utf8.encode(input) : input,
    alphabet,
    omitPadding,
  )
  return lineLength === false ? text : wrap(text, lineLength, lineEnding, 0)
}

const utf8 = new TextEncoder()

type NativeToBase64 = (
  this: Uint8Array,
  options: { alphabet: Alphabet; omitPadding: boolean },
) => string
const nativeToBase64: NativeToBase64 | undefined = Reflect.get(Uint8Array.prototype, 'toBase64')

export function toBase64(bytes: Uint8Array, alphabet: Alphabet, omitPadding: boolean): string {
  return nativeToBase64
    ? nativeToBase64.call(bytes, { alphabet, omitPadding })
    : encodeFallback(bytes, alphabet, omitPadding)
}

const characters: Record<Alphabet, string> = {
  base64: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/',
  base64url: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_',
}

type Tables = { chars: string; pairCodes: Uint16Array; pairStrings: string[] }
const tables: Partial<Record<Alphabet, Tables>> = {}
const littleEndian = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1

function tablesFor(alphabet: Alphabet): Tables {
  const cached = tables[alphabet]
  if (cached) return cached
  const chars = characters[alphabet]
  const pairCodes = new Uint16Array(4096)
  const pairStrings: string[] = []
  for (let i = 0; i < 4096; i++) {
    const first = chars.charCodeAt(i >> 6)
    const second = chars.charCodeAt(i & 63)
    pairCodes[i] = littleEndian ? first | (second << 8) : (first << 8) | second
    pairStrings.push(chars[i >> 6]! + chars[i & 63]!)
  }
  return (tables[alphabet] = { chars, pairCodes, pairStrings })
}

const ascii = new TextDecoder()

// Below this many bytes, string concatenation beats filling a buffer and decoding it.
const smallInput = 600

export function encodeFallback(
  bytes: Uint8Array,
  alphabet: Alphabet,
  omitPadding: boolean,
): string {
  const { chars, pairCodes, pairStrings } = tablesFor(alphabet)
  const length = bytes.length
  const whole = length - (length % 3)
  let text = ''
  if (length < smallInput) {
    for (let i = 0; i < whole; i += 3) {
      const v = (bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!
      text += pairStrings[v >> 12]! + pairStrings[v & 4095]!
    }
  } else {
    const out = new Uint16Array((whole / 3) * 2)
    for (let i = 0, j = 0; i < whole; i += 3, j += 2) {
      const v = (bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!
      out[j] = pairCodes[v >> 12]!
      out[j + 1] = pairCodes[v & 4095]!
    }
    text = ascii.decode(out)
  }
  if (length - whole === 1) {
    const v = bytes[whole]!
    text += chars[v >> 2]! + chars[(v & 3) << 4]! + (omitPadding ? '' : '==')
  } else if (length - whole === 2) {
    const v = (bytes[whole]! << 8) | bytes[whole + 1]!
    text +=
      chars[v >> 10]! + chars[(v >> 4) & 63]! + chars[(v & 15) << 2]! + (omitPadding ? '' : '=')
  }
  return text
}

/** Breaks `text` into lines, continuing a line that already has `column` characters. */
export function wrap(text: string, lineLength: number, lineEnding: string, column: number): string {
  const first = lineLength - column
  if (text.length <= first) return text
  const lines = [text.slice(0, first)]
  for (let i = first; i < text.length; i += lineLength) lines.push(text.slice(i, i + lineLength))
  return lines.join(lineEnding)
}

export function checkAlphabet(alphabet: unknown): void {
  if (alphabet !== 'base64' && alphabet !== 'base64url')
    throw new TypeError(`Unknown alphabet: ${String(alphabet)}. Use 'base64' or 'base64url'.`)
}

export function checkLineLength(lineLength: unknown): void {
  if (lineLength !== false && !(Number.isSafeInteger(lineLength) && Number(lineLength) > 0))
    throw new RangeError(
      `lineLength must be a positive integer or false, got ${String(lineLength)}.`,
    )
}
