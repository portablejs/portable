import { byteForms, readAll, streamOf, toByteForm } from '@portable/fuzz'
import * as Streams from '@portable/streams'
import { describe, expect, test } from 'vite-plus/test'

const bytes = new Uint8Array([1, 2, 3, 4])

describe('byte inputs', () => {
  for (const form of byteForms) {
    test(`limitBytes counts a ${form} chunk as its byte length`, async () => {
      const chunk = toByteForm(bytes, form)
      expect(await readAll(streamOf([chunk]).pipeThrough(Streams.limitBytes(4)))).toEqual([chunk])
      await expect(readAll(streamOf([chunk]).pipeThrough(Streams.limitBytes(3)))).rejects.toThrow(
        Streams.MaxBytesError,
      )
    })

    test(`toBytes, toBlob and toText read a ${form} chunk`, async () => {
      const chunk = () => streamOf([toByteForm(bytes, form)])
      expect(await Streams.toBytes(chunk())).toEqual(bytes)
      expect(new Uint8Array(await (await Streams.toBlob(chunk())).arrayBuffer())).toEqual(bytes)
      expect(await Streams.toText(chunk())).toBe('\x01\x02\x03\x04')
    })
  }

  test.skipIf(typeof SharedArrayBuffer !== 'function')('toBlob copies a shared chunk', async () => {
    const shared = new SharedArrayBuffer(2)
    new Uint8Array(shared).set([7, 8])
    const blob = await Streams.toBlob(streamOf([new Uint8Array(shared)]))
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(new Uint8Array([7, 8]))
  })
})
