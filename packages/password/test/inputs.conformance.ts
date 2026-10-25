import { describe, expect, test } from 'vite-plus/test';
import { attempt, byteForms, rejectedByteForms, toByteForm } from '@portable/fuzz';
import * as Password from '@portable/password';

const password = new TextEncoder().encode('hunter2');

describe('byte inputs', () => {
  for (const form of byteForms) {
    test(`hashes and verifies a ${form}`, async () => {
      const stored = await Password.hash(toByteForm(password, form), { iterations: 1000 });
      expect(await Password.verify('hunter2', stored)).toBe(true);
      expect(await Password.verify(toByteForm(password, form), stored)).toBe(true);
    });
  }
});

describe('rejected byte inputs', () => {
  for (const [name, value] of Object.entries(rejectedByteForms)) {
    test(`throws a TypeError for ${name}`, async () => {
      const v = value as never;
      await expect(attempt(() => Password.hash(v, { iterations: 1000 }))).rejects.toThrow(
        TypeError,
      );
      const stored = await Password.hash(password, { iterations: 1000 });
      await expect(attempt(() => Password.verify(v, stored))).rejects.toThrow(TypeError);
    });
  }
});
