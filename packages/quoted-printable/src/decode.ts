import { assertUint8Array } from '@portable/bytes/internal';
import { createUtf8Encoder, encodeUtf8 } from './utf8.js';
import * as Streams from '@portable/streams';

/**
 * Decodes quoted-printable (RFC 2045 section 6.7) into bytes. A string is read as UTF-8.
 *
 * Whitespace at the end of a line and soft line breaks (`=` followed by CRLF, LF or the end of the
 * input) are removed, and `=XX` escapes with upper- or lowercase hex digits are decoded. Anything
 * else, including a malformed escape, is copied as is. Decoding never throws.
 *
 * @example
 * ```ts
 * import * as QuotedPrintable from '@portable/quoted-printable';
 *
 * new TextDecoder().decode(QuotedPrintable.decode('tere j=C3=B5geva')); // 'tere jõgeva'
 * ```
 */
export function decode(input: string | Uint8Array): Uint8Array<ArrayBuffer> {
  const bytes = typeof input === 'string' ? encodeUtf8(input) : assertUint8Array(input);
  return createDecoder().write(bytes, true);
}

export declare namespace DecoderStream {
  type Options = {
    /** Errors the stream with `signal.reason` when aborted, which cancels the source it is piped from. */
    signal?: AbortSignal | undefined;
  };
}

/**
 * A `TransformStream` that decodes quoted-printable text or bytes. Its output is the same as
 * `decode()` of the whole input, however the input is split into chunks.
 *
 * @example
 * ```ts
 * import * as QuotedPrintable from '@portable/quoted-printable';
 *
 * const text = body.pipeThrough(new QuotedPrintable.DecoderStream()).pipeThrough(new TextDecoderStream());
 * ```
 */
export class DecoderStream extends TransformStream<string | Uint8Array, Uint8Array<ArrayBuffer>> {
  constructor(options: DecoderStream.Options = {}) {
    const decoder = createDecoder();
    const utf8 = createUtf8Encoder();
    super(
      Streams.abortable(
        {
          transform(chunk, controller) {
            const output = decoder.write(utf8.write(chunk), false);
            if (output.length > 0) {
              controller.enqueue(output);
            }
          },
          flush(controller) {
            const output = decoder.write(utf8.flush(), true);
            if (output.length > 0) {
              controller.enqueue(output);
            }
          },
        },
        options,
      ),
    );
  }
}

const EQUALS = 0x3d;
const SPACE = 0x20;
const TAB = 0x09;
const CR = 0x0d;
const LF = 0x0a;

const hexValue = /* @__PURE__ */ (() => {
  const table = new Int8Array(256).fill(-1);
  for (let i = 0; i < 10; i++) {
    table[0x30 + i] = i;
  }
  for (let i = 0; i < 6; i++) {
    table[0x41 + i] = table[0x61 + i] = 10 + i;
  }
  return table;
})();

type Decoder = { write: (bytes: Uint8Array, final: boolean) => Uint8Array<ArrayBuffer> };

// The decoder makes three passes in one. Each holds back the bytes whose meaning depends on what
// follows: whitespace runs (dropped before a line break or at the end), "=" and "=\r" (a soft line
// break if LF or the end follows), and "=" with up to one hex digit (an escape if hex digits
// follow).
function createDecoder(): Decoder {
  let whitespace = new Uint8Array(64);
  let whitespaceLength = 0;
  // Whitespace held from earlier writes, which the output of this write has no room for yet.
  let carriedWhitespace = 0;
  // 0: nothing held, 1: "=" held, 2: "=\r" held
  let softBreak = 0;
  // 0: nothing held, 1: "=" held, 2: "=" and the hex digit in `escapeDigit` held
  let escape = 0;
  let escapeDigit = 0;

  let out = new Uint8Array(0);
  let o = 0;

  const decodeEscapes = (b: number): void => {
    if (escape === 1) {
      if (hexValue[b]! >= 0) {
        escape = 2;
        escapeDigit = b;
        return;
      }
      out[o++] = EQUALS;
      escape = 0;
    } else if (escape === 2) {
      const lo = hexValue[b]!;
      if (lo >= 0) {
        out[o++] = (hexValue[escapeDigit]! << 4) | lo;
        escape = 0;
        return;
      }
      out[o++] = EQUALS;
      out[o++] = escapeDigit;
      escape = 0;
    }
    if (b === EQUALS) {
      escape = 1;
    } else {
      out[o++] = b;
    }
  };

  const removeSoftBreaks = (b: number): void => {
    if (softBreak === 1) {
      softBreak = 0;
      if (b === LF) {
        return;
      }
      if (b === CR) {
        softBreak = 2;
        return;
      }
      decodeEscapes(EQUALS);
    } else if (softBreak === 2) {
      softBreak = 0;
      if (b === LF) {
        return;
      }
      decodeEscapes(EQUALS);
      decodeEscapes(CR);
    }
    if (b === EQUALS) {
      softBreak = 1;
    } else {
      decodeEscapes(b);
    }
  };

  const removeTrailingWhitespace = (b: number): void => {
    if (b === SPACE || b === TAB) {
      if (whitespaceLength === whitespace.length) {
        const grown = new Uint8Array(whitespace.length * 2);
        grown.set(whitespace);
        whitespace = grown;
      }
      whitespace[whitespaceLength++] = b;
      return;
    }
    if (whitespaceLength > 0) {
      if (b !== CR && b !== LF) {
        if (carriedWhitespace > 0) {
          const grown = new Uint8Array(out.length + carriedWhitespace);
          grown.set(out.subarray(0, o));
          out = grown;
        }
        for (let i = 0; i < whitespaceLength; i++) {
          removeSoftBreaks(whitespace[i]!);
        }
      }
      whitespaceLength = 0;
      carriedWhitespace = 0;
    }
    removeSoftBreaks(b);
  };

  return {
    write(bytes, final) {
      const length = bytes.length;
      out = new Uint8Array(length + 4);
      o = 0;
      carriedWhitespace = whitespaceLength;
      for (let i = 0; i < length; i++) {
        const b = bytes[i]!;
        if (whitespaceLength === 0 && softBreak === 0 && escape === 0) {
          if (b !== EQUALS && b !== SPACE && b !== TAB) {
            out[o++] = b;
            continue;
          }
          if (b === EQUALS && i + 2 < length) {
            const b1 = bytes[i + 1]!;
            const b2 = bytes[i + 2]!;
            const hi = hexValue[b1]!;
            const lo = hexValue[b2]!;
            if (hi >= 0 && lo >= 0) {
              out[o++] = (hi << 4) | lo;
              i += 2;
              continue;
            }
            if (b1 === LF) {
              i += 1;
              continue;
            }
            if (b1 === CR && b2 === LF) {
              i += 2;
              continue;
            }
          }
        }
        removeTrailingWhitespace(b);
      }
      if (final) {
        whitespaceLength = 0;
        if (softBreak === 2) {
          decodeEscapes(EQUALS);
          decodeEscapes(CR);
        }
        softBreak = 0;
        if (escape >= 1) {
          out[o++] = EQUALS;
        }
        if (escape === 2) {
          out[o++] = escapeDigit;
        }
        escape = 0;
      }
      return o === out.length ? out : out.subarray(0, o);
    },
  };
}
