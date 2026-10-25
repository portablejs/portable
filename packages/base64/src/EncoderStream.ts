import * as Bytes from '@portable/bytes';
import { assertAlphabet, assertLineLength, encode, toBase64, toBytes } from './encode.js';
import * as Streams from '@portable/streams';

export declare namespace EncoderStream {
  type Options = encode.Options & {
    /**
     * Errors the stream with `signal.reason` when the signal aborts, which makes `pipeThrough`
     * cancel the source.
     */
    signal?: AbortSignal | undefined;
  };
}

/**
 * A `TransformStream` that encodes bytes, or strings as UTF-8, to base64 text as ASCII bytes. The
 * output is the same as `encode` of all the input at once, however the input is chunked: lines
 * break at the same places, and no output chunk ends with a line ending.
 *
 * @example
 * ```ts
 * import * as Base64 from '@portable/base64';
 *
 * const response = await fetch('https://example.com/logo.png');
 * const body = response.body!.pipeThrough(new Base64.EncoderStream({ lineLength: 76 }));
 * ```
 */
export class EncoderStream extends TransformStream<Uint8Array | string, Uint8Array<ArrayBuffer>> {
  constructor(options: EncoderStream.Options = {}) {
    const {
      alphabet = 'base64',
      newline = '\r\n',
      lineLength = false,
      omitPadding = false,
    } = options;
    assertAlphabet(alphabet);
    assertLineLength(lineLength);
    const utf8 = new TextEncoder();
    let carry: Uint8Array = new Uint8Array(0);
    let highSurrogate = '';
    let column = 0;

    const readChunk = (chunk: Uint8Array | string): Uint8Array => {
      if (typeof chunk === 'string') {
        let text = highSurrogate + chunk;
        highSurrogate = '';
        const last = text.charCodeAt(text.length - 1);
        if (last >= 0xd800 && last <= 0xdbff) {
          highSurrogate = text.slice(-1);
          text = text.slice(0, -1);
        }
        return utf8.encode(text);
      }
      if (highSurrogate === '') {
        return toBytes(chunk);
      }
      const pending = utf8.encode(highSurrogate);
      highSurrogate = '';
      return Bytes.concat([pending, toBytes(chunk)]);
    };

    const encodeLines = (bytes: Uint8Array, final: boolean): string => {
      if (bytes.length === 0) {
        return '';
      }
      const pad = final && omitPadding;
      const text = toBase64(bytes, { alphabet, omitPadding: pad, lineLength, newline }, column);
      if (lineLength !== false) {
        const rest = bytes.length % 3;
        const length = ((bytes.length - rest) / 3) * 4 + (rest === 0 ? 0 : pad ? rest + 1 : 4);
        column = ((column + length - 1) % lineLength) + 1;
      }
      return text;
    };

    super(
      Streams.abortable(
        {
          transform(chunk, controller) {
            let bytes = readChunk(chunk);
            let text = '';
            if (carry.length > 0) {
              const fill = Math.min(3 - carry.length, bytes.length);
              const group = Bytes.concat([carry, bytes.subarray(0, fill)]);
              bytes = bytes.subarray(fill);
              if (group.length < 3) {
                carry = group;
                return;
              }
              text = encodeLines(group, false);
            }
            const whole = bytes.length - (bytes.length % 3);
            carry = bytes.slice(whole);
            text += encodeLines(bytes.subarray(0, whole), false);
            if (text !== '') {
              controller.enqueue(utf8.encode(text));
            }
          },
          flush(controller) {
            const text = encodeLines(Bytes.concat([carry, utf8.encode(highSurrogate)]), true);
            if (text !== '') {
              controller.enqueue(utf8.encode(text));
            }
          },
        },
        options,
      ),
    );
  }
}
