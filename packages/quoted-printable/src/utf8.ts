import * as Bytes from '@portable/bytes';
import { assertUint8Array } from '@portable/bytes/internal';
const textEncoder = new TextEncoder();

export const encodeUtf8 = (text: string): Uint8Array => textEncoder.encode(text);

/** Encodes string chunks as UTF-8, keeping a surrogate pair together when a chunk boundary splits it. */
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
        const pending = encodeUtf8(highSurrogate);
        highSurrogate = '';
        return Bytes.concat([pending, chunk]);
      }
      let text = highSurrogate + chunk;
      highSurrogate = '';
      const last = text.charCodeAt(text.length - 1);
      if (last >= 0xd800 && last <= 0xdbff) {
        highSurrogate = text.slice(-1);
        text = text.slice(0, -1);
      }
      return encodeUtf8(text);
    },
    flush() {
      const rest = encodeUtf8(highSurrogate);
      highSurrogate = '';
      return rest;
    },
  };
}
