import * as Errors from '@portable/errors';
import type { Reply } from './reader.js';

/** A recipient the server refused, with its reply. */
export type Rejection = {
  recipient: string;
  /** The reply's three-digit code, such as `550`. */
  responseCode: number;
  /** The RFC 3463 enhanced status code, such as `'5.1.1'`, when the server sent one. */
  enhancedCode: string | undefined;
  /** The whole reply, with one line per reply line. */
  response: string;
};

export declare namespace CommandError {
  /**
   * - `ECONNECTION`: the socket failed or closed, or the server replied 421 and is closing.
   * - `EPROTOCOL`: a reply the protocol doesn't allow at that point, or a malformed reply.
   * - `ETLS`: STARTTLS was not offered, was refused, or the handshake failed.
   * - `EAUTH`: authentication failed or was refused before sending credentials.
   * - `EENVELOPE`: an invalid address, or the server refused the sender, every recipient or `DATA`.
   * - `EMESSAGE`: the message is too large, could not be read, or the server refused it after `DATA`.
   */
  type Code = 'ECONNECTION' | 'EPROTOCOL' | 'ETLS' | 'EAUTH' | 'EENVELOPE' | 'EMESSAGE';

  type Options = {
    code: Code;
    /** What failed. The server's reply, if there was one, is appended. */
    message: string;
    command?: string | undefined;
    reply?: Reply | undefined;
    rejected?: readonly Rejection[] | undefined;
    cause?: unknown;
  };
}

/**
 * Thrown when connecting, a command, or a message transfer fails.
 *
 * @example
 * ```ts
 * import * as Smtp from '@portable/smtp';
 *
 * try {
 *   await client.send({ from, to, message });
 * } catch (error) {
 *   if (error instanceof Smtp.CommandError && error.responseCode === 452) {
 *     retryLater();
 *   } else {
 *     throw error;
 *   }
 * }
 * ```
 */
export class CommandError extends Errors.BaseError {
  static override readonly kind: string = 'Smtp.CommandError';
  readonly code: CommandError.Code;
  /** The command that failed, such as `'RCPT TO'` or `'AUTH PLAIN'`, or `'CONNECT'` before the first one. Never includes credentials. */
  readonly command: string | undefined;
  /** The reply's three-digit code, when the server replied. */
  readonly responseCode: number | undefined;
  /** The RFC 3463 enhanced status code, such as `'5.7.8'`, when the server sent one. */
  readonly enhancedCode: string | undefined;
  /** The server's whole reply, with one line per reply line. */
  readonly response: string | undefined;
  /** Every refused recipient, when the send failed because none was accepted. */
  readonly rejected: readonly Rejection[] | undefined;

  constructor(options: CommandError.Options) {
    const { code, message, command, reply, rejected, cause } = options;
    super(reply ? `${message}: ${reply.response}` : message, cause === undefined ? {} : { cause });
    this.code = code;
    this.command = command;
    this.responseCode = reply?.code;
    this.enhancedCode = reply?.enhancedCode;
    this.response = reply?.response;
    this.rejected = rejected;
  }
}
