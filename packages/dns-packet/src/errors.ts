import * as Errors from '@portable/errors';
/**
 * Thrown by `decode` when the input ends before the message does, or a length field points past
 * the end. With `framing: 'tcp'`, this also means the whole message hasn't arrived yet.
 *
 * @example
 * ```ts
 * import * as DnsPacket from '@portable/dns-packet';
 *
 * try {
 *   DnsPacket.decode(new Uint8Array(4));
 * } catch (error) {
 *   if (error instanceof DnsPacket.TruncatedError) {
 *     console.log('incomplete message');
 *   }
 * }
 * ```
 */
export class TruncatedError extends Errors.TruncatedError {
  static override readonly kind: string = 'DnsPacket.TruncatedError';
}

/**
 * Thrown for malformed input. When decoding: an unknown label type, a name over 255 bytes, a
 * compression pointer that doesn't point backwards (so loops are rejected), or record data that
 * doesn't match its type. When encoding: an empty label or one over 63 bytes, an invalid IP
 * address, a TXT string over 255 bytes, an OPT record whose name isn't the root, and so on.
 *
 * @example
 * ```ts
 * import * as DnsPacket from '@portable/dns-packet';
 *
 * try {
 *   DnsPacket.encode({ answers: [{ type: 'A', name: 'example.com', data: '300.0.0.1' }] });
 * } catch (error) {
 *   if (error instanceof DnsPacket.InvalidInputError) {
 *     console.log(error.message);
 *   }
 * }
 * ```
 */
export class InvalidInputError extends Errors.InvalidInputError {
  static override readonly kind: string = 'DnsPacket.InvalidInputError';
}

/**
 * Thrown by `encode` for an EDNS option that has no `data` and no built-in encoder. Only
 * CLIENT_SUBNET, TCP_KEEPALIVE, PADDING, and KEY_TAG are built in.
 *
 * @example
 * ```ts
 * import * as DnsPacket from '@portable/dns-packet';
 *
 * try {
 *   // @ts-expect-error The types require `data`, because NSID has no built-in encoder.
 *   DnsPacket.encode({ additionals: [{ type: 'OPT', name: '.', options: [{ code: 'NSID' }] }] });
 * } catch (error) {
 *   if (error instanceof DnsPacket.UnsupportedError) {
 *     console.log('pass the option as data');
 *   }
 * }
 * ```
 */
export class UnsupportedError extends Errors.UnsupportedError {
  static override readonly kind: string = 'DnsPacket.UnsupportedError';
}
