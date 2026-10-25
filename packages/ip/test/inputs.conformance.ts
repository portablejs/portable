import { describe, expect, test } from 'vite-plus/test';
import { attempt, byteForms, rejectedByteForms, toByteForm } from '@portable/fuzz';
import * as Ip from '@portable/ip';

describe('byte inputs', () => {
  for (const form of byteForms) {
    test(`fromBytes reads a ${form} and copies it`, () => {
      const input = toByteForm(new Uint8Array([127, 0, 0, 1]), form);
      const address = Ip.fromBytes(input);
      expect(Ip.format(address)).toBe('127.0.0.1');
      expect(address.bytes).toBeInstanceOf(Uint8Array);
      input.fill(9);
      expect(Ip.format(address)).toBe('127.0.0.1');
    });
  }
});

describe('rejected byte inputs', () => {
  for (const [name, value] of Object.entries(rejectedByteForms)) {
    test(`throws a TypeError for ${name}`, async () => {
      const v = value as never;
      await expect(attempt(() => Ip.fromBytes(v))).rejects.toThrow(TypeError);
    });
  }
});
