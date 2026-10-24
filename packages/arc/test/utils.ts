import * as Arc from '@portable/arc'
import * as Streams from '@portable/streams'

// `?url&inline` turns each fixture into a data URL, which `fetch` reads in Node and in browsers.
const files = import.meta.glob<string>('./fixtures/*', { query: '?url&inline', import: 'default' })

export async function fixture(name: string): Promise<Uint8Array<ArrayBuffer>> {
  const load = files[`./fixtures/${name}`]
  if (!load) throw new Error(`No fixture ${name}`)
  return new Uint8Array(await (await fetch(await load())).arrayBuffer())
}

export const fixtureText = async (name: string): Promise<string> =>
  new TextDecoder().decode(await fixture(name))

export const encode = (text: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(text)

/** Text with one character per byte. */
export const binary = (bytes: Uint8Array): string => {
  let text = ''
  for (const byte of bytes) text += String.fromCharCode(byte)
  return text
}

export const fromBinary = (text: string): Uint8Array<ArrayBuffer> =>
  Uint8Array.from(text, (char) => char.charCodeAt(0))

export const base64 = (bytes: Uint8Array): string => btoa(binary(bytes))

const sha256 = async (data: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> =>
  new Uint8Array(await crypto.subtle.digest('SHA-256', data))

export function randomChunks(bytes: Uint8Array, seed: number, max = 64): Uint8Array[] {
  const random = prng(seed)
  const chunks = new Array<Uint8Array>()
  for (let i = 0; i < bytes.length;) {
    const size = 1 + Math.floor(random() * max)
    chunks.push(bytes.subarray(i, i + size))
    i += size
  }
  return chunks
}

export const stream = (chunks: readonly Uint8Array[]): ReadableStream<Uint8Array> =>
  Streams.fromIterable(chunks)

/** Park-Miller, so that a failure is reproducible. */
export function prng(seed: number): () => number {
  let state = seed
  return () => {
    state = (state * 48271) % 2147483647
    return state / 2147483647
  }
}

export function dnsError(code: string, name: string): Error {
  return Object.assign(new Error(`queryTxt ${code} ${name}`), { code })
}

/**
 * A resolver for `{ name: record }`, where a record is a key name from `keyPair` or literal TXT
 * text. Names that aren't listed give ENOTFOUND, and each query is added to `log`.
 */
export function resolverFrom(
  records: Record<string, string>,
  log: string[] = [],
): Arc.Resolver & { log: string[] } {
  return {
    log,
    async resolveTxt(name) {
      log.push(name)
      const value = Object.hasOwn(records, name.toLowerCase())
        ? records[name.toLowerCase()]
        : undefined
      if (value === undefined) throw dnsError('ENOTFOUND', name)
      return [[pairs.has(value) ? (await keyPair(value)).record : value]]
    },
  }
}

type KeyPair = { privateKey: CryptoKey; pem: string; record: string; type: 'rsa' | 'ed25519' }

const pairs = new Map<string, Promise<KeyPair>>()
const fixtureKeys: Record<string, 'rsa' | 'small' | 'ed25519'> = {
  k1: 'rsa',
  small: 'small',
  ed1: 'ed25519',
}

const pemBody = (pem: string): string => pem.replace(/-----[^-]+-----|\s/g, '')

/**
 * A key by name: `k1` (2048-bit RSA), `small` (512-bit RSA) and `ed1` (Ed25519) are mailauth's
 * key fixtures, and any other name is a new 2048-bit RSA key.
 */
export function keyPair(name: string): Promise<KeyPair> {
  let pair = pairs.get(name)
  if (!pair) {
    pair = createPair(name)
    pairs.set(name, pair)
  }
  return pair
}

for (const name of ['k1', 'k2', 'att', 'victim', 'small', 'ed1']) pairs.set(name, createPair(name))

async function createPair(name: string): Promise<KeyPair> {
  const file = fixtureKeys[name]
  if (file) {
    const pem = await fixtureText(`private-${file}.pem.txt`)
    const spki = fromBinary(atob(pemBody(await fixtureText(`public-${file}.pem.txt`))))
    const type = file === 'ed25519' ? 'ed25519' : 'rsa'
    const algorithm =
      type === 'rsa' ? { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' } : { name: 'Ed25519' }
    const privateKey = await crypto.subtle.importKey(
      'pkcs8',
      fromBinary(atob(pemBody(pem))),
      algorithm,
      true,
      ['sign'],
    )
    const p = type === 'rsa' ? spki : spki.subarray(-32)
    return { privateKey, pem, type, record: `v=DKIM1; k=${type}; p=${base64(p)}` }
  }
  const generated = (await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  )) as CryptoKeyPair
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', generated.privateKey))
  const spki = new Uint8Array(await crypto.subtle.exportKey('spki', generated.publicKey))
  const pem = `-----BEGIN PRIVATE KEY-----\n${base64(pkcs8)}\n-----END PRIVATE KEY-----\n`
  return {
    privateKey: generated.privateKey,
    pem,
    type: 'rsa',
    record: `v=DKIM1; k=rsa; p=${base64(spki)}`,
  }
}

/** The DNS record of a key, with `extra` in front of `p=`. */
export async function dnsTxt(name: string, extra = ''): Promise<string> {
  return (await keyPair(name)).record.replace('p=', `${extra}p=`)
}

// An ARC sealer written from RFC 8617 sections 4 and 5.1, RFC 6376 sections 3.4 and 3.7 and RFC
// 8463 alone, ported from mailauth's test/helpers/arc-reference.js. It shares no code with the
// package, and it builds each field from a literal tag list, so a test can use any tag layout,
// including invalid ones. Messages and fields are binary text with CRLF line ends.

export function relaxedHeader(field: string): string {
  const colon = field.indexOf(':')
  const name = field
    .slice(0, colon)
    .replace(/[ \t]+$/, '')
    .toLowerCase()
  const value = field
    .slice(colon + 1)
    .replace(/\r\n/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/^ /, '')
    .replace(/ $/, '')
  return `${name}:${value}`
}

export function relaxedBody(body: string): string {
  const lines = body.split('\r\n').map((line) => line.replace(/[ \t]+/g, ' ').replace(/ $/, ''))
  while (lines.length && lines.at(-1) === '') lines.pop()
  return lines.length ? lines.join('\r\n') + '\r\n' : ''
}

export function simpleBody(body: string): string {
  let result = body
  while (result.endsWith('\r\n\r\n')) result = result.slice(0, -2)
  if (result === '') return '\r\n'
  return result.endsWith('\r\n') ? result : result + '\r\n'
}

function splitReference(message: string): { fields: string[]; body: string } {
  const end = message.indexOf('\r\n\r\n')
  const fields: string[] = []
  for (const line of message.slice(0, end).split('\r\n')) {
    if (/^[ \t]/.test(line) && fields.length) fields[fields.length - 1] += '\r\n' + line
    else fields.push(line)
  }
  return { fields, body: message.slice(end + 4) }
}

const fieldName = (field: string): string => field.slice(0, field.indexOf(':')).trim().toLowerCase()

export async function signReference(
  algorithm: string,
  data: string,
  keyName: string,
  prehash = true,
): Promise<string> {
  const { privateKey } = await keyPair(keyName)
  const bytes = fromBinary(data)
  const signed =
    algorithm.startsWith('ed25519') && prehash ? await sha256(bytes) : (bytes as Uint8Array)
  return base64(
    new Uint8Array(
      await crypto.subtle.sign(privateKey.algorithm, privateKey, signed as Uint8Array<ArrayBuffer>),
    ),
  )
}

const foldReference = (text: string): string => text.replace(/; /g, ';\r\n\t')

export type AmsOptions = {
  i: number | string
  d: string
  s: string
  keyName: string
  alg?: string | undefined
  /** `c=`, or `null` to leave the tag out. @default 'relaxed/relaxed' */
  c?: string | null | undefined
  /** The canonicalization actually used. @default `c`, or simple/simple */
  signedWith?: string | undefined
  h?: readonly string[] | undefined
  extraTags?: string | undefined
}

export async function makeAms(message: string, options: AmsOptions): Promise<string> {
  const { fields, body } = splitReference(message)
  const alg = options.alg ?? 'rsa-sha256'
  const c = options.c === undefined ? 'relaxed/relaxed' : options.c
  const [headerCanon, bodyCanon] = (options.signedWith ?? c ?? 'simple/simple').split('/')
  const bh = base64(
    await sha256(fromBinary(bodyCanon === 'relaxed' ? relaxedBody(body) : simpleBody(body))),
  )
  const h = options.h ?? ['from', 'to', 'subject', 'date', 'message-id']
  const field = foldReference(
    `ARC-Message-Signature: i=${options.i}; a=${alg}; ${c ? `c=${c}; ` : ''}d=${options.d}; s=${options.s}; ${options.extraTags ?? ''}h=${h.join(':')}; bh=${bh}; b=`,
  )
  const used: Record<string, number> = {}
  let data = ''
  for (const name of h) {
    const candidates = fields.filter((f) => fieldName(f) === name.toLowerCase())
    used[name] = (used[name] ?? 0) + 1
    const selected = candidates[candidates.length - used[name]!]
    if (selected) data += (headerCanon === 'relaxed' ? relaxedHeader(selected) : selected) + '\r\n'
  }
  data += headerCanon === 'relaxed' ? relaxedHeader(field) : field
  return field + (await signReference(alg, data, options.keyName))
}

export type ReferenceSet = { aar: string; ams: string; as: string }

export type AsOptions = {
  i: number | string
  cv: string
  d: string
  s: string
  keyName: string
  alg?: string | undefined
  t?: number | undefined
  /** The literal tag list, up to and including `b=`. */
  rawTags?: string | undefined
  /** Sign only the new set, as a cv=fail seal does. */
  ownScope?: boolean | undefined
}

export async function makeAs(
  previous: readonly ReferenceSet[],
  current: { aar: string; ams: string },
  options: AsOptions,
): Promise<string> {
  const alg = options.alg ?? 'rsa-sha256'
  const tags =
    options.rawTags ??
    `i=${options.i}; a=${alg}; cv=${options.cv}; d=${options.d}; s=${options.s}; t=${options.t ?? 1700000000}; b=`
  const field = foldReference(`ARC-Seal: ${tags}`)
  const scope = options.cv.toLowerCase() === 'fail' || options.ownScope ? [] : previous
  let data = ''
  for (const set of scope)
    data += `${relaxedHeader(set.aar)}\r\n${relaxedHeader(set.ams)}\r\n${relaxedHeader(set.as)}\r\n`
  data += `${relaxedHeader(current.aar)}\r\n${relaxedHeader(current.ams)}\r\n${relaxedHeader(field)}`
  return field + (await signReference(alg, data, options.keyName))
}

export type SealOptions = AsOptions & {
  amsAlg?: string | undefined
  /** The whole ARC-Authentication-Results field. */
  aar?: string | undefined
  amsOptions?: Partial<AmsOptions> | undefined
}

export async function sealReference(
  message: string,
  previous: readonly ReferenceSet[],
  options: SealOptions,
): Promise<{ message: string; sets: ReferenceSet[]; set: ReferenceSet }> {
  const aar =
    options.aar ??
    `ARC-Authentication-Results: i=${options.i}; ${options.d}; spf=pass smtp.mailfrom=example.com`
  const ams = await makeAms(message, {
    i: options.i,
    d: options.d,
    s: options.s,
    keyName: options.keyName,
    alg: options.amsAlg ?? options.alg,
    ...options.amsOptions,
  })
  const as = await makeAs(previous, { aar, ams }, options)
  const set = { aar, ams, as }
  return { message: `${as}\r\n${ams}\r\n${aar}\r\n${message}`, sets: [...previous, set], set }
}

export const baseMessage =
  'From: Alice <alice@example.com>\r\nTo: bob@example.net\r\nSubject: hello\r\nDate: Thu, 1 Jan 2024 00:00:00 +0000\r\nMessage-ID: <1@example.com>\r\n\r\nHello world\r\n'

/** One set sealed by one.example with selector `s` and key `k1`. */
export const singleSet = (options: Partial<SealOptions> = {}): ReturnType<typeof sealReference> =>
  sealReference(baseMessage, [], {
    i: 1,
    cv: 'none',
    d: 'one.example',
    s: 's',
    keyName: 'k1',
    ...options,
  })

export const records = { 's._domainkey.one.example': 'k1' }

/** Verifies a binary-text message with a resolver for `keys`. */
export const check = (
  message: string,
  keys: Record<string, string> = records,
  options: Partial<Arc.verify.Options> = {},
): Promise<Arc.Result> =>
  Arc.verify(fromBinary(message), { resolver: resolverFrom(keys), ...options })
