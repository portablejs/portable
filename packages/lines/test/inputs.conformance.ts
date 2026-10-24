import { describe, expect, test } from 'vite-plus/test'
import * as Lines from '@portable/lines'
import { byteForms, readAll, streamOf, toByteForm } from '@portable/fuzz'

const bytes = new TextEncoder().encode('one\r\ntwö\nthree')

describe('byte inputs', () => {
  for (const form of byteForms) {
    test(`reads ${form} chunks`, async () => {
      const chunks = [toByteForm(bytes.subarray(0, 4), form), toByteForm(bytes.subarray(4), form)]
      expect(await readAll(streamOf(chunks).pipeThrough(new Lines.DecoderStream()))).toEqual([
        'one',
        'twö',
        'three',
      ])
    })
  }

  test('errors the stream for a chunk that is neither bytes nor a string', async () => {
    await expect(
      readAll(streamOf([[0x61]] as never[]).pipeThrough(new Lines.DecoderStream())),
    ).rejects.toThrow(TypeError)
  })
})
