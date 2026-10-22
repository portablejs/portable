import * as Bytes from '@portable/bytes'
import { VerificationError } from './errors.js'

export const utf8: TextEncoder = new TextEncoder()

export function required(headers: Headers, ...names: readonly string[]): string {
  for (const name of names) {
    const value = headers.get(name)
    if (value) return value
  }
  throw new VerificationError({ reason: 'missing-header', message: `Missing ${names[0]} header` })
}

export function seconds(value: string, header: string): Date {
  if (!/^\d{1,15}$/.test(value))
    throw new VerificationError({
      reason: 'malformed-header',
      message: `${header} is not a Unix timestamp`,
    })
  return new Date(Number(value) * 1000)
}

export const unix = (date: Date): string => String(Math.floor(date.getTime() / 1000))

export const prefixed = (prefix: string, body: Uint8Array): Uint8Array =>
  prefix === '' ? body : Bytes.concat([utf8.encode(prefix), body])

const sha256Hex = /^[\da-f]{64}$/i

export const fromHex = (hex: string): Uint8Array | undefined =>
  sha256Hex.test(hex) ? Bytes.fromHex(hex) : undefined

export const toHex: (bytes: Uint8Array) => string = Bytes.toHex
