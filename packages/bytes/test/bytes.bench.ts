import { Buffer } from 'node:buffer'
import { timingSafeEqual as nodeTimingSafeEqual } from 'node:crypto'
import {
  areUint8ArraysEqual,
  concatUint8Arrays,
  hexToUint8Array,
  uint8ArrayToHex,
} from 'uint8array-extras'
import { describe, expect, test } from 'vite-plus/test'
import * as Bytes from '@portable/bytes'
import { randomBytes } from './utils.js'

const nativeToHex = Reflect.get(Uint8Array.prototype, 'toHex') satisfies
  | ((this: Uint8Array) => string)
  | undefined

const sizes = { '32 B': 32, '1 MiB': 1 << 20 }

for (const [label, size] of Object.entries(sizes)) {
  describe(`${label}`, () => {
    const bytes = randomBytes(size, 1)
    const copy = bytes.slice()
    const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.length)
    const bufferCopy = Buffer.from(copy)
    const hex = buffer.toString('hex')

    test(`toHex within 25% of uint8array-extras`, async ({ bench }) => {
      const result = await bench.compare(
        bench('@portable/bytes', () => Bytes.toHex(bytes)),
        bench('uint8array-extras', () => uint8ArrayToHex(bytes)),
        bench('Buffer#toString', () => buffer.toString('hex')),
        ...(nativeToHex ? [bench('Uint8Array#toHex', () => nativeToHex.call(bytes))] : []),
      )
      expect(result.get('uint8array-extras')).not.toBeFasterThan(result.get('@portable/bytes'), {
        delta: 0.25,
      })
    })

    test(`fromHex within 25% of uint8array-extras`, async ({ bench }) => {
      const result = await bench.compare(
        bench('@portable/bytes', () => Bytes.fromHex(hex)),
        bench('uint8array-extras', () => hexToUint8Array(hex)),
        bench('Buffer.from', () => Buffer.from(hex, 'hex')),
      )
      expect(result.get('uint8array-extras')).not.toBeFasterThan(result.get('@portable/bytes'), {
        delta: 0.25,
      })
    })

    test(`equal within 25% of uint8array-extras`, async ({ bench }) => {
      const result = await bench.compare(
        bench('@portable/bytes', () => Bytes.equal(bytes, copy)),
        bench('uint8array-extras', () => areUint8ArraysEqual(bytes, copy)),
        bench('Buffer.compare', () => Buffer.compare(buffer, bufferCopy)),
      )
      expect(result.get('uint8array-extras')).not.toBeFasterThan(result.get('@portable/bytes'), {
        delta: 0.25,
      })
    })

    test(`timingSafeEqual within 25% of node:crypto`, async ({ bench }) => {
      const result = await bench.compare(
        bench('@portable/bytes', () => Bytes.timingSafeEqual(bytes, copy)),
        bench('node:crypto', () => nodeTimingSafeEqual(bytes, copy)),
      )
      expect(result.get('node:crypto')).not.toBeFasterThan(result.get('@portable/bytes'), {
        delta: 0.25,
      })
    })
  })
}

const chunkSets = {
  '4 × 64 KiB': Array.from({ length: 4 }, (_, i) => randomBytes(1 << 16, i)),
  '100 × 32 B': Array.from({ length: 100 }, (_, i) => randomBytes(32, i)),
}

for (const [label, chunks] of Object.entries(chunkSets)) {
  test(`concat ${label} within 25% of uint8array-extras`, async ({ bench }) => {
    const result = await bench.compare(
      bench('@portable/bytes', () => Bytes.concat(chunks)),
      bench('uint8array-extras', () => concatUint8Arrays(chunks)),
      bench('Buffer.concat', () => Buffer.concat(chunks)),
    )
    expect(result.get('uint8array-extras')).not.toBeFasterThan(result.get('@portable/bytes'), {
      delta: 0.25,
    })
  })
}
