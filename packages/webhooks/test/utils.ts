import * as Webhooks from '@portable/webhooks'

export const encode = (text: string): Uint8Array => new TextEncoder().encode(text)

export function request(body: string | Uint8Array, headers: HeadersInit): Request {
  return new Request('https://example.com/webhooks', {
    method: 'POST',
    body: typeof body === 'string' ? body : new Uint8Array(body),
    headers,
  })
}

/** The `reason` of the `VerificationError` that `promise` rejects with. */
export async function reasonOf(promise: Promise<unknown>): Promise<Webhooks.Reason | 'resolved'> {
  try {
    await promise
    return 'resolved'
  } catch (error) {
    if (error instanceof Webhooks.VerificationError) return error.reason
    throw error
  }
}
