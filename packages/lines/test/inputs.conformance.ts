import { describe, expect, test } from 'vite-plus/test';
import * as Lines from '@portable/lines';
import {
  attempt,
  byteForms,
  readAll,
  rejectedByteForms,
  streamOf,
  toByteForm,
} from '@portable/fuzz';

const bytes = new TextEncoder().encode('one\r\ntwö\nthree');

describe('byte inputs', () => {
  for (const form of byteForms) {
    test(`reads ${form} chunks`, async () => {
      const chunks = [toByteForm(bytes.subarray(0, 4), form), toByteForm(bytes.subarray(4), form)];
      expect(await readAll(streamOf(chunks).pipeThrough(new Lines.DecoderStream()))).toEqual([
        'one',
        'twö',
        'three',
      ]);
    });
  }
});

describe('rejected byte inputs', () => {
  for (const [name, value] of Object.entries(rejectedByteForms)) {
    test(`throws a TypeError for ${name}`, async () => {
      const v = value as never;
      await expect(
        attempt(() => readAll(streamOf([v]).pipeThrough(new Lines.DecoderStream()))),
      ).rejects.toThrow(TypeError);
    });
  }
});
