import { type Canonicalizer, createCanonicalizer, type Sink } from './body.js'
import * as Bytes from '@portable/bytes'
import type { Canonicalization } from './header.js'
import type { Body } from './message.js'
import type { Hash, Hasher } from '@portable/web-crypto'

/** `crypto.subtle.digest` takes its whole input at once, so this collects the chunks. */
function webCryptoHash(): Hasher {
  const chunks: Uint8Array[] = []
  return {
    update(data) {
      chunks.push(data)
    },
    digest: () => sha256(Bytes.concat(chunks)),
  }
}

export const sha256 = async (data: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> =>
  new Uint8Array(await crypto.subtle.digest('SHA-256', data))

/** A body hash to compute: the canonicalization, and the `l=` length when there is one. */
export type BodyHash = { canonicalization: Canonicalization; length?: number | undefined }

export type BodyDigest = {
  digest: Uint8Array
  /** The length of the whole canonicalized body. */
  total: number
}

export const bodyHashKey = (request: BodyHash): string =>
  `${request.canonicalization}:${request.length ?? ''}`

type Pass = { canonicalizer: Canonicalizer; sinks: Sink[]; total: number }

export async function hashBody(
  body: Body,
  requests: readonly BodyHash[],
  createHash: (hash: Hash) => Hasher = webCryptoHash,
): Promise<Map<string, BodyDigest>> {
  const passes = new Map<Canonicalization, Pass>()
  const hashes = new Map<string, { pass: Pass; hash: Hasher }>()
  for (const request of requests) {
    const key = bodyHashKey(request)
    if (hashes.has(key)) {
      continue
    }
    let pass = passes.get(request.canonicalization)
    if (!pass) {
      const sinks: Sink[] = []
      const created: Pass = {
        sinks,
        total: 0,
        canonicalizer: createCanonicalizer(request.canonicalization, (bytes) => {
          created.total += bytes.length
          for (const sink of sinks) {
            sink(bytes)
          }
        }),
      }
      pass = created
      passes.set(request.canonicalization, pass)
    }
    const hash = createHash('SHA-256')
    hashes.set(key, { pass, hash })
    const { length = Infinity } = request
    let hashed = 0
    pass.sinks.push((bytes) => {
      if (hashed >= length) {
        return
      }
      const part = hashed + bytes.length > length ? bytes.subarray(0, length - hashed) : bytes
      hashed += part.length
      hash.update(part)
    })
  }

  for (let chunk = await body.read(); chunk; chunk = await body.read()) {
    for (const pass of passes.values()) {
      pass.canonicalizer.write(chunk)
    }
  }
  for (const pass of passes.values()) {
    pass.canonicalizer.end()
  }

  const digests = new Map<string, BodyDigest>()
  for (const [key, { pass, hash }] of hashes) {
    digests.set(key, { digest: await hash.digest(), total: pass.total })
  }
  return digests
}
