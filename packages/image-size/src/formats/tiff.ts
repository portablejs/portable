import { startsWith, u16, u32, u64, u8 } from '../bytes.js'
import { InvalidInputError } from '../errors.js'
import type { Format } from './format.js'

const signatures = ['II*\0', 'MM\0*', 'II+\0', 'MM\0+']

export const tiff: Format = {
  validate: (input) => signatures.some((signature) => startsWith(input, 0, signature)),
  calculate(input) {
    const bigEndian = u8(input, 0) === 0x4d
    const big = u16(input, 2, bigEndian) === 43
    if (big && (u16(input, 4, bigEndian) !== 8 || u16(input, 6, bigEndian) !== 0)) {
      throw new InvalidInputError('Invalid BigTIFF header')
    }
    const ifd = big ? u64(input, 8, bigEndian) : u32(input, 4, bigEndian)
    const count = big ? u64(input, ifd, bigEndian) : u16(input, ifd, bigEndian)
    const entrySize = big ? 20 : 12
    const first = ifd + (big ? 8 : 2)

    let width = 0
    let height = 0
    for (let entry = first; entry < first + count * entrySize; entry += entrySize) {
      const tag = u16(input, entry, bigEndian)
      if (tag === 0) break
      if (tag !== 256 && tag !== 257) continue
      const type = u16(input, entry + 2, bigEndian)
      const values = big ? u64(input, entry + 4, bigEndian) : u32(input, entry + 4, bigEndian)
      const at = entry + (big ? 12 : 8)
      let value = 0
      if (values !== 1) continue
      if (type === 3) value = u16(input, at, bigEndian)
      else if (type === 4) value = u32(input, at, bigEndian)
      else if (type === 16 && big) value = u64(input, at, bigEndian)
      else continue
      if (tag === 256) width = value
      else height = value
      if (width && height) break
    }
    if (!width || !height) throw new InvalidInputError('Invalid TIFF, missing tags')
    return { width, height, type: big ? 'bigtiff' : 'tiff' }
  },
}
