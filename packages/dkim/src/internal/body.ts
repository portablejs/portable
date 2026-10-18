import { CR, LF, SP, TAB } from './bytes.js'
import type { Canonicalization } from './header.js'

/** Receives canonicalized body bytes. */
export type Sink = (bytes: Uint8Array) => void

export type Canonicalizer = { write(chunk: Uint8Array): void; end(): void }

const crlf = new Uint8Array([CR, LF])

/**
 * RFC 6376 sections 3.4.3 and 3.4.4, for a body whose line ends are CRLF. A CR that no LF follows
 * is body content.
 */
export function createCanonicalizer(canonicalization: Canonicalization, sink: Sink): Canonicalizer {
  return canonicalization === 'simple' ? simple(sink) : relaxed(sink)
}

function simple(sink: Sink): Canonicalizer {
  let held: Uint8Array[] = []
  return {
    write(chunk) {
      let end = chunk.length
      while (end > 0 && (chunk[end - 1] === CR || chunk[end - 1] === LF)) end--
      if (end === 0) {
        held.push(chunk)
        return
      }
      for (const bytes of held) sink(bytes)
      sink(end === chunk.length ? chunk : chunk.subarray(0, end))
      held = end === chunk.length ? [] : [chunk.subarray(end)]
    },
    end() {
      let tail = 0
      for (const bytes of held) tail += bytes.length
      const run = new Uint8Array(tail)
      let offset = 0
      for (const bytes of held) {
        run.set(bytes, offset)
        offset += bytes.length
      }
      while (tail >= 2 && run[tail - 2] === CR && run[tail - 1] === LF) tail -= 2
      if (tail > 0) sink(run.subarray(0, tail))
      sink(crlf)
    },
  }
}

function relaxed(sink: Sink): Canonicalizer {
  let space = false
  let cr = false
  let lineEnds = 0
  let content = false
  return {
    write(chunk) {
      const out = new Uint8Array(chunk.length + lineEnds * 2 + 2)
      let o = 0
      const flush = () => {
        for (; lineEnds > 0; lineEnds--) {
          out[o++] = CR
          out[o++] = LF
        }
        if (space) out[o++] = SP
        space = false
        content = true
      }
      for (let i = 0; i < chunk.length; i++) {
        const byte = chunk[i]!
        if (cr) {
          cr = false
          if (byte === LF) {
            space = false
            lineEnds++
            continue
          }
          flush()
          out[o++] = CR
        }
        if (byte === CR) cr = true
        else if (byte === SP || byte === TAB) space = true
        else if (byte === LF) {
          space = false
          lineEnds++
        } else {
          if (lineEnds > 0 || space) flush()
          content = true
          out[o++] = byte
        }
      }
      if (o > 0) sink(out.subarray(0, o))
    },
    end() {
      if (cr) {
        const out = new Uint8Array(lineEnds * 2 + 2)
        let o = 0
        for (; lineEnds > 0; lineEnds--) {
          out[o++] = CR
          out[o++] = LF
        }
        if (space) out[o++] = SP
        out[o++] = CR
        sink(out.subarray(0, o))
        content = true
      }
      if (content) sink(crlf)
    },
  }
}
