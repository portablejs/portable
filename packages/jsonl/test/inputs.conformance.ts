import { describe, expect, test } from 'vite-plus/test'
import * as Jsonl from '@portable/jsonl'
import { byteForms, readAll, streamOf, toByteForm } from '@portable/fuzz'

const bytes = new TextEncoder().encode('{"a":1}\n["ü"]\n')

describe('byte inputs', () => {
  for (const form of byteForms) {
    test(`reads ${form} chunks`, async () => {
      const chunks = [toByteForm(bytes.subarray(0, 5), form), toByteForm(bytes.subarray(5), form)]
      expect(await readAll(streamOf(chunks).pipeThrough(new Jsonl.DecoderStream()))).toEqual([
        { a: 1 },
        ['ü'],
      ])
    })
  }
})
