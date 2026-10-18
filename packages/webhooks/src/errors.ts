/**
 * Why a webhook failed verification.
 *
 * - `'missing-header'`: a header the scheme requires is absent or empty.
 * - `'malformed-header'`: a header can't be parsed, such as a timestamp that isn't an integer.
 * - `'signature'`: no signature matches the body and any of the secrets.
 * - `'timestamp'`: the signature matches, but the timestamp is further from now than `tolerance`.
 */
export type Reason = 'missing-header' | 'malformed-header' | 'signature' | 'timestamp'

/**
 * Thrown when a webhook fails verification. Respond with a 4xx status. A scheme's `parse` throws
 * it for a missing or malformed header.
 *
 * @example
 * ```ts
 * import * as Webhooks from '@portable/webhooks'
 *
 * try {
 *   await Webhooks.verify(request, { scheme: Webhooks.github, secret })
 * } catch (error) {
 *   if (error instanceof Webhooks.VerificationError) return new Response(error.reason, { status: 400 })
 *   throw error
 * }
 * ```
 */
export class VerificationError extends Error {
  override name = 'Webhooks.VerificationError'
  readonly reason: Reason

  constructor(reason: Reason, message: string) {
    super(message)
    this.reason = reason
  }
}
