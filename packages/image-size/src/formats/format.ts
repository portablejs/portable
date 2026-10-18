import type { Size } from '../parse.js'

/**
 * A format parser. With `final` false the input may be a prefix of the file, and a parser that
 * reads past its end throws `NeedMore` instead of returning an answer that more bytes could change.
 */
export type Format = {
  validate(input: Uint8Array, final: boolean): boolean
  calculate(input: Uint8Array, final: boolean): Size
}
