import { expect } from 'vite-plus/test'
import {
  decode,
  encode,
  encodingLength,
  type Answer,
  type DecodedAnswer,
  type DecodedPacket,
  type Packet,
} from '../index.js'

export const hex = (text: string): Uint8Array =>
  Uint8Array.from(text.match(/../g) ?? [], (byte) => Number.parseInt(byte, 16))

export const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text)

/**
 * Encodes `packet`, checks that `encodingLength` matches and that the decoded packet encodes
 * back to the same bytes, with and without compression, and returns the decoded packet.
 */
export function roundTrip(packet: Packet): DecodedPacket {
  const bytes = encode(packet)
  expect(bytes.length).toBe(encodingLength(packet))
  const decoded = decode(bytes)
  expect(encode(decoded)).toEqual(bytes)
  const compressed = encode(packet, { compress: true })
  expect(compressed.length).toBeLessThanOrEqual(bytes.length)
  expect(decode(compressed)).toEqual(decoded)
  return decoded
}

/** Round-trips one record and returns it as decoded. */
export function roundTripAnswer(answer: Answer): DecodedAnswer {
  return roundTrip({ type: 'response', answers: [answer] }).answers[0]!
}

/** Round-trips one record of `type` with `data` and returns the decoded data. */
export function roundTripData(type: Answer['type'], data: unknown): unknown {
  const answer = roundTripAnswer({ type, name: 'example.com', data } as Answer)
  return 'data' in answer ? answer.data : undefined
}

const header = (questions: number, answers: number) =>
  Uint8Array.of(0, 0, 0, 0, 0, questions, 0, answers, 0, 0, 0, 0)

/** Decodes `name` as the wire bytes of a question name at offset 12. */
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
  const bytes = Uint8Array.from([
    ...header(0, 2),
    0,
    0,
    10,
    0,
    1,
    0,
    0,
    0,
    0,
    prefix.length >> 8,
    prefix.length & 0xff,
    ...prefix,
    ...name,
    0,
    1,
    0,
    1,
    0,
    0,
    0,
    0,
    0,
    4,
    127,
    0,
    0,
    1,
  ])
  return decode(bytes).answers[1]!.name
}

/** Returns the bytes `encode` writes for a question name. */
export function nameBytes(name: string): Uint8Array {
  const bytes = encode({ questions: [{ type: 'A', name }] })
  return bytes.subarray(12, bytes.length - 4)
}
