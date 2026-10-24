import { describe, expect, test } from 'vite-plus/test'
import * as Jsonl from '@portable/jsonl'
import {
  attempt,
  byteForms,
  readAll,
  rejectedByteForms,
  streamOf,
  toByteForm,
} from '@portable/fuzz'

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

describe('rejected byte inputs', () => {
  for (const [name, value] of Object.entries(rejectedByteForms)) {
    test(`throws a TypeError for ${name}`, async () => {
      const v = value as never
      await expect(
        attempt(() => readAll(streamOf([v]).pipeThrough(new Jsonl.DecoderStream()))),
      ).rejects.toThrow(TypeError)
    })
  }
})
