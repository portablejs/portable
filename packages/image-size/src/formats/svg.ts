import { NeedMore, utf8 } from '../bytes.js'
import { InvalidInputError } from '../errors.js'
import type { Format } from './format.js'

const root = /<svg\s([^>"']|"[^"]*"|'[^']*')*>/
const rootStart = /<svg\s/
const widthAttribute = /\swidth=(['"])([^%]+?)\1/
const heightAttribute = /\sheight=(['"])([^%]+?)\1/
const viewBoxAttribute = /\sviewBox=(['"])(.+?)\1/i

const units: Record<string, number> = {
  in: 96,
  cm: 96 / 2.54,
  em: 16,
  ex: 8,
  m: (96 / 2.54) * 100,
  mm: 96 / 2.54 / 10,
  pc: 96 / 72 / 12,
  pt: 96 / 72,
  px: 1,
}
const length = new RegExp(`^([0-9.]+(?:e\\d+)?)(${Object.keys(units).join('|')})?$`)

function parseLength(text: string | undefined): number | undefined {
  const match = text === undefined ? null : length.exec(text)
  if (!match) return undefined
  return Math.round(Number(match[1]) * (units[match[2] ?? ''] ?? 1))
}

export const svg: Format = {
  validate(input, final) {
    if (root.test(utf8(input, 0, 1000))) return true
    if (!final && input.length < 1000) throw new NeedMore(1000)
    return false
  },
  calculate(input, final) {
    const text = utf8(input, 0, input.length)
    const match = root.exec(text)
    if (!final && (!match || text.search(rootStart) < match.index)) {
      throw new NeedMore(input.length + 1)
    }
    if (!match) throw new InvalidInputError('Invalid SVG')
    const tag = match[0]
    const width = parseLength(widthAttribute.exec(tag)?.[2])
    const height = parseLength(heightAttribute.exec(tag)?.[2])
    if (width && height) return { width, height, type: 'svg' }
    const bounds =
      viewBoxAttribute
        .exec(tag)?.[2]
        ?.trim()
        .split(/[\s,]+/) ?? []
    const boxWidth = parseLength(bounds[2])
    const boxHeight = parseLength(bounds[3])
    if (boxWidth === undefined || boxHeight === undefined)
      throw new InvalidInputError('Invalid SVG')
    const ratio = boxWidth / boxHeight
    if (width) return { width, height: Math.floor(width / ratio), type: 'svg' }
    if (height) return { width: Math.floor(height * ratio), height, type: 'svg' }
    return { width: boxWidth, height: boxHeight, type: 'svg' }
  },
}
