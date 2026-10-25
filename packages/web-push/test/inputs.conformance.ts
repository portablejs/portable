import { describe, expect, test } from 'vite-plus/test';
import { attempt, byteForms, rejectedByteForms, toByteForm } from '@portable/fuzz';
import * as WebPush from '@portable/web-push';
import { decrypt, userAgent } from './utils.js';

const payload = new TextEncoder().encode('hello');

describe('byte inputs', () => {
  for (const form of byteForms) {
    test(`reads keys, payload and salt given as a ${form}`, async () => {
      const agent = await userAgent();
      const keys = {
        p256dh: toByteForm(agent.publicKey, form),
        auth: toByteForm(agent.auth, form),
      };
      const salt = toByteForm(new Uint8Array(16).fill(7), form);
      const body = await WebPush.encrypt({
        subscription: { keys },
        payload: toByteForm(payload, form),
        salt,
      });
      expect(await decrypt(body, agent)).toEqual(payload);
    });
  }
});

describe('rejected byte inputs', () => {
  for (const [name, value] of Object.entries(rejectedByteForms)) {
    test(`throws a TypeError for ${name}`, async () => {
      const v = value as never;
      const agent = await userAgent();
      const subscription = { keys: { p256dh: agent.publicKey, auth: agent.auth } };
      await expect(attempt(() => WebPush.encrypt({ subscription, payload: v }))).rejects.toThrow(
        TypeError,
      );
      await expect(
        attempt(() => WebPush.encrypt({ subscription, payload, salt: v })),
      ).rejects.toThrow(TypeError);
    });
  }
});
