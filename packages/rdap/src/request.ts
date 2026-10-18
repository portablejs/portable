import { NotFoundError, ResponseError } from './errors.js'

export type Fetch = (url: string, init: RequestInit) => Promise<Response>

const accept = 'application/rdap+json, application/json'

/** Fetches `url` and returns its JSON object, or throws `NotFoundError` or `ResponseError`. */
export async function request(
  url: string,
  fetch: Fetch,
  signal: AbortSignal | undefined,
): Promise<Record<string, unknown>> {
  const response = await fetch(url, { headers: { accept }, ...(signal && { signal }) })
  if (response.status === 404) {
    await response.body?.cancel()
    throw new NotFoundError(url)
  }
  if (!response.ok) {
    const json: unknown = await response.json().catch(() => undefined)
    signal?.throwIfAborted()
    throw new ResponseError(
      `${url} answered ${response.status} ${response.statusText}`.trimEnd(),
      response.status,
      url,
      json,
    )
  }
  let json: unknown
  try {
    json = await response.json()
  } catch (error) {
    signal?.throwIfAborted()
    throw new ResponseError(`${url} sent a body that isn't JSON`, response.status, url, undefined, {
      cause: error,
    })
  }
  if (typeof json !== 'object' || json === null || Array.isArray(json))
    throw new ResponseError(`${url} sent JSON that isn't an object`, response.status, url, json)
  return json as Record<string, unknown>
}
