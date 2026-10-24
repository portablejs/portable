import type { Charset, Encoder } from './Charset.js'
import { define } from './define.js'

function utf16(littleEndian: boolean): Encoder {
  const [low, high] = littleEndian ? [0, 1] : [1, 0]
  const unit = (value: number, bytes: Uint8Array, at: number) => {
    bytes[at + low] = value & 0xff
    bytes[at + high] = value >> 8
  }
  return {
    write(codePoint, out) {
      if (codePoint < 0x10000) {
        unit(codePoint, out.bytes, out.length)
        out.length += 2
      } else {
        unit(0xd800 + ((codePoint - 0x10000) >> 10), out.bytes, out.length)
        unit(0xdc00 + ((codePoint - 0x10000) & 0x3ff), out.bytes, out.length + 2)
        out.length += 4
      }
      return -1
    },
  }
}

/**
 * UTF-16 little-endian. The WHATWG labels `utf-16` and `unicode` map to this charset. Pass
 * `bom: true` to `encode` to write the byte order mark iconv-lite writes for `utf-16`.
 *
 * @example
 * ```ts
 * import * as Charset from '@portable/charset'
 * import { utf16le } from '@portable/charset/utf-16'
 *
 * Charset.encode('a€', utf16le) // Uint8Array [0x61, 0x00, 0xac, 0x20]
 * ```
 */
export const utf16le: Charset = /* @__PURE__ */ define({
  name: 'UTF-16LE',
  maxBytes: 2,
  bom: [0xff, 0xfe],
  encoder: () => utf16(true),
})

/**
 * UTF-16 big-endian.
 *
 * @example
 * ```ts
 * import * as Charset from '@portable/charset'
 * import { utf16be } from '@portable/charset/utf-16'
 *
 * Charset.encode('a€', utf16be) // Uint8Array [0x00, 0x61, 0x20, 0xac]
 * ```
 */
export const utf16be: Charset = /* @__PURE__ */ define({
  name: 'UTF-16BE',
  maxBytes: 2,
  bom: [0xfe, 0xff],
  encoder: () => utf16(false),
})
