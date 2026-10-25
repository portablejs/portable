import * as Errors from '@portable/errors';

/**
 * Thrown when the other side closes the connection, or when the connection closes and `connect`
 * stops reconnecting.
 *
 * @example
 * ```ts
 * import * as WebSockets from '@portable/websockets';
 *
 * const { readable } = WebSockets.fromSocket(new WebSocket('wss://example.com/feed'));
 * const reader = readable.getReader();
 * try {
 *   for (let r = await reader.read(); !r.done; r = await reader.read()) {
 *     console.log(r.value);
 *   }
 * } catch (error) {
 *   if (error instanceof WebSockets.CloseError) {
 *     console.log(error.code, error.reason);
 *   }
 * }
 * ```
 */
export class CloseError extends Errors.BaseError {
  static override readonly kind: string = 'WebSockets.CloseError';
  /** The close code, such as 1006 for a dropped connection. */
  readonly code: number;
  /** The close reason the other side sent, or `''`. */
  readonly reason: string;
  constructor(options: { code: number; reason: string }) {
    const { code, reason } = options;
    super(`The WebSocket closed with code ${code}${reason ? ` (${reason})` : ''}.`);
    this.code = code;
    this.reason = reason;
  }
}

/**
 * Thrown when received messages waiting to be read exceed `maxBuffered`.
 *
 * @example
 * ```ts
 * import * as WebSockets from '@portable/websockets';
 *
 * const { readable } = WebSockets.connect('wss://example.com/feed', { maxBuffered: 1_000_000 });
 * const reader = readable.getReader();
 * try {
 *   for (let r = await reader.read(); !r.done; r = await reader.read()) {
 *     await handle(r.value);
 *   }
 * } catch (error) {
 *   if (error instanceof WebSockets.MaxBufferedError) {
 *     console.log(`fell ${error.maxBuffered} behind`);
 *   }
 * }
 * ```
 */
export class MaxBufferedError extends Errors.BaseError {
  static override readonly kind: string = 'WebSockets.MaxBufferedError';
  /** The limit that was exceeded. */
  readonly maxBuffered: number;
  constructor(options: { maxBuffered: number }) {
    const { maxBuffered } = options;
    super(`Received messages exceeded maxBuffered of ${maxBuffered}.`);
    this.maxBuffered = maxBuffered;
  }
}
