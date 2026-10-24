import { describe, expect, test } from 'vite-plus/test'
import * as Csv from '@portable/csv'
import {
  attempt,
  byteForms,
  readAll,
  rejectedByteForms,
  streamOf,
  toByteForm,
} from '@portable/fuzz'

const bytes = new TextEncoder().encode('a,b\r\n1,ü\r\n')
const rows = [
  ['a', 'b'],
  ['1', 'ü'],
]

describe('byte inputs', () => {
  for (const form of byteForms) {
    test(`reads a ${form}`, async () => {
      expect(Csv.decode(toByteForm(bytes, form))).toEqual(rows)
      const chunks = [toByteForm(bytes.subarray(0, 8), form), toByteForm(bytes.subarray(8), form)]
      expect(await readAll(streamOf(chunks).pipeThrough(new Csv.DecoderStream()))).toEqual(rows)
    })
  }
})

describe('rejected byte inputs', () => {
  for (const [name, value] of Object.entries(rejectedByteForms)) {
    test(`throws a TypeError for ${name}`, async () => {
      const v = value as never
      await expect(attempt(() => Csv.decode(v))).rejects.toThrow(TypeError)
      await expect(
        attempt(() => readAll(streamOf([v]).pipeThrough(new Csv.DecoderStream()))),
      ).rejects.toThrow(TypeError)
    })
  }
})
