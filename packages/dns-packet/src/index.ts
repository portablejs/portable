export type { Opcode, OptionCode, Rcode, RecordClass, RecordType } from './codes.js'
export { InvalidInputError, TruncatedError, UnsupportedError } from './errors.js'
export {
  decode,
  encode,
  type DecodedOptRecord,
  type DecodedPacket,
  type DecodedQuestion,
  type DecodedResourceRecord,
  type Flags,
  type OptRecord,
  type Packet,
  type Question,
  type ResourceRecord,
  type UnknownType,
} from './packet.js'
export type { DecodedRecordData, EdnsOption, RecordData } from './records.js'
