import { NeedMore, startsWith, u32, utf8 } from '../bytes.js'
import { InvalidInputError } from '../errors.js'
import type { Image } from '../parse.js'
import type { Format } from './format.js'

const iconSizes: Record<string, number> = {
  ICON: 32,
  'ICN#': 32,
  'icm#': 16,
  icm4: 16,
  icm8: 16,
  'ics#': 16,
  ics4: 16,
  ics8: 16,
  is32: 16,
  s8mk: 16,
  icp4: 16,
  icl4: 32,
  icl8: 32,
  il32: 32,
  l8mk: 32,
  icp5: 32,
  ic11: 32,
  ich4: 48,
  ich8: 48,
  ih32: 48,
  h8mk: 48,
  icp6: 64,
  ic12: 32,
  it32: 128,
  t8mk: 128,
  ic07: 128,
  ic08: 256,
  ic13: 256,
  ic09: 512,
  ic14: 512,
  ic10: 1024,
}

export const icns: Format = {
  validate: (input) => startsWith(input, 0, 'icns'),
  calculate(input) {
    const fileLength = u32(input, 4, true)
    const images = new Array<Image>()
    for (let offset = 8; offset < fileLength;) {
      if (offset >= input.length) throw new NeedMore(offset + 8)
      const length = u32(input, offset + 4, true)
      if (length < 8) throw new InvalidInputError('Invalid ICNS')
      const type = utf8(input, offset, offset + 4)
      const size = iconSizes[type]
      if (size) images.push({ width: size, height: size, type })
      offset += length
    }
    const [first] = images
    if (!first) throw new InvalidInputError('Invalid ICNS, no sizes found')
    return images.length === 1
      ? { width: first.width, height: first.height, type: 'icns' }
      : { width: first.width, height: first.height, type: 'icns', images }
  },
}
