import { imageSize as upstream } from 'image-size'
import { describe, expect, test } from 'vite-plus/test'
import * as ImageSize from '../index.js'
import { fixture, fixtures, randomChunks, tracked } from './utils.js'

// Fixtures where image-size has a known bug (see "Known upstream issues" in PARITY.md). The
// expected value is the correct one, so the oracle doesn't lock the bug in.
const upstreamBugs: Record<string, ImageSize.Size> = {
  'valid/heif/sample-multi.heic': { width: 123, height: 456, type: 'heic' },
}

function viaUpstream(bytes: Uint8Array): unknown {
  // image-size also returns TIFF's `compression` tag, which isn't part of its documented result.
  const { compression: _, ...size } = upstream(bytes) as { compression?: number }
  return size
}

const valid = fixtures.filter((path) => path.startsWith('valid/'))
const invalid = fixtures.filter((path) => path.startsWith('invalid/'))

describe('gives the same size as image-size', () => {
  for (const path of valid) {
    test(`${path}`, async () => {
      const bytes = await fixture(path)
      const expected = upstreamBugs[path] ?? viaUpstream(bytes)
      expect(ImageSize.parse(bytes)).toEqual(expected)
      for (const seed of [1, 2, 3]) {
        const { stream, cancelled, read } = tracked(randomChunks(bytes, seed))
        expect(await ImageSize.parseStream(stream)).toEqual(expected)
        expect(read() === bytes.length || cancelled()).toBe(true)
      }
    })
  }
})

describe('rejects what image-size rejects', () => {
  for (const path of invalid) {
    test(`${path}`, async () => {
      const bytes = await fixture(path)
      expect(() => upstream(bytes)).toThrow(TypeError)
      expect(() => ImageSize.parse(bytes)).toThrow(ImageSize.InvalidInputError)
    })
  }
})
