import { expect } from 'vite-plus/test'
import {
  decode,
  encode,
  type DecodedPacket,
  type DecodedResourceRecord,
  type Packet,
  type ResourceRecord,
} from '@portable/dns-packet'

export const hex = (text: string): Uint8Array =>
  Uint8Array.from(text.match(/../g) ?? [], (byte) => Number.parseInt(byte, 16))

export const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text)

/**
 * Encodes `packet` and decodes it again. Also checks that the decoded packet encodes to the same
 * bytes, and that compression and TCP framing decode to the same packet.
 */
export function roundTrip(packet: Packet): DecodedPacket {
  const bytes = encode(packet)
  const decoded = decode(bytes)
  expect(encode(decoded)).toEqual(bytes)
  const compressed = encode(packet, { compress: true })
  expect(compressed.length).toBeLessThanOrEqual(bytes.length)
  expect(decode(compressed)).toEqual(decoded)
  expect(decode(encode(packet, { framing: 'tcp' }), { framing: 'tcp' })).toEqual(decoded)
  return decoded
}

/** Round-trips one record in the answer section and returns it as decoded. */
export function roundTripRecord(record: ResourceRecord): DecodedResourceRecord {
  return roundTrip({ type: 'response', answers: [record] }).answers[0]!
}

/** Round-trips one record of `type` with `data` and returns the decoded data. */
export function roundTripData(type: string, data: unknown): unknown {
  const record = roundTripRecord({ type, name: 'example.com', data } as ResourceRecord)
  return 'data' in record ? record.data : undefined
}

const header = (questions: number, answers: number) =>
  Uint8Array.of(0, 0, 0, 0, 0, questions, 0, answers, 0, 0, 0, 0)

/** Decodes `name`, given as wire bytes, as a question name at offset 12. */
export function decodeQuestionName(name: readonly number[]): string {
  return decode(Uint8Array.from([...header(1, 0), ...name, 0, 1, 0, 1])).questions[0]!.name
}

/** Absolute offset at which `decodeNameAfter` places `prefix`. */
export const PREFIX_OFFSET = 23

/**
 * Decodes a name whose bytes follow `prefix` in the same message, so pointers in `name` can
 * point into `prefix`. `prefix` starts at `PREFIX_OFFSET` as the RDATA of a NULL record.
 */
export function decodeNameAfter(prefix: readonly number[], name: readonly number[]): string {
  const nullRecord = [0, 0, 10, 0, 1, 0, 0, 0, 0, prefix.length >> 8, prefix.length & 0xff]
  const aRecord = [0, 1, 0, 1, 0, 0, 0, 0, 0, 4, 127, 0, 0, 1]
  const bytes = Uint8Array.from([...header(0, 2), ...nullRecord, ...prefix, ...name, ...aRecord])
  return decode(bytes).answers[1]!.name
}

/** Returns the bytes `encode` writes for a question name. */
export function nameBytes(name: string): Uint8Array {
  const bytes = encode({ questions: [{ type: 'A', name }] })
  return bytes.subarray(12, bytes.length - 4)
}

/** A seeded linear congruential generator returning numbers in [0, 1). */
export function random(seed: number): () => number {
  let state = seed
  return () => {
    state = (state * 1103515245 + 12345) % 2 ** 31
    return state / 2 ** 31
  }
}
