import { describe, expect, test } from 'vite-plus/test';
import * as Charset from '@portable/charset';
import { windows1251 } from '@portable/charset/single-byte';
import {
  attempt,
  byteForms,
  readBytes,
  rejectedByteForms,
  streamOf,
  toByteForm,
} from '@portable/fuzz';

const utf8 = new TextEncoder().encode('Привет');
const expected = new Uint8Array([0xcf, 0xf0, 0xe8, 0xe2, 0xe5, 0xf2]);

describe('byte inputs', () => {
  for (const form of byteForms) {
    test(`reads a ${form} as UTF-8`, async () => {
      expect(Charset.encode(toByteForm(utf8, form), windows1251)).toEqual(expected);
      const chunks = [toByteForm(utf8.subarray(0, 3), form), toByteForm(utf8.subarray(3), form)];
      expect(
        await readBytes(streamOf(chunks).pipeThrough(new Charset.EncoderStream(windows1251))),
      ).toEqual(expected);
    });
  }
});

describe('rejected byte inputs', () => {
  for (const [name, value] of Object.entries(rejectedByteForms)) {
    test(`throws a TypeError for ${name}`, async () => {
      const v = value as never;
      await expect(attempt(() => Charset.encode(v, windows1251))).rejects.toThrow(TypeError);
      await expect(
        attempt(() => readBytes(streamOf([v]).pipeThrough(new Charset.EncoderStream(windows1251)))),
      ).rejects.toThrow(TypeError);
    });
  }
});
