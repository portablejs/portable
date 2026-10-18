import * as Base64 from '@portable/base64'
import { type Digest, type HashAlgorithm, hmac, rsaSha1, subtleDigest } from './crypto.js'
import { UnsupportedError } from './errors.js'
import {
  type Pair,
  joinPairs,
  parseForm,
  parseQuery,
  percentEncode,
  sortPairs,
} from './parameters.js'

export type { Digest, HashAlgorithm } from './crypto.js'
export { InvalidInputError, UnsupportedError } from './errors.js'

/** The `oauth_signature_method` values this package signs with. */
export type SignatureMethod = 'HMAC-SHA1' | 'HMAC-SHA256' | 'RSA-SHA1' | 'PLAINTEXT'

/** Token credentials, or the temporary credentials while exchanging them for an access token. */
export type Token = {
  /** Sent as `oauth_token`. */
  key: string
  /** Part of the HMAC and PLAINTEXT signing key. @default '' */
  secret?: string | undefined
}

/**
 * The client credentials and how to sign with them. HMAC and PLAINTEXT use the shared `secret`;
 * RSA-SHA1 uses the client's RSA private key, as a `CryptoKey` or a PEM string.
 */
export type Credentials =
  | {
      /** @default 'HMAC-SHA1' */
      signatureMethod?: 'HMAC-SHA1' | 'HMAC-SHA256' | 'PLAINTEXT' | undefined
      consumer: { key: string; secret: string }
    }
  | {
      signatureMethod: 'RSA-SHA1'
      /**
       * `privateKey` is an RSASSA-PKCS1-v1_5 `CryptoKey` with SHA-1, or a PEM `PRIVATE KEY`
       * (PKCS #8) or `RSA PRIVATE KEY` (PKCS #1) block. A PEM string is imported on every call.
       */
      consumer: { key: string; privateKey: CryptoKey | string }
    }

export declare namespace authorization {
  type Options = Credentials & {
    /** Hashes for HMAC and `oauth_body_hash`. @default `crypto.subtle.digest` */
    digest?: Digest | undefined
    /** Omit it to sign with client credentials only, as when requesting temporary credentials. */
    token?: Token | undefined
    /** Sent as the `realm` header parameter. It is not signed. */
    realm?: string | undefined
    /** Sent as `oauth_callback` when requesting temporary credentials. */
    callback?: string | undefined
    /** Sent as `oauth_verifier` when exchanging temporary credentials for an access token. */
    verifier?: string | undefined
    /**
     * Add `oauth_body_hash`, the base64 SHA-1 (SHA-256 for HMAC-SHA256) of the request body, as
     * the OAuth Request Body Hash extension and LTI require. Form bodies never get one, because
     * their parameters are signed already. @default false
     */
    bodyHash?: boolean | undefined
    /** `oauth_nonce`. Set it only in tests. @default 32 random hex digits */
    nonce?: string | undefined
    /** The time sent as `oauth_timestamp`, in whole seconds. Set it only in tests. @default new Date() */
    timestamp?: Date | undefined
  }
}

export declare namespace sign {
  type Options = authorization.Options & {
    /** Where the protocol parameters go: the `Authorization` header, or the URL query. @default 'header' */
    placement?: 'header' | 'query' | undefined
  }
}

const methods = new Set<string>(['HMAC-SHA1', 'HMAC-SHA256', 'RSA-SHA1', 'PLAINTEXT'])
const utf8 = new TextEncoder()
const hex = '0123456789abcdef'

/**
 * Signs a request and returns the value for its `Authorization` header. The request is not
 * changed: a form body is read from a clone. Use it with HTTP clients that don't take a `Request`.
 *
 * @example
 * ```ts
 * import * as OAuth1 from '@portable/oauth1'
 *
 * const header = await OAuth1.authorization(new Request('https://api.example.com/items'), {
 *   consumer: { key: 'dpf43f3p2l4k3l03', secret: 'kd94hf93k423kf44' },
 *   token: { key: 'nnch734d00sl2jdk', secret: 'pfkkdhi9sl3r4s00' },
 * })
 * // 'OAuth oauth_consumer_key="dpf43f3p2l4k3l03", oauth_nonce="…", oauth_signature="…", …'
 * ```
 *
 * @throws {UnsupportedError} For an unknown `signatureMethod`.
 * @throws {InvalidInputError} For an RSA private key that can't be used.
 */
export async function authorization(
  request: Request,
  options: authorization.Options,
): Promise<string> {
  const form = isForm(request)
  const body =
    (form || options.bodyHash) && request.body !== null
      ? new Uint8Array(await request.clone().arrayBuffer())
      : undefined
  return header(await protocolParameters(request, form, body, options), options.realm)
}

/**
 * Signs a request and returns a new `Request` that carries the signature in its `Authorization`
 * header, or in its URL with `placement: 'query'`. Like `new Request(request)`, it uses up the
 * body of the original request.
 *
 * @example
 * ```ts
 * import * as OAuth1 from '@portable/oauth1'
 *
 * const request = new Request('https://api.example.com/statuses', {
 *   method: 'POST',
 *   body: new URLSearchParams({ status: 'Hello' }),
 * })
 * const response = await fetch(
 *   await OAuth1.sign(request, {
 *     consumer: { key: 'dpf43f3p2l4k3l03', secret: 'kd94hf93k423kf44' },
 *     token: { key: 'nnch734d00sl2jdk', secret: 'pfkkdhi9sl3r4s00' },
 *   }),
 * )
 * ```
 *
 * @throws {UnsupportedError} For an unknown `signatureMethod`.
 * @throws {InvalidInputError} For an RSA private key that can't be used.
 */
export async function sign(request: Request, options: sign.Options): Promise<Request> {
  const { placement = 'header' } = options
  const form = isForm(request)
  const body =
    (form || options.bodyHash || placement === 'query') && request.body !== null
      ? new Uint8Array(await request.arrayBuffer())
      : undefined
  const pairs = await protocolParameters(request, form, body, options)

  if (placement === 'query') {
    const url = new URL(request.url)
    url.search = (url.search.length > 1 ? url.search + '&' : '?') + joinPairs(pairs)
    const init: RequestInit = {
      method: request.method,
      headers: request.headers,
      body: body ?? null,
      cache: request.cache,
      credentials: request.credentials,
      integrity: request.integrity,
      keepalive: request.keepalive,
      redirect: request.redirect,
      referrer: request.referrer,
      referrerPolicy: request.referrerPolicy,
      signal: request.signal,
    }
    if (request.mode !== 'navigate') init.mode = request.mode
    return new Request(url, init)
  }

  const headers = new Headers(request.headers)
  headers.set('authorization', header(pairs, options.realm))
  return new Request(request, body === undefined ? { headers } : { headers, body })
}

function isForm(request: Request): boolean {
  const type = request.headers.get('content-type')
  return type?.split(';')[0]!.trim().toLowerCase() === 'application/x-www-form-urlencoded'
}

async function protocolParameters(
  request: Request,
  form: boolean,
  body: Uint8Array<ArrayBuffer> | undefined,
  options: authorization.Options,
): Promise<Pair[]> {
  const signatureMethod = options.signatureMethod ?? 'HMAC-SHA1'
  if (!methods.has(signatureMethod))
    throw new UnsupportedError(`Unsupported signature method: ${String(signatureMethod)}`)
  const { callback, digest = subtleDigest, token, verifier } = options
  const hash: HashAlgorithm = signatureMethod === 'HMAC-SHA256' ? 'SHA-256' : 'SHA-1'

  const oauth: Pair[] = [
    ['oauth_consumer_key', percentEncode(options.consumer.key)],
    ['oauth_nonce', percentEncode(options.nonce ?? randomNonce())],
    ['oauth_signature_method', signatureMethod],
    ['oauth_timestamp', String(Math.floor((options.timestamp ?? new Date()).getTime() / 1000))],
    ['oauth_version', '1.0'],
  ]
  if (token !== undefined) oauth.push(['oauth_token', percentEncode(token.key)])
  if (callback !== undefined) oauth.push(['oauth_callback', percentEncode(callback)])
  if (verifier !== undefined) oauth.push(['oauth_verifier', percentEncode(verifier)])
  if (options.bodyHash && !form) {
    const bodyHash = await digest(hash, body ?? new Uint8Array())
    oauth.push(['oauth_body_hash', percentEncode(Base64.encode(bodyHash))])
  }

  const all = oauth.slice()
  const url = new URL(request.url)
  parseQuery(url.search, all)
  if (form && body !== undefined) parseForm(body, all)
  const base = utf8.encode(
    request.method.toUpperCase() +
      '&' +
      percentEncode(url.protocol + '//' + url.host + url.pathname) +
      '&' +
      percentEncode(joinPairs(sortPairs(all))),
  )

  let signature: string
  if (options.signatureMethod === 'RSA-SHA1') {
    signature = Base64.encode(await rsaSha1(options.consumer.privateKey, base))
  } else {
    const key = percentEncode(options.consumer.secret) + '&' + percentEncode(token?.secret ?? '')
    signature =
      signatureMethod === 'PLAINTEXT'
        ? key
        : Base64.encode(await hmac(digest, hash, utf8.encode(key), base))
  }
  oauth.push(['oauth_signature', percentEncode(signature)])
  return sortPairs(oauth)
}

function header(pairs: readonly Pair[], realm: string | undefined): string {
  let out = 'OAuth '
  if (realm !== undefined) out += `realm="${realm.replace(/["\\]/g, '\\$&')}", `
  for (let i = 0; i < pairs.length; i++)
    out += (i ? ', ' : '') + pairs[i]![0] + '="' + pairs[i]![1] + '"'
  return out
}

const random = new Uint8Array(4096)
let randomOffset = random.length

function randomNonce(): string {
  if (randomOffset === random.length) {
    crypto.getRandomValues(random)
    randomOffset = 0
  }
  let nonce = ''
  for (const byte of random.subarray(randomOffset, (randomOffset += 16)))
    nonce += hex[byte >> 4]! + hex[byte & 15]!
  return nonce
}
