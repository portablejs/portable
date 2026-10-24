import * as Bytes from '@portable/bytes'
import { ascii, findBox, NeedMore, startsWith, u32, u64 } from '../bytes.js'
import { InvalidInputError } from '../errors.js'
import type { Size } from '../parse.js'
import type { Format } from './format.js'

const aspectRatios = [1, 1.2, 4 / 3, 1.5, 16 / 9, 5 / 4, 2]
const sizeBits = [9, 13, 18, 30]

/** ISO/IEC 18181-1 `SizeHeader`. */
function sizeHeader(codestream: Uint8Array, end: number): Size {
  let byte = 2
  let bit = 0
  const bits = (count: number): number => {
    let result = 0
    for (let read = 0; read < count;) {
      if (byte >= codestream.length) throw new NeedMore(end)
      const take = Math.min(count - read, 8 - bit)
      result |= ((codestream[byte]! >> bit) & ((1 << take) - 1)) << read
      read += take
      bit += take
      if (bit === 8) {
        byte++
        bit = 0
      }
    }
    return result
  }
  const dimension = (small: boolean) => (small ? 8 * (1 + bits(5)) : 1 + bits(sizeBits[bits(2)]!))

  const small = bits(1) === 1
  const height = dimension(small)
  const ratio = bits(3)
  const width = ratio === 0 ? dimension(small) : Math.floor(height * aspectRatios[ratio - 1]!)
  return { width, height, type: 'jxl-stream' }
}

export const jxlStream: Format = {
  validate: (input) => startsWith(input, 0, '\xff\x0a'),
  calculate: (input) => sizeHeader(input, input.length + 1),
}

function codestream(input: Uint8Array): Uint8Array[] {
  const parts: Uint8Array[] = []
  for (let offset = 0; offset + 8 <= input.length;) {
    let size = u32(input, offset, true)
    let header = 8
    if (size === 1) {
      size = u64(input, offset + 8, true)
      header = 16
    }
    const end = size === 0 ? input.length : offset + size
    const name = ascii(input, offset + 4, offset + 8)
    if (name === 'jxlc' || name === 'jxlp') {
      const start = offset + header + (name === 'jxlp' ? 4 : 0)
      if (end < start) throw new InvalidInputError('Invalid JXL')
      parts.push(input.subarray(start, Math.min(end, input.length)))
      if (name === 'jxlc') break
    }
    if (size === 0) break
    offset = end
  }
  return parts
}

export const jxl: Format = {
  validate(input) {
    if (!startsWith(input, 4, 'JXL ')) return false
    const ftyp = findBox(input, 'ftyp', 0, Infinity)
    return ftyp !== undefined && ascii(input, ftyp.offset + 8, ftyp.offset + 12) === 'jxl '
  },
  calculate(input, final) {
    const parts = codestream(input)
    if (parts.length === 0 && final) throw new InvalidInputError('Invalid JXL')
    return {
      ...sizeHeader(parts.length === 1 ? parts[0]! : Bytes.concat(parts), input.length + 1),
      type: 'jxl',
    }
  },
}
