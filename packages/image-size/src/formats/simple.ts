import { ascii, startsWith, u16, u32, u8 } from '../bytes.js'
import { InvalidInputError } from '../errors.js'
import type { Format } from './format.js'

export const bmp: Format = {
  validate: (input) => startsWith(input, 0, 'BM'),
  calculate: (input) => ({
    width: u32(input, 18, false),
    height: Math.abs(u32(input, 22, false) | 0),
    type: 'bmp',
  }),
}

export const dds: Format = {
  validate: (input) => startsWith(input, 0, 'DDS '),
  calculate: (input) => ({
    width: u32(input, 16, false),
    height: u32(input, 12, false),
    type: 'dds',
  }),
}

export const gif: Format = {
  validate: (input) =>
    startsWith(input, 0, 'GIF8') && (startsWith(input, 4, '7a') || startsWith(input, 4, '9a')),
  calculate: (input) => ({
    width: u16(input, 6, false),
    height: u16(input, 8, false),
    type: 'gif',
  }),
}

export const j2c: Format = {
  validate: (input) => startsWith(input, 0, '\xff\x4f\xff\x51'),
  calculate: (input) => ({
    width: u32(input, 8, true),
    height: u32(input, 12, true),
    type: 'j2c',
  }),
}

export const ktx: Format = {
  validate: (input) =>
    startsWith(input, 1, 'KTX ') && (startsWith(input, 5, '11') || startsWith(input, 5, '20')),
  calculate(input) {
    const v1 = u8(input, 5) === 0x31
    const offset = v1 ? 36 : 20
    return {
      width: u32(input, offset, false),
      height: u32(input, offset + 4, false),
      type: v1 ? 'ktx' : 'ktx2',
    }
  },
}

const pngSignature = 'PNG\r\n\x1a\n'

export const png: Format = {
  validate(input) {
    if (!startsWith(input, 1, pngSignature)) return false
    let chunk = ascii(input, 12, 16)
    if (chunk === 'CgBI') chunk = ascii(input, 28, 32)
    if (chunk !== 'IHDR') throw new InvalidInputError('Invalid PNG')
    return true
  },
  calculate(input) {
    const offset = startsWith(input, 12, 'CgBI') ? 32 : 16
    return {
      width: u32(input, offset, true),
      height: u32(input, offset + 4, true),
      type: 'png',
    }
  },
}

export const psd: Format = {
  validate: (input) => startsWith(input, 0, '8BPS'),
  calculate: (input) => ({
    width: u32(input, 18, true),
    height: u32(input, 14, true),
    type: 'psd',
  }),
}

export const tga: Format = {
  validate: (input) => u16(input, 0, false) === 0 && u16(input, 4, false) === 0,
  calculate: (input) => ({
    width: u16(input, 12, false),
    height: u16(input, 14, false),
    type: 'tga',
  }),
}
