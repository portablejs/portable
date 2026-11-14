import * as Bytes from '@portable/bytes';
import { TransportError } from './errors.js';

/** The media type of a streamed response whose messages are enveloped bytes. */
export const envelope = 'application/x-rpc-envelope';

const headerSize = 5;

/** Writes `data` in Connect's envelope: a flags byte of 0, a 32-bit big-endian length, then the bytes. */
export function wrap(data: Uint8Array): Uint8Array<ArrayBuffer> {
  const framed = new Uint8Array(headerSize + data.length);
  new DataView(framed.buffer).setUint32(1, data.length);
  framed.set(data, headerSize);
  return framed;
}

/** Splits a byte stream of envelopes into the bytes of each message. */
export function unwrapStream(): TransformStream<Uint8Array, string | Uint8Array> {
  let buffer: Uint8Array = new Uint8Array(0);
  return new TransformStream<Uint8Array, string | Uint8Array>({
    transform(chunk, controller) {
      buffer = buffer.length === 0 ? chunk : Bytes.concat([buffer, chunk]);
      let offset = 0;
      while (buffer.length - offset >= headerSize) {
        const view = new DataView(buffer.buffer, buffer.byteOffset + offset, headerSize);
        const end = offset + headerSize + view.getUint32(1);
        if (buffer.length < end) {
          break;
        }
        controller.enqueue(buffer.subarray(offset + headerSize, end));
        offset = end;
      }
      buffer = buffer.subarray(offset);
    },
    flush() {
      if (buffer.length > 0) {
        throw new TransportError('The response ended inside a message.');
      }
    },
  });
}
