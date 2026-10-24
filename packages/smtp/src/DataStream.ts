import { checkUint8Array } from '@portable/bytes/internal'
const CR = 13
const LF = 10
const DOT = 46
const START = -1

const LF_ONLY = 1
const LF_DOT = 2
const CR_ONLY = 3
const DOT_ONLY = 4

function insertion(prev: number, byte: number): number {
  if (prev === CR) return byte === LF ? 0 : byte === DOT ? LF_DOT : LF_ONLY
  if (byte === LF) return CR_ONLY
  if (byte === DOT && (prev === LF || prev === START)) return DOT_ONLY
  return 0
}

/**
 * Converts every line break to CRLF and doubles a dot at the start of a line. `prev` is the byte
 * before `chunk`, or `START`. A bare CR counts as a line break, because a receiver that
 * ends lines on CR would otherwise read `\r.\r` as the end of the data.
 */
function stuff(chunk: Uint8Array, prev: number): Uint8Array {
  let extra = 0
  let before = prev
  for (let i = 0; i < chunk.length; i++) {
    const byte = chunk[i]!
    const insert = insertion(before, byte)
    if (insert !== 0) extra += insert === LF_DOT ? 2 : 1
    before = byte
  }
  if (extra === 0) return chunk

  const out = new Uint8Array(chunk.length + extra)
  let written = 0
  let copied = 0
  before = prev
  for (let i = 0; i < chunk.length; i++) {
    const byte = chunk[i]!
    const insert = insertion(before, byte)
    before = byte
    if (insert === 0) continue
    out.set(chunk.subarray(copied, i), written)
    written += i - copied
    copied = i
    if (insert === CR_ONLY) out[written++] = CR
    else if (insert === DOT_ONLY) out[written++] = DOT
    else {
      out[written++] = LF
      if (insert === LF_DOT) out[written++] = DOT
    }
  }
  out.set(chunk.subarray(copied), written)
  return out
}

function terminator(last: number): Uint8Array {
  if (last === LF || last === START) return new Uint8Array([DOT, CR, LF])
  if (last === CR) return new Uint8Array([LF, DOT, CR, LF])
  return new Uint8Array([CR, LF, DOT, CR, LF])
}

/** The bytes sent after `DATA` for a whole message: CRLF line breaks, dot-stuffed, ending with `.\r\n`. */
export function encodeData(message: Uint8Array): Uint8Array {
  const body = stuff(message, START)
  const end = terminator(message.length > 0 ? message[message.length - 1]! : START)
  const out = new Uint8Array(body.length + end.length)
  out.set(body)
  out.set(end, body.length)
  return out
}

/** A `TransformStream` from a message to the bytes sent after `DATA`, like `encodeData` for a stream. */
export class DataStream extends TransformStream<Uint8Array, Uint8Array> {
  constructor() {
    let last = START
    super({
      transform(chunk, controller) {
        if (checkUint8Array(chunk).length === 0) return
        controller.enqueue(stuff(chunk, last))
        last = chunk[chunk.length - 1]!
      },
      flush(controller) {
        controller.enqueue(terminator(last))
      },
    })
  }
}
