import { concat } from '../concat.js';
import { assertUint8Array } from './uint8Array.js';

const textEncoder = new TextEncoder();

/**
 * Converts a stream's string and `Uint8Array` chunks to UTF-8 bytes. If a string ends with a high
 * surrogate, the encoder holds it back until the next chunk, so a surrogate pair split across two
 * string chunks is encoded as one character. A lone surrogate is encoded as U+FFFD, as
 * `TextEncoder` does. A byte chunk is checked with `assertUint8Array` and returned as it is, after
 * the U+FFFD for a held surrogate if there is one.
 */
export function createUtf8Encoder(): {
  write: (chunk: Uint8Array | string) => Uint8Array;
  flush: () => Uint8Array;
} {
  let highSurrogate = '';
  return {
    write(chunk) {
      if (typeof chunk !== 'string') {
        assertUint8Array(chunk);
        if (highSurrogate === '') {
          return chunk;
        }
        const pending = textEncoder.encode(highSurrogate);
        highSurrogate = '';
        return concat([pending, chunk]);
      }
      let text = highSurrogate + chunk;
      highSurrogate = '';
      const last = text.charCodeAt(text.length - 1);
      if (last >= 0xd800 && last <= 0xdbff) {
        highSurrogate = text.slice(-1);
        text = text.slice(0, -1);
      }
      return textEncoder.encode(text);
    },
    flush() {
      const rest = textEncoder.encode(highSurrogate);
      highSurrogate = '';
      return rest;
    },
  };
}
