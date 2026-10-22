import { NotFoundError, ResponseError } from './errors.js'

export type Fetch = (url: string, init: RequestInit) => Promise<Response>

const accept = 'application/rdap+json, application/json'

export type Json = { json: Record<string, unknown>; response: Response }

export async function request(
  url: string,
  fetch: Fetch,
  signal: AbortSignal | undefined,
): Promise<Json> {
  const response = await fetch(url, { headers: { accept }, ...(signal && { signal }) })
  if (response.status === 404) {
    await response.body?.cancel()
    throw new NotFoundError({ url })
  }
  if (!response.ok) {
    const json: unknown = await response.json().catch(() => undefined)
    signal?.throwIfAborted()
    throw new ResponseError({
      message: `${url} answered ${response.status} ${response.statusText}`.trimEnd(),
      response,
      url,
      body: json,
    })
  }
  let json: unknown
  try {
    json = await response.json()
  } catch (error) {
    signal?.throwIfAborted()
    throw new ResponseError({
      message: `${url} sent a body that isn't JSON`,
      response,
      url,
      cause: error,
    })
  }
  if (typeof json !== 'object' || json === null || Array.isArray(json))
    throw new ResponseError({
      message: `${url} sent JSON that isn't an object`,
      response,
      url,
      body: json,
    })
  return { json: json as Record<string, unknown>, response }
}
