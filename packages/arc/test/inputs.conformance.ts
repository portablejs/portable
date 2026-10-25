import * as Arc from '@portable/arc';
import { attempt, byteForms, rejectedByteForms, streamOf, toByteForm } from '@portable/fuzz';
import { describe, expect, test } from 'vite-plus/test';
import { fromBinary, records, resolverFrom, singleSet } from './utils.js';

describe('byte inputs', () => {
  for (const form of byteForms) {
    test(`verifies a message given as a ${form}`, async () => {
      const bytes = fromBinary((await singleSet()).message);
      const resolver = resolverFrom(records);
      expect((await Arc.verify(toByteForm(bytes, form), { resolver })).result).toBe('pass');
      const chunks = [
        toByteForm(bytes.subarray(0, 40), form),
        toByteForm(bytes.subarray(40), form),
      ];
      expect((await Arc.verify(streamOf(chunks), { resolver })).result).toBe('pass');
    });
  }
});

describe('rejected byte inputs', () => {
  for (const [name, value] of Object.entries(rejectedByteForms)) {
    test(`throws a TypeError for ${name}`, async () => {
      const v = value as never;
      const resolver = resolverFrom(records);
      await expect(attempt(() => Arc.verify(v, { resolver }))).rejects.toThrow(TypeError);
      await expect(attempt(() => Arc.verify(streamOf([v]), { resolver }))).rejects.toThrow(
        TypeError,
      );
    });
  }
});
