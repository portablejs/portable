import { checkLength, toText } from './internal/text.js'

export declare namespace fold {
  type Options = {
    /** Longest line, not counting the line break. RFC 5322 recommends 78 at most. @default 76 */
    lineLength?: number | undefined
  }
}

/**
 * Folds a header line (RFC 5322 section 2.2.3) by inserting CRLF before whitespace, so that each
 * line fits in `lineLength` where the text has whitespace to break at. A word longer than a line
 * is kept whole, and line breaks already in the text are kept. `unfold` reverses it exactly.
 *
 * @example
 * ```ts
 * import * as MimeHeaders from '@portable/mime-headers'
 *
 * MimeHeaders.fold('Subject: ' + MimeHeaders.encodeWords(subject))
 * MimeHeaders.fold('To: a@example.com, b@example.com', { lineLength: 20 })
 * // 'To: a@example.com,\r\n b@example.com'
 * ```
 */
export function fold(input: string | Uint8Array, options: fold.Options = {}): string {
  const { lineLength = 76 } = options
  checkLength('lineLength', lineLength)
  const text = toText(input)
  const lines = text.split(/(\r\n|\r|\n)/)
  let result = ''
  for (let i = 0; i < lines.length; i++)
    result += i % 2 === 1 ? lines[i]! : foldLine(lines[i]!, lineLength)
  return result
}

const isSpace = (code: number) => code === 0x20 || code === 0x09

function trimSpace(text: string, start: number): string {
  let end = text.length
  while (start < end && isSpace(text.charCodeAt(start))) start++
  while (end > start && isSpace(text.charCodeAt(end - 1))) end--
  return text.slice(start, end)
}

/** Whether a line can be broken in front of `text[i]`: the start of a whitespace run. */
const isBreak = (text: string, i: number) =>
  isSpace(text.charCodeAt(i)) && !isSpace(text.charCodeAt(i - 1))

function foldLine(line: string, lineLength: number): string {
  let lastWord = line.length - 1
  while (lastWord >= 0 && isSpace(line.charCodeAt(lastWord))) lastWord--
  let result = ''
  let start = 0
  while (line.length - start > lineLength) {
    let at = start + lineLength
    while (at > start && !isBreak(line, at)) at--
    if (at === start) {
      at = start + lineLength + 1
      while (at < line.length && !isBreak(line, at)) at++
    }
    if (at > lastWord) break
    result += line.slice(start, at) + '\r\n'
    start = at
  }
  return result + line.slice(start)
}

/**
 * Removes the line breaks that fold a header (RFC 5322 section 2.2.3): every CRLF followed by a
 * space or a tab. The whitespace stays, so `unfold(fold(line))` is `line`. A bare LF or CR in
 * front of whitespace is removed as well, since mail stored on disk often uses them.
 *
 * @example
 * ```ts
 * import * as MimeHeaders from '@portable/mime-headers'
 *
 * MimeHeaders.unfold('Subject: line one\r\n line two') // 'Subject: line one line two'
 * ```
 */
export function unfold(input: string | Uint8Array): string {
  return toText(input).replace(/(?:\r\n|\r|\n)(?=[ \t])/g, '')
}

/** One header field: its name as written and its unfolded value. */
export type Header = {
  readonly name: string
  readonly value: string
}

/**
 * Splits a header block into fields. Reading stops at the first empty line, so a whole message can
 * be passed in. Each value is unfolded, with the whitespace around it removed, and its encoded
 * words are left as they are, because whether to decode them depends on the field. Names keep
 * their case, and a line without a colon is skipped.
 *
 * @example
 * ```ts
 * import * as MimeHeaders from '@portable/mime-headers'
 *
 * MimeHeaders.parseHeaders('Subject: Hello\r\n world\r\nTo: a@example.com\r\n\r\nBody')
 * // [{ name: 'Subject', value: 'Hello world' }, { name: 'To', value: 'a@example.com' }]
 * ```
 */
export function parseHeaders(input: string | Uint8Array): Header[] {
  const lines = toText(input).split(/\r\n|\r|\n/)
  let first = 0
  while (first < lines.length && lines[first] === '') first++
  const fields: string[] = []
  for (let i = first; i < lines.length && lines[i] !== ''; i++) {
    const line = lines[i]!
    if (fields.length > 0 && isSpace(line.charCodeAt(0))) fields[fields.length - 1] += line
    else fields.push(line)
  }
  const headers: Header[] = []
  for (const field of fields) {
    const colon = field.indexOf(':')
    if (colon < 0) continue
    headers.push({
      name: field.slice(0, colon).trim(),
      value: trimSpace(field, colon + 1),
    })
  }
  return headers
}
