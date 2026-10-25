import { describe, expect, test } from 'vite-plus/test';
import * as Binary from '@portable/binary';
import {
  attempt,
  byteForms,
  readAll,
  rejectedByteForms,
  streamOf,
  toByteForm,
} from '@portable/fuzz';

const record = new Uint8Array([0x00, 0x02, 0x68, 0xc3, 0xa9, 0x00, 0xac, 0x02, 0x3f, 0xc0, 0, 0]);

describe('byte inputs', () => {
  for (const form of byteForms) {
    test(`createReader reads a ${form}`, () => {
      const reader = Binary.createReader(toByteForm(record, form));
      expect(reader.uint16()).toBe(2);
      expect(reader.string(1)).toBe('h');
      expect(reader.cstring()).toBe('é');
      expect(reader.varint()).toBe(300);
      expect(reader.float32()).toBe(1.5);
      reader.offset = 0;
      expect(reader.bytes(2)).toEqual(new Uint8Array([0, 2]));
    });

    test(`Writer.bytes copies a ${form}`, () => {
      const writer = Binary.createWriter();
      writer.bytes(toByteForm(record, form));
      expect(writer.toBytes()).toEqual(record);
    });

    test(`FrameDecoderStream reads ${form} chunks`, async () => {
      const input = new Uint8Array([2, 1, 2, 1, 3]);
      const chunks = [toByteForm(input.subarray(0, 2), form), toByteForm(input.subarray(2), form)];
      expect(await readAll(streamOf(chunks).pipeThrough(new Binary.FrameDecoderStream()))).toEqual([
        new Uint8Array([1, 2]),
        new Uint8Array([3]),
      ]);
    });

    test(`FrameEncoderStream writes ${form} chunks`, async () => {
      const chunk = toByteForm(new Uint8Array([1, 2]), form);
      expect(await readAll(streamOf([chunk]).pipeThrough(new Binary.FrameEncoderStream()))).toEqual(
        [new Uint8Array([2, 1, 2])],
      );
    });
  }
});

describe('rejected byte inputs', () => {
  for (const [name, value] of Object.entries(rejectedByteForms)) {
    const v = value as never;
    test(`createReader throws a TypeError for ${name}`, () => {
      expect(() => Binary.createReader(v)).toThrow(TypeError);
    });

    test(`Writer.bytes throws a TypeError for ${name}`, () => {
      expect(() => Binary.createWriter().bytes(v)).toThrow(TypeError);
    });

    for (const Stream of [Binary.FrameDecoderStream, Binary.FrameEncoderStream]) {
      test(`${Stream.name} throws a TypeError for ${name}`, async () => {
        await expect(
          attempt(() => readAll(streamOf([v]).pipeThrough(new Stream()))),
        ).rejects.toThrow(TypeError);
      });
    }
  }
});
