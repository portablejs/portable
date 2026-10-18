import zlib from 'node:zlib'
import CRC32 from 'crc-32'
import * as fflate from 'fflate'
import * as pako from 'pako'
import { expect, test } from 'vite-plus/test'
import * as Compress from '@portable/compress'
import * as Streams from '@portable/streams'
import { fixture } from './utils.js'

const text = await fixture('lorem_en_100k.txt')
const utf = await fixture('lorem_utf_100k.txt')
const data = new Uint8Array(text.length * 5 + utf.length * 5)
for (let i = 0; i < 5; i++) {
  data.set(text, i * (text.length + utf.length))
  data.set(utf, i * (text.length + utf.length) + text.length)
}
const gzipped = new Uint8Array(zlib.gzipSync(data))

test('gzip 1 MB of text within 25% of pako and fflate', { timeout: 300_000 }, async ({ bench }) => {
  const result = await bench.compare(
    bench('@portable/compress', async () => {
      await Compress.encode(data)
    }),
    bench('pako', () => {
      pako.gzip(data)
    }),
    bench('fflate', () => {
      fflate.gzipSync(data)
    }),
    bench('node:zlib gzipSync', () => {
      zlib.gzipSync(data)
    }),
  )
  expect(result.get('pako')).not.toBeFasterThan(result.get('@portable/compress'), { delta: 0.25 })
  expect(result.get('fflate')).not.toBeFasterThan(result.get('@portable/compress'), {
    delta: 0.25,
  })
})

test(
  'gunzip 1 MB of text within 25% of pako and fflate',
  { timeout: 300_000 },
  async ({ bench }) => {
    const result = await bench.compare(
      bench('@portable/compress', async () => {
        await Compress.decode(gzipped)
      }),
      bench('pako', () => {
        pako.ungzip(gzipped)
      }),
      bench('fflate', () => {
        fflate.gunzipSync(gzipped)
      }),
      bench('node:zlib gunzipSync', () => {
        zlib.gunzipSync(gzipped)
      }),
    )
    expect(result.get('pako')).not.toBeFasterThan(result.get('@portable/compress'), {
      delta: 0.25,
    })
    expect(result.get('fflate')).not.toBeFasterThan(result.get('@portable/compress'), {
      delta: 0.25,
    })
  },
)

test(
  'gunzip a stream of 1 KiB chunks within 25% of DecompressionStream',
  { timeout: 300_000 },
  async ({ bench }) => {
    const chunks: Uint8Array<ArrayBuffer>[] = []
    for (let i = 0; i < gzipped.length; i += 1024) chunks.push(gzipped.subarray(i, i + 1024))
    const result = await bench.compare(
      bench('@portable/compress DecoderStream', async () => {
        await Streams.toBytes(
          Streams.fromIterable(chunks).pipeThrough(new Compress.DecoderStream()),
        )
      }),
      bench('DecompressionStream', async () => {
        await Streams.toBytes(
          Streams.fromIterable(chunks).pipeThrough(new DecompressionStream('gzip')),
        )
      }),
      bench('fflate Gunzip', () => {
        const gunzip = new fflate.Gunzip(() => {})
        for (const chunk of chunks) gunzip.push(chunk)
        gunzip.push(new Uint8Array(0), true)
      }),
      bench('node:zlib createGunzip', async () => {
        await new Promise((resolve, reject) => {
          const gunzip = zlib.createGunzip()
          gunzip
            .on('data', () => {})
            .on('end', resolve)
            .on('error', reject)
          for (const chunk of chunks) gunzip.write(chunk)
          gunzip.end()
        })
      }),
    )
    expect(result.get('DecompressionStream')).not.toBeFasterThan(
      result.get('@portable/compress DecoderStream'),
      { delta: 0.25 },
    )
  },
)

test('crc32 of 1 MB within 25% of crc-32', { timeout: 300_000 }, async ({ bench }) => {
  const result = await bench.compare(
    bench('@portable/compress', () => {
      Compress.crc32(data)
    }),
    bench('crc-32', () => {
      CRC32.buf(data)
    }),
    bench('node:zlib crc32', () => {
      zlib.crc32(data)
    }),
  )
  expect(result.get('crc-32')).not.toBeFasterThan(result.get('@portable/compress'), {
    delta: 0.25,
  })
})
