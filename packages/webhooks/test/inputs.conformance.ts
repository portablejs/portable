import { describe, expect, test } from 'vite-plus/test';
import { attempt, byteForms, rejectedByteForms, toByteForm } from '@portable/fuzz';
import * as Webhooks from '@portable/webhooks';

const body = new TextEncoder().encode('{"test": 2432232314}');
const secret = new TextEncoder().encode('whsec');
const now = new Date(1614265330 * 1000);
const id = 'msg_1';

describe('byte inputs', () => {
  for (const form of byteForms) {
    test(`signs and verifies a body and secret given as a ${form}`, async () => {
      const scheme = Webhooks.github;
      const headers = await Webhooks.sign(toByteForm(body, form), {
        scheme,
        secret: toByteForm(secret, form),
        id,
        now,
      });
      expect(headers).toEqual(await Webhooks.sign(body, { scheme, secret, id, now }));
      await expect(
        Webhooks.verify(
          { headers, body: toByteForm(body, form) },
          { scheme, secret: [toByteForm(secret, form)], now },
        ),
      ).resolves.toBeDefined();
    });
  }
});

describe('rejected byte inputs', () => {
  for (const [name, value] of Object.entries(rejectedByteForms)) {
    test(`throws a TypeError for ${name}`, async () => {
      const v = value as never;
      const scheme = Webhooks.github;
      await expect(attempt(() => Webhooks.sign(v, { scheme, secret, now }))).rejects.toThrow(
        TypeError,
      );
      await expect(attempt(() => Webhooks.sign(body, { scheme, secret: v, now }))).rejects.toThrow(
        TypeError,
      );
      const headers = await Webhooks.sign(body, { scheme, secret, now });
      await expect(
        attempt(() => Webhooks.verify({ headers, body: v }, { scheme, secret, now })),
      ).rejects.toThrow(TypeError);
      await expect(
        attempt(() => Webhooks.verify({ headers, body }, { scheme, secret: v, now })),
      ).rejects.toThrow(TypeError);
    });
  }
});
