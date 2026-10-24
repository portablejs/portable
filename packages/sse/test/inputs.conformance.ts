import { describe, expect, test } from 'vite-plus/test'
import * as Sse from '@portable/sse'
import { byteForms, readAll, streamOf, toByteForm } from '@portable/fuzz'

const bytes = new TextEncoder().encode('event: greet\ndata: héllo\n\ndata: two\n\n')

describe('byte inputs', () => {
  for (const form of byteForms) {
    test(`reads a ${form}`, async () => {
      const expected = Sse.decode(bytes)
      expect(expected).toHaveLength(2)
      expect(Sse.decode(toByteForm(bytes, form))).toEqual(expected)
      const chunks = [toByteForm(bytes.subarray(0, 20), form), toByteForm(bytes.subarray(20), form)]
      expect(await readAll(streamOf(chunks).pipeThrough(new Sse.DecoderStream()))).toEqual(expected)
    })
  }
})
