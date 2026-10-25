import { attempt, byteForms, rejectedByteForms, streamOf, toByteForm } from '@portable/fuzz';
import { describe, expect, test } from 'vite-plus/test';
import { encode, fakeServer, plain } from './utils.js';

const envelope = { from: 'sender@example.com', to: ['a@example.com'] };
const message = encode('Subject: test\n\nhello\n.dot line\n');

describe('byte inputs', () => {
  for (const form of byteForms) {
    test(`sends a message given as a ${form} or a stream of them`, async () => {
      const server = fakeServer();
      const client = await plain(server);
      await client.send({ ...envelope, message: toByteForm(message, form) });
      const chunks = [
        toByteForm(message.subarray(0, 10), form),
        toByteForm(message.subarray(10), form),
      ];
      await client.send({ ...envelope, message: streamOf(chunks) });
      const expected = 'Subject: test\r\n\r\nhello\r\n.dot line';
      expect(server.messages).toEqual([expected, expected]);
    });
  }
});

describe('rejected byte inputs', () => {
  for (const [name, value] of Object.entries(rejectedByteForms)) {
    test(`throws a TypeError for ${name}`, async () => {
      const v = value as never;
      const client = await plain(fakeServer());
      await expect(attempt(() => client.send({ ...envelope, message: v }))).rejects.toThrow(
        TypeError,
      );
      await expect(client.send({ ...envelope, message: streamOf([v]) })).rejects.toMatchObject({
        cause: expect.any(TypeError),
      });
    });
  }
});
