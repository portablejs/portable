import { Readable } from 'node:stream';
import * as Smtp from '@portable/smtp';
import { fromIterable } from '@portable/streams';
import SMTPConnection from 'nodemailer/lib/smtp-connection';
import { afterAll, beforeAll, expect, test } from 'vite-plus/test';
import { connect, startCapture, type Capture } from './node.js';
import { chunked, encode } from './utils.js';

const envelope = { from: 'sender@example.com', to: ['a@example.com', 'b@example.com'] };
const small = `From: sender@example.com\r\nTo: a@example.com\r\nSubject: Hello\r\n\r\n${'Hello, world.\r\n'.repeat(100)}`;
const large = encode(`Subject: large\n\n${'teretere, vana kere\n.dot line\n'.repeat(35_000)}`);
const largeChunks = chunked(large, 64 * 1024);

let server: Capture;
let ours: Smtp.Client;
let theirs: SMTPConnection;

beforeAll(async () => {
  server = await startCapture(false);
  ours = await Smtp.connect({ connect, host: 'localhost', port: server.port, secure: 'off' });
  theirs = new SMTPConnection({ host: '127.0.0.1', port: server.port, ignoreTLS: true });
  await new Promise<void>((resolve, reject) => {
    theirs.once('error', reject);
    theirs.connect(() => resolve());
  });
});

afterAll(async () => {
  await ours.close();
  theirs.quit();
  await server.close();
});

const nodemailerSend = (message: string | Readable) =>
  new Promise<void>((resolve, reject) =>
    theirs.send(envelope, message, (error) => (error ? reject(error) : resolve())),
  );

test('sends 10 small messages over one connection within 25% of nodemailer', async ({ bench }) => {
  const result = await bench.compare(
    bench('@portable/smtp', async () => {
      for (let i = 0; i < 10; i++) {
        await ours.send({ ...envelope, message: small });
      }
    }),
    bench('nodemailer', async () => {
      for (let i = 0; i < 10; i++) {
        await nodemailerSend(small);
      }
    }),
    { iterations: 256 },
  );
  expect(result.get('nodemailer')).not.toBeFasterThan(result.get('@portable/smtp'), {
    delta: 0.25,
  });
});

test('streams a 1 MB message within 25% of nodemailer', async ({ bench }) => {
  const result = await bench.compare(
    bench('@portable/smtp', async () => {
      await ours.send({ ...envelope, message: fromIterable(largeChunks) });
    }),
    bench('nodemailer', async () => {
      await nodemailerSend(Readable.from(largeChunks.map((chunk) => Buffer.from(chunk))));
    }),
  );
  expect(result.get('nodemailer')).not.toBeFasterThan(result.get('@portable/smtp'), {
    delta: 0.25,
  });
});
