import { InvalidInputError } from './errors.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { ignoreBOM: true });
const fatalDecoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

/**
 * Returns the number of bytes in the UTF-8 encoding of `text`, without encoding it. A lone
 * surrogate counts as 3 bytes, because `TextEncoder` replaces it with U+FFFD.
 *
 * @example
 * ```ts
 * import * as Binary from '@portable/binary';
 *
 * Binary.utf8Length('héllo'); // 6
 * ```
 */
export function utf8Length(text: string): number {
  if (typeof text !== 'string') {
    throw new TypeError(`Expected a string, got ${typeof text}.`);
  }
  let length = text.length;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c < 0x80) {
      continue;
    }
    if (c < 0x800) {
      length += 1;
    } else if (c >= 0xd800 && c <= 0xdbff && (text.charCodeAt(i + 1) & 0xfc00) === 0xdc00) {
      length += 2;
      i++;
    } else {
      length += 2;
    }
  }
  return length;
}

/** Writes `text` as UTF-8 at `bytes[at]`, which must have room, and returns the position after it. */
export function writeUtf8(bytes: Uint8Array, at: number, text: string): number {
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c >= 0x80) {
      return at + encoder.encodeInto(text.slice(i), bytes.subarray(at)).written;
    }
    bytes[at++] = c;
  }
  return at;
}

/** Decodes `bytes[start..end)` as UTF-8. If `fatal` is set, malformed UTF-8 throws. */
export function readUtf8(bytes: Uint8Array, start: number, end: number, fatal: boolean): string {
  // Short ASCII strings, such as most protocol identifiers, decode faster without TextDecoder.
  if (end - start <= 32) {
    let text = '';
    let i = start;
    for (; i < end; i++) {
      const c = bytes[i]!;
      if (c >= 0x80) {
        break;
      }
      text += String.fromCharCode(c);
    }
    if (i === end) {
      return text;
    }
  }
  const view = bytes.subarray(start, end);
  if (!fatal) {
    return decoder.decode(view);
  }
  try {
    return fatalDecoder.decode(view);
  } catch (error) {
    throw new InvalidInputError('String is not valid UTF-8.', { offset: start, cause: error });
  }
}
