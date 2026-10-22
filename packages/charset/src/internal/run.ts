import type { Charset, Definition, Encoder, Output } from '../Charset.js'
import { UnsupportedError } from '../errors.js'

export type Unmappable = 'replace' | 'html' | 'error' | ((codePoint: number) => string)

export type Options = {
  bom?: boolean | undefined
  unmappable?: Unmappable | undefined
}

export type State = {
  readonly charset: Definition
  readonly encoder: Encoder
  readonly unmappable: Unmappable
  bom: readonly number[] | undefined
  pending: string
}

export function createState(input: Charset, options: Options): State {
  const charset = input as unknown as Definition
  return {
    charset,
    encoder: charset.encoder(),
    unmappable: options.unmappable ?? 'replace',
    bom: options.bom ? charset.bom : undefined,
    pending: '',
  }
}

let noTable: Uint16Array | undefined

function grow(out: Output, size: number): void {
  if (size <= out.bytes.length) return
  const bytes = new Uint8Array(Math.max(size, out.bytes.length * 2))
  bytes.set(out.bytes.subarray(0, out.length))
  out.bytes = bytes
}

function unmappableError(codePoint: number, charset: string): UnsupportedError {
  const hex = codePoint.toString(16).toUpperCase().padStart(4, '0')
  return new UnsupportedError(`U+${hex} can't be encoded in ${charset}.`)
}

function replacement(state: State, codePoint: number): string {
  const { unmappable } = state
  if (unmappable === 'replace') return '?'
  if (unmappable === 'html') return `&#${codePoint};`
  if (unmappable === 'error') throw unmappableError(codePoint, state.charset.name)
  return unmappable(codePoint)
}

/** Encodes `input`, holding back a trailing high surrogate unless `last` is set. */
export function run(state: State, input: string, last: boolean): Uint8Array<ArrayBuffer> {
  const text = state.pending + input
  let end = text.length
  state.pending = ''
  if (!last && end > 0) {
    const unit = text.charCodeAt(end - 1)
    if (unit >= 0xd800 && unit <= 0xdbff) {
      state.pending = text[--end]!
    }
  }

  const { charset, encoder } = state
  let bom: readonly number[] = []
  if (end > 0 || last) {
    bom = state.bom ?? []
    state.bom = undefined
  }

  if (encoder.string) {
    const bytes = encoder.string(end === text.length ? text : text.slice(0, end))
    if (bom.length === 0) return bytes
    const result = new Uint8Array(bom.length + bytes.length)
    result.set(bom)
    result.set(bytes, bom.length)
    return result
  }

  const { maxBytes } = charset
  const reserve = encoder.flush && last ? 8 : 0
  // The buffer holds maxBytes per remaining code unit, so only replacements grow it.
  const out: Output = { bytes: new Uint8Array(bom.length + end * maxBytes + reserve), length: 0 }
  out.bytes.set(bom)
  out.length = bom.length
  const { write } = encoder
  const table = encoder.table ?? (noTable ??= new Uint16Array(0x10000))
  let bytes = out.bytes
  let length = out.length

  if (maxBytes === 1 && bytes.length === length + end) {
    // Most single-byte text maps in full, so try a pass without branches first.
    let mapped = 0x100
    for (let i = 0; i < end; i++) {
      const value = table[text.charCodeAt(i)]!
      bytes[length + i] = value
      mapped &= value
    }
    if (mapped !== 0) return bytes
  }

  for (let i = 0; i < end; i++) {
    let codePoint = text.charCodeAt(i)
    const value = table[codePoint]!
    if (value !== 0) {
      if (value > 0x1ff) bytes[length++] = value >> 8
      bytes[length++] = value
      continue
    }
    if (codePoint >= 0xd800 && codePoint <= 0xdfff) {
      const next = i + 1 < end ? text.charCodeAt(i + 1) : 0
      if (codePoint <= 0xdbff && next >= 0xdc00 && next <= 0xdfff) {
        codePoint = 0x10000 + ((codePoint - 0xd800) << 10) + (next - 0xdc00)
        i++
      } else {
        codePoint = 0xfffd
      }
    }
    out.length = length
    const unmapped = write(codePoint, out)
    if (unmapped >= 0) {
      const substitute = replacement(state, unmapped)
      grow(out, out.length + (substitute.length + end - i) * maxBytes + reserve)
      for (const char of substitute) {
        const code = char.codePointAt(0)!
        const value = code < 0x10000 ? table[code]! : 0
        if (value > 0x1ff) out.bytes[out.length++] = value >> 8
        if (value !== 0) out.bytes[out.length++] = value
        else if (write(code, out) >= 0) throw unmappableError(code, charset.name)
      }
      bytes = out.bytes
    }
    length = out.length
  }
  out.length = length
  if (last) encoder.flush?.(out)
  return out.length === out.bytes.length ? out.bytes : out.bytes.slice(0, out.length)
}
