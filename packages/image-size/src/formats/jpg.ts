import { need, startsWith, u16, u32, u8 } from '../bytes.js'
import { InvalidInputError } from '../errors.js'
import type { Format } from './format.js'

const isStartOfFrame = (marker: number) =>
  marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc

function orientation(input: Uint8Array, start: number, end: number): number | undefined {
  const tiff = start + 6
  if (tiff + 8 > end) {
    return undefined
  }
  const bigEndian = startsWith(input, tiff, 'MM')
  if (!bigEndian && !startsWith(input, tiff, 'II')) {
    return undefined
  }
  const ifd = tiff + u32(input, tiff + 4, bigEndian)
  if (ifd + 2 > end) {
    return undefined
  }
  const count = u16(input, ifd, bigEndian)
  for (let entry = ifd + 2; entry < ifd + 2 + count * 12 && entry + 12 <= end; entry += 12) {
    if (u16(input, entry, bigEndian) !== 0x0112) {
      continue
    }
    const isSingleShort =
      u16(input, entry + 2, bigEndian) === 3 && u32(input, entry + 4, bigEndian) === 1
    return isSingleShort ? u16(input, entry + 8, bigEndian) : undefined
  }
  return undefined
}

export const jpg: Format = {
  validate: (input) => startsWith(input, 0, '\xff\xd8'),
  calculate(input) {
    let exifOrientation: number | undefined
    for (let offset = 2; ;) {
      if (u8(input, offset) !== 0xff) {
        offset++
        continue
      }
      const marker = u8(input, offset + 1)
      if (marker === 0xff) {
        offset++
        continue
      }
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        offset += 2
        continue
      }
      if (marker === 0xd9 || marker === 0xda) {
        throw new InvalidInputError('Invalid JPG, no size found')
      }
      if (isStartOfFrame(marker)) {
        const width = u16(input, offset + 7, true)
        const height = u16(input, offset + 5, true)
        return exifOrientation
          ? { width, height, type: 'jpg', orientation: exifOrientation }
          : { width, height, type: 'jpg' }
      }
      const end = offset + 2 + u16(input, offset + 2, true)
      if (marker === 0xe1 && startsWith(input, offset + 4, 'Exif')) {
        need(input, end)
        exifOrientation = orientation(input, offset + 4, end)
      }
      offset = end
    }
  },
}
