import { InvalidInputError } from './errors.js'
import { decodeCharset, encodeUtf8Scratch, hexDigit, toText } from './internal/text.js'
import { decodeWords } from './words.js'

/** A header value with parameters, such as `Content-Type` or `Content-Disposition`. */
export type Value = {
  /** The part before the first `;`, such as `text/plain` or `attachment`. */
  readonly value: string
  /** Parameters by name. `parseValue` lowercases the names. */
  readonly params: Readonly<Record<string, string>>
}

/**
 * Parses a header value with parameters (RFC 2045 section 5.1), such as
 * `text/plain; charset=utf-8`. Parameter names are lowercased. Values are unquoted and fully
 * decoded: RFC 2231 continuations (`name*0*=`) are joined and decoded from their charset, and RFC
 * 2047 encoded words in plain values are decoded, as mail clients send them in file names. When
 * a parameter has both forms, the RFC 2231 one wins (RFC 6266 section 4.3). Never throws.
 *
 * @example
 * ```ts
 * import * as MimeHeaders from '@portable/mime-headers'
 *
 * MimeHeaders.parseValue('text/plain; CHARSET="utf-8"; format=flowed')
 * // { value: 'text/plain', params: { charset: 'utf-8', format: 'flowed' } }
 * MimeHeaders.parseValue("attachment; filename*=UTF-8''J%C3%B5geva.txt")
 * // { value: 'attachment', params: { filename: 'Jõgeva.txt' } }
 * ```
 */
export function parseValue(input: string | Uint8Array): Value {
  const text = toText(input)
  const params = new Map<string, string>()
  const sections = new Map<string, Section[]>()
  let value: string | undefined
  let key: string | undefined
  let inKey = false
  let buffer = ''
  let end = 0
  let quoted = false

  const commit = () => {
    const collected = buffer.slice(0, end)
    buffer = ''
    end = 0
    if (value === undefined) value = collected
    else if (inKey) {
      if (collected !== '') addParam(params, sections, collected.toLowerCase(), '')
    } else if (key !== '') addParam(params, sections, key!, collected)
  }

  for (let i = 0; i < text.length; i++) {
    const character = text[i]!
    if (quoted) {
      if (character === '"') quoted = false
      else {
        if (character === '\\' && i + 1 < text.length) i++
        buffer += text[i]
        end = buffer.length
      }
    } else if (character === ';') {
      commit()
      inKey = true
    } else if (inKey && character === '=') {
      key = buffer.slice(0, end).toLowerCase()
      buffer = ''
      end = 0
      inKey = false
    } else if (character === '"' && !inKey) {
      quoted = true
      end = buffer.length
    } else if (
      character === ' ' ||
      character === '\t' ||
      character === '\r' ||
      character === '\n'
    ) {
      if (buffer !== '') buffer += character
    } else {
      buffer += character
      end = buffer.length
    }
  }
  commit()

  for (const [name, parts] of sections) params.set(name, joinSections(parts))
  return { value: value ?? '', params: Object.fromEntries(params) }
}

type Section = { index: number; extended: boolean; text: string }

function addParam(
  params: Map<string, string>,
  sections: Map<string, Section[]>,
  name: string,
  text: string,
) {
  const extended = name.endsWith('*')
  let base = extended ? name.slice(0, -1) : name
  const numbered = /\*(\d+)$/.exec(base)
  if (numbered) base = base.slice(0, numbered.index)
  if (!extended && !numbered) {
    params.set(name, decodeWords(text))
    return
  }
  let list = sections.get(base)
  if (!list) sections.set(base, (list = []))
  list.push({ index: numbered ? Number(numbered[1]) : 0, extended, text })
}

function joinSections(sections: Section[]): string {
  sections.sort((a, b) => a.index - b.index)
  if (!sections.some((section) => section.extended))
    return decodeWords(sections.map((section) => section.text).join(''))
  let charset = 'utf-8'
  const first = sections[0]!
  if (first.extended) {
    const match = /^([^']*)'[^']*'([\s\S]*)$/.exec(first.text)
    if (match) {
      charset = match[1] || 'utf-8'
      first.text = match[2]!
    }
  }
  let result = ''
  let pending: number[] = []
  for (const section of sections) {
    if (section.extended) {
      percentDecode(section.text, pending)
      continue
    }
    if (pending.length > 0) result += decodeCharset(Uint8Array.from(pending), charset)
    pending = []
    result += section.text
  }
  if (pending.length > 0) result += decodeCharset(Uint8Array.from(pending), charset)
  return result
}

function percentDecode(text: string, out: number[]) {
  const bytes = encodeUtf8Scratch(text)
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i]!
    if (byte === 0x25 && i + 2 < bytes.length) {
      const high = hexDigit(bytes[i + 1]!)
      const low = hexDigit(bytes[i + 2]!)
      if (high >= 0 && low >= 0) {
        out.push((high << 4) | low)
        i += 2
        continue
      }
    }
    out.push(byte)
  }
}

/**
 * Formats a header value with parameters, the reverse of `parseValue`. A parameter value is
 * quoted when it holds a special character. A value with characters outside printable ASCII, or
 * one that would read as an encoded word, is percent-encoded as UTF-8 (RFC 2231), and a value too
 * long for one line is split into numbered sections. Fold the whole header line afterwards.
 *
 * @example
 * ```ts
 * import * as MimeHeaders from '@portable/mime-headers'
 *
 * MimeHeaders.formatValue({ value: 'attachment', params: { filename: 'report 2024.pdf' } })
 * // 'attachment; filename="report 2024.pdf"'
 * MimeHeaders.formatValue({ value: 'attachment', params: { filename: 'Jõgeva.txt' } })
 * // "attachment; filename*0*=utf-8''J%C3%B5geva.txt"
 * ```
 *
 * @throws {InvalidInputError} When `value` holds a control character or a character outside
 * ASCII, or a parameter name isn't an RFC 2231 attribute (a token without `*`, `'` or `%`).
 */
export function formatValue(input: Value): string {
  if (/[^\x20-\x7e]/.test(input.value))
    throw new InvalidInputError(`Header value ${JSON.stringify(input.value)} can't be sent as is.`)
  let result = input.value
  for (const [name, text] of Object.entries(input.params)) {
    if (!/^[!#$&+\-.0-9A-Z^_`a-z{|}~]+$/.test(name))
      throw new InvalidInputError(`Parameter name ${JSON.stringify(name)} isn't a token.`)
    for (const part of formatParam(name, text)) result += '; ' + part
  }
  return result
}

const sectionLength = 50

function formatParam(name: string, text: string): string[] {
  const plain = !/[^\x20-\x7e]/.test(text) && !text.includes('=?')
  if (plain && text.length < 75)
    return [
      name + '=' + (text === '' || /[\s'"\\;:/=(),<>@[\]?]|^-/.test(text) ? quote(text) : text),
    ]
  if (plain) {
    const parts: string[] = []
    for (let i = 0; i * sectionLength < text.length; i++) {
      const section = text.slice(i * sectionLength, (i + 1) * sectionLength)
      parts.push(
        `${name}*${i}=${/[\s"\\;:/=(),<>@[\]?]|^[-']|'$/.test(section) ? quote(section) : section}`,
      )
    }
    return parts
  }
  const parts: string[] = []
  let section = "utf-8''"
  for (const character of text) {
    const encoded = percentEncode(character)
    if (section.length + encoded.length >= sectionLength && section !== "utf-8''") {
      parts.push(section)
      section = ''
    }
    section += encoded
  }
  parts.push(section)
  return parts.map((section, i) => `${name}*${i}*=${section}`)
}

const quote = (text: string) => '"' + text.replace(/["\\]/g, '\\$&') + '"'

const hex = '0123456789ABCDEF'

function percentEncode(character: string): string {
  if (/^[A-Za-z0-9\-_.!~]$/.test(character)) return character
  let result = ''
  for (const byte of encodeUtf8Scratch(character)) result += '%' + hex[byte >> 4]! + hex[byte & 15]!
  return result
}
