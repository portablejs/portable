import { assertUint8Array } from '@portable/bytes/internal';
import type { Charset } from './Charset.js';
import { createState, run, type Unmappable } from './internal/run.js';

export declare namespace encode {
  type Options = {
    /**
     * Write a byte order mark first. Applies only to UTF-8, UTF-16LE, and UTF-16BE, because other
     * charsets have none.
     * @default false
     */
    bom?: boolean | undefined;
    /**
     * What to write for a character the charset can't represent:
     * `'replace'` writes `?`, `'html'` writes an HTML numeric character reference such as `&#26085;`,
     * `'error'` throws `UnsupportedError`, and a function returns the text to write instead.
     * `encode` encodes that text in the same charset and throws `UnsupportedError` if the text
     * holds a character the charset can't encode.
     * @default 'replace'
     */
    unmappable?: Unmappable | undefined;
  };
}

/**
 * Encodes text into bytes in the given charset. Bytes are read as UTF-8 text, and a UTF-8 byte
 * order mark at their start is dropped.
 *
 * Lone surrogates are encoded as U+FFFD, as `TextEncoder` does.
 *
 * @example
 * ```ts
 * import * as Charset from '@portable/charset';
 * import { windows1251 } from '@portable/charset/single-byte';
 *
 * Charset.encode('Привет', windows1251); // Uint8Array [0xcf, 0xf0, 0xe8, 0xe2, 0xe5, 0xf2]
 * Charset.encode('日本', windows1251, { unmappable: 'html' }); // the bytes of '&#26085;&#26412;'
 * ```
 */
export function encode(
  text: string | Uint8Array,
  charset: Charset,
  options: encode.Options = {},
): Uint8Array<ArrayBuffer> {
  const input = typeof text === 'string' ? text : new TextDecoder().decode(assertUint8Array(text));
  return run(createState(charset, options), input, true);
}
