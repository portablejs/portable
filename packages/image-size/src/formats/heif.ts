import { ascii, findBox, startsWith, u16, u32, u8, type Box } from '../bytes.js'
import { InvalidInputError } from '../errors.js'
import type { Format } from './format.js'

type Brand = 'avif' | 'avis' | 'heic' | 'heix' | 'hevc' | 'hevx' | 'mif1' | 'msf1'

const brands = new Set<string>([
  'avif',
  'avis',
  'heic',
  'heix',
  'hevc',
  'hevx',
  'mif1',
  'msf1',
] satisfies Brand[])

const isBrand = (value: string): value is Brand => brands.has(value)

function brand(input: Uint8Array): Brand | undefined {
  const ftyp = findBox(input, 'ftyp', 0, Infinity)
  if (!ftyp) return undefined
  const value = ascii(input, ftyp.offset + 8, ftyp.offset + 12)
  return isBrand(value) ? value : undefined
}

function children(input: Uint8Array, parent: Box, headerSize: number): Box[] {
  const boxes = new Array<Box>()
  const end = parent.offset + parent.size
  for (let offset = parent.offset + headerSize; offset + 8 <= end;) {
    const size = u32(input, offset, true)
    if (size < 8 || offset + size > end) break
    boxes.push({ name: ascii(input, offset + 4, offset + 8), offset, size })
    offset += size
  }
  return boxes
}

function pitmItem(input: Uint8Array, meta: Box[]): number | undefined {
  const pitm = meta.find((box) => box.name === 'pitm')
  if (!pitm) return undefined
  return u8(input, pitm.offset + 8) === 0
    ? u16(input, pitm.offset + 12, true)
    : u32(input, pitm.offset + 12, true)
}

function propertiesOf(input: Uint8Array, ipma: Box, item: number): number[] {
  const version = u8(input, ipma.offset + 8)
  const wideIndexes = (u8(input, ipma.offset + 11) & 1) === 1
  const count = u32(input, ipma.offset + 12, true)
  let offset = ipma.offset + 16
  for (let entry = 0; entry < count; entry++) {
    const id = version < 1 ? u16(input, offset, true) : u32(input, offset, true)
    offset += version < 1 ? 2 : 4
    const associations = u8(input, offset++)
    const indexes = new Array<number>()
    for (let i = 0; i < associations; i++) {
      indexes.push(wideIndexes ? u16(input, offset, true) & 0x7fff : u8(input, offset) & 0x7f)
      offset += wideIndexes ? 2 : 1
    }
    if (id === item) return indexes
  }
  return []
}

export const heif: Format = {
  validate: (input) => startsWith(input, 4, 'ftyp') && brand(input) !== undefined,
  calculate(input) {
    const type = brand(input)
    const meta = findBox(input, 'meta', 0, Infinity)
    if (!type || !meta) throw new InvalidInputError('Invalid HEIF, no meta box')
    const metaBoxes = children(input, meta, 12)
    const iprp = metaBoxes.find((box) => box.name === 'iprp')
    const iprpBoxes = iprp ? children(input, iprp, 8) : []
    const ipco = iprpBoxes.find((box) => box.name === 'ipco')
    const ipma = iprpBoxes.find((box) => box.name === 'ipma')
    if (!ipco) throw new InvalidInputError('Invalid HEIF, no ipco box')
    const properties = children(input, ipco, 8)

    const item = pitmItem(input, metaBoxes)
    const associated =
      item !== undefined && ipma
        ? propertiesOf(input, ipma, item).flatMap((index) => properties[index - 1] ?? [])
        : properties.filter((box) => box.name === 'ispe').slice(0, 1)

    let width = 0
    let height = 0
    for (const box of associated) {
      if (box.name === 'ispe') {
        width = u32(input, box.offset + 12, true)
        height = u32(input, box.offset + 16, true)
      } else if (box.name === 'clap' && width && height) {
        const widthD = u32(input, box.offset + 12, true)
        const heightD = u32(input, box.offset + 20, true)
        if (widthD && heightD) {
          width = Math.round(u32(input, box.offset + 8, true) / widthD)
          height = Math.round(u32(input, box.offset + 16, true) / heightD)
        }
      } else if (box.name === 'irot' && (u8(input, box.offset + 8) & 1) === 1) {
        ;[width, height] = [height, width]
      }
    }
    if (!width || !height)
      throw new InvalidInputError('Invalid HEIF, no size for the primary image')
    return { width, height, type }
  },
}
