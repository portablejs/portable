export * as classes from './classes.js'
export {
  InvalidNameError,
  InvalidPointerError,
  InvalidRecordError,
  TruncatedError,
} from './errors.js'
export * as opcodes from './opcodes.js'
export * as optioncodes from './optioncodes.js'
export {
  decode,
  encode,
  encodingLength,
  streamDecode,
  streamEncode,
  type Answer,
  type DecodedAnswer,
  type DecodedOptAnswer,
  type DecodedPacket,
  type DecodedQuestion,
  type OptAnswer,
  type Packet,
  type Question,
  type UnknownType,
} from './packet.js'
export * as rcodes from './rcodes.js'
export type { DecodedEdnsOption, DecodedRecordData, EdnsOption, RecordData } from './records.js'
export * as types from './types.js'

/** Header flag AA: the responding server is authoritative for the name. */
export const AUTHORITATIVE_ANSWER: number = 1 << 10
/** Header flag TC: the message was truncated to fit the transport. */
export const TRUNCATED_RESPONSE: number = 1 << 9
/** Header flag RD: ask the server to resolve the query recursively. */
export const RECURSION_DESIRED: number = 1 << 8
/** Header flag RA: the server supports recursion. */
export const RECURSION_AVAILABLE: number = 1 << 7
/** Header flag AD: the server validated the answer with DNSSEC. */
export const AUTHENTIC_DATA: number = 1 << 5
/** Header flag CD: the server should not validate DNSSEC. */
export const CHECKING_DISABLED: number = 1 << 4
/** EDNS flag DO, set in an OPT record's `flags`: the client wants DNSSEC records. */
export const DNSSEC_OK: number = 1 << 15
