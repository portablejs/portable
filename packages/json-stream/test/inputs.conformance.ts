import { describe, expect, test } from 'vite-plus/test'
import * as JsonStream from '@portable/json-stream'
import { byteForms, readAll, streamOf, toByteForm } from '@portable/fuzz'

const bytes = new TextEncoder().encode('{"rows":[{"id":"ü"},{"id":"b"}]}')

describe('byte inputs', () => {
  for (const form of byteForms) {
    test(`reads ${form} chunks`, async () => {
      const chunks = [toByteForm(bytes.subarray(0, 18), form), toByteForm(bytes.subarray(18), form)]
      const matches = await readAll(
        streamOf(chunks).pipeThrough(new JsonStream.DecoderStream({ paths: ['$.rows.*'] })),
      )
      expect(matches.map((match) => match.value)).toEqual([{ id: 'ü' }, { id: 'b' }])
    })
  }
})
