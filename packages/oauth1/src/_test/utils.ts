import { expect } from 'vite-plus/test'
import * as OAuth1 from '../index.js'

export { default as pkcs1 } from './fixtures/rsa-pkcs1.pem?raw'
export { default as pkcs8 } from './fixtures/rsa-pkcs8.pem?raw'
export { default as publicKey } from './fixtures/rsa-public.pem?raw'

export const twitter = {
  consumer: {
    key: 'xvz1evFS4wEEPTGEFPHBog',
    secret: 'kAcSOqF21Fu85e7zjz7ZN2U4ZRhfV3WpwPAoE3Z7kBw',
  },
  token: {
    key: '370773112-GmHxMAgYyLbNEtIKZeRNFsMKPR9EyMZeS9weJAEb',
    secret: 'LswwdoUaIvS8ltyTt5jkRh4J50vUPVVHtR2YPi5kE',
  },
  nonce: 'kYjzVBB8Y0ZFabxSWbWovY3uYSQ2pTgmZeNu2VS4cg',
  timestamp: 1318622958,
} as const

export function form(
  body: string,
  init: { method?: string; headers?: Record<string, string> } = {},
): RequestInit {
  return {
    method: init.method ?? 'POST',
    body,
    headers: { 'content-type': 'application/x-www-form-urlencoded', ...init.headers },
  }
}

/** The parameters of an `Authorization: OAuth …` header, decoded. */
export function parseHeader(header: string): Record<string, string> {
  expect(header.startsWith('OAuth ')).toBe(true)
  const params: Record<string, string> = {}
  for (const [, name, value] of header.matchAll(/([\w]+)="((?:[^"\\]|\\.)*)"/g))
    params[name!] = name === 'realm' ? value!.replace(/\\(.)/g, '$1') : decodeURIComponent(value!)
  return params
}

export async function signature(
  request: Request,
  options: OAuth1.authorization.Options,
): Promise<string> {
  return parseHeader(await OAuth1.authorization(request, options)).oauth_signature!
}

/**
 * Builds a signature base string from a method, a base URI and a normalized parameter string
 * written out by hand. Both only hold characters that `encodeURIComponent` encodes as RFC 5849 does.
 */
export function baseString(method: string, uri: string, parameters: string): string {
  return `${method}&${encodeURIComponent(uri)}&${encodeURIComponent(parameters)}`
}

/** HMAC by WebCrypto, which shares no code with the package. */
export async function hmac(hash: 'SHA-1' | 'SHA-256', key: string, data: string): Promise<string> {
  const utf8 = new TextEncoder()
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    utf8.encode(key),
    { name: 'HMAC', hash },
    false,
    ['sign'],
  )
  const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, utf8.encode(data)))
  return btoa(String.fromCharCode(...bytes))
}
