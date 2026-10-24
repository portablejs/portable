import type { CharsetName } from './tables/labels.js'

/** The WHATWG Encoding Standard name of a charset this package encodes, such as `'Shift_JIS'`. */
export type Name = Exclude<CharsetName, 'replacement'>

/**
 * A charset that `encode` and `EncoderStream` can write. Import one from the subpath for its
 * family, such as `shiftJis` from `@portable/charset/shift_jis`, or get one by label with `load`.
 *
 * @example
 * ```ts
 * import * as Charset from '@portable/charset'
 * import { shiftJis } from '@portable/charset/shift_jis'
 *
 * shiftJis.name // 'Shift_JIS'
 * Charset.encode('日本', shiftJis) // Uint8Array [0x93, 0xfa, 0x96, 0x7b]
 * ```
 */
export type Charset = {
  /** The WHATWG Encoding Standard name. */
  readonly name: Name
  /**
   * Encodes text with the default options, as `Charset.encode(text, charset)` does. With it, a
   * charset can be passed where `@portable/mime-headers` and `@portable/mail` take a
   * `CharsetEncoder`.
   */
  readonly encode: (text: string) => Uint8Array<ArrayBuffer>
  readonly [definition]: true
}

declare const definition: unique symbol

/** The fields of a `Charset` that `encode` reads. Only `name` is in the public type. */
export type Definition = {
  readonly name: Name
  /** The most bytes that encoding one UTF-16 code unit produces. */
  readonly maxBytes: number
  /** Byte order mark written when `bom` is set. */
  readonly bom?: readonly number[] | undefined
  /** Creates the state for one `encode` call or one stream. */
  readonly encoder: () => Encoder
}

export type Output = { bytes: Uint8Array<ArrayBuffer>; length: number }

export type Encoder = {
  /**
   * Maps each UTF-16 code unit to its bytes: `0x100 | byte` for one byte, `leading << 8 | trailing`
   * for two, or 0 to call `write` instead.
   */
  readonly table?: Uint16Array | undefined
  /** Encodes a whole string, for charsets with a native encoder. */
  readonly string?: ((text: string) => Uint8Array<ArrayBuffer>) | undefined
  /** Writes the bytes for a scalar value and returns -1, or returns the code point to report as unmappable. */
  readonly write: (codePoint: number, out: Output) => number
  /** Writes what the charset needs at the end of the text, such as an escape back to ASCII. */
  readonly flush?: ((out: Output) => void) | undefined
}
