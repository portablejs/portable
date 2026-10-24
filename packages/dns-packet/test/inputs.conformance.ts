import { describe, expect, test } from 'vite-plus/test';
import * as DnsPacket from '@portable/dns-packet';
import { attempt, byteForms, rejectedByteForms, toByteForm } from '@portable/fuzz';

const bytes = DnsPacket.encode({
  id: 1,
  questions: [{ name: 'example.com', type: 'A' }],
});

describe('byte inputs', () => {
  for (const form of byteForms) {
    test(`decodes a ${form}`, () => {
      expect(DnsPacket.decode(toByteForm(bytes, form))).toEqual(DnsPacket.decode(bytes));
    });
  }
});

describe('rejected byte inputs', () => {
  for (const [name, value] of Object.entries(rejectedByteForms)) {
    test(`throws a TypeError for ${name}`, async () => {
      const v = value as never;
      await expect(attempt(() => DnsPacket.decode(v))).rejects.toThrow(TypeError);
    });
  }
});
