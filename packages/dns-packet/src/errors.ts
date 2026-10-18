/**
 * Thrown by `decode` when the input ends before the packet does, or a length field points past the end.
 *
 * @example
 * ```ts
 * import { decode, TruncatedError } from '@portable/dns-packet'
 *
 * try {
 *   decode(new Uint8Array(4))
 * } catch (error) {
 *   if (error instanceof TruncatedError) console.log('incomplete packet')
 * }
 * ```
 */
export class TruncatedError extends Error {
  override name = 'DnsPacket.TruncatedError'
}

/**
 * Thrown when a domain name can't be encoded or decoded: an empty label, a label over 63 bytes,
 * a name over 255 bytes, or an unknown label type.
 *
 * @example
 * ```ts
 * import { encode, InvalidNameError } from '@portable/dns-packet'
 *
 * try {
 *   encode({ questions: [{ type: 'A', name: 'a..b' }] })
 * } catch (error) {
 *   if (error instanceof InvalidNameError) console.log(error.message)
 * }
 * ```
 */
export class InvalidNameError extends Error {
  override name = 'DnsPacket.InvalidNameError'
}

/**
 * Thrown by `decode` when a compression pointer doesn't point strictly before the name that
 * contains it. Every pointer must move backwards, so a loop is reported with this error.
 *
 * @example
 * ```ts
 * import { decode, InvalidPointerError } from '@portable/dns-packet'
 *
 * try {
 *   decode(bytes)
 * } catch (error) {
 *   if (error instanceof InvalidPointerError) console.log('compression loop')
 * }
 * ```
 */
export class InvalidPointerError extends Error {
  override name = 'DnsPacket.InvalidPointerError'
}

/**
 * Thrown when record data doesn't match its type: an invalid IP address, a TXT string over
 * 255 bytes, a DNSKEY protocol other than 3, an OPT record whose name isn't the root, and so on.
 *
 * @example
 * ```ts
 * import { encode, InvalidRecordError } from '@portable/dns-packet'
 *
 * try {
 *   encode({ answers: [{ type: 'A', name: 'example.com', data: '300.0.0.1' }] })
 * } catch (error) {
 *   if (error instanceof InvalidRecordError) console.log(error.message)
 * }
 * ```
 */
export class InvalidRecordError extends Error {
  override name = 'DnsPacket.InvalidRecordError'
}
