import { readdirSync } from 'node:fs'
import ExifParser from 'exif-parser'
import { describe, expect, test } from 'vite-plus/test'
import * as Exif from '@portable/exif'
import { gpsTagNames, tagNames } from '../src/tags.js'
import { fixture, jpeg } from './utils.js'

const sections = { ifd0: 1, ifd1: 2, gps: 3, exif: 5, interop: 5 } as const

const hex = (id: number) => `0x${id.toString(16).toUpperCase().padStart(4, '0')}`
const tagName = (section: number, id: number) =>
  (section === 3 ? gpsTagNames[id] : undefined) ?? tagNames[id] ?? hex(id)

function ours(bytes: Uint8Array): Map<string, unknown> {
  const result = Exif.parse(bytes)
  const tags = new Map<string, unknown>()
  for (const ifd of ['ifd0', 'ifd1', 'gps', 'exif', 'interop'] as const) {
    for (const [name, value] of Object.entries(result[ifd])) {
      const key = `${sections[ifd]}:${name}`
      if (!tags.has(key)) {
        tags.set(key, value instanceof Uint8Array ? Array.from(value) : value)
      }
    }
  }
  return tags
}

function theirs(bytes: Uint8Array): Map<string, unknown> {
  const tags = new Map<string, unknown>()
  const parser = ExifParser.create(Buffer.from(bytes))
    .enableBinaryFields(true)
    .enablePointers(true)
    .enableTagNames(false)
    .enableSimpleValues(false)
  for (const { section, type, value } of parser.parse().tags) {
    const key = `${section}:${tagName(section, type)}`
    if (tags.has(key) || value === undefined) {
      continue
    }
    let normalized: unknown = value
    if (Buffer.isBuffer(value)) {
      normalized = Array.from(value)
    } else if (Array.isArray(value)) {
      const values = value.map((v: unknown) => (Array.isArray(v) ? v[0] / v[1] : v))
      normalized = values.length === 1 ? values[0] : values
    }
    tags.set(key, normalized)
  }
  return tags
}

const dir = new URL('./fixtures/', import.meta.url)
const names = readdirSync(dir)
const jpegs = names.filter((name) => name.endsWith('.jpg'))
const tiffs = names.filter((name) => name.endsWith('.exif') || name.endsWith('.tif'))

async function input(name: string): Promise<Uint8Array> {
  const bytes = await fixture(name)
  if (name.endsWith('.jpg')) {
    return bytes
  }
  return jpeg(bytes[0] === 0x45 ? bytes.subarray(6) : bytes)
}

describe('matches exif-parser', () => {
  for (const name of [...jpegs, ...tiffs]) {
    test(`tags of ${name}`, async () => {
      const bytes = await input(name)
      expect(ours(bytes)).toEqual(theirs(bytes))
    })

    test(`tags of the first 65635 bytes of ${name}`, async () => {
      const bytes = (await input(name)).subarray(0, 65635)
      expect(ours(bytes)).toEqual(theirs(bytes))
    })

    test(`image size, thumbnail, dates and coordinates of ${name}`, async () => {
      const bytes = await input(name)
      const result = Exif.parse(bytes)
      const expected = ExifParser.create(Buffer.from(bytes)).parse()
      const seconds = (tag: 'DateTimeOriginal' | 'CreateDate') => {
        const value = result.exif[tag]
        const date = typeof value === 'string' ? Exif.parseDate(value) : undefined
        return date ? date.getTime() / 1000 : value
      }
      const hasRefs =
        result.gps.GPSLatitudeRef !== undefined && result.gps.GPSLongitudeRef !== undefined
      const round = (n: unknown) => (typeof n === 'number' ? Math.round(n * 1e9) / 1e9 : n)
      expect({
        imageSize: result.imageSize,
        thumbnail: result.thumbnail && {
          ...result.thumbnail,
          bytes: Array.from(result.thumbnail.bytes ?? []),
        },
        DateTimeOriginal: seconds('DateTimeOriginal'),
        CreateDate: seconds('CreateDate'),
        coordinates: hasRefs ? [round(result.latitude), round(result.longitude)] : undefined,
      }).toEqual({
        imageSize: expected.imageSize,
        thumbnail: expected.hasThumbnail()
          ? {
              offset: expected.getThumbnailOffset(),
              length: expected.getThumbnailLength(),
              bytes: Array.from(expected.getThumbnailBuffer()),
            }
          : undefined,
        DateTimeOriginal: expected.tags.DateTimeOriginal,
        CreateDate: expected.tags.CreateDate,
        coordinates: hasRefs
          ? [round(expected.tags.GPSLatitude), round(expected.tags.GPSLongitude)]
          : undefined,
      })
    })
  }
})
