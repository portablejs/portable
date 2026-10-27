import * as Dkim from '@portable/dkim';
import * as Mail from '@portable/mail';
import * as Streams from '@portable/streams';
import { expect, test } from 'vite-plus/test';
import { fakeServer, plain } from './utils.js';

// Follows the mail README: builds a message with Mail.encodeStream, signs it with Dkim.sign and sends
// it with Smtp, then checks that Dkim.verify accepts the signature on the received message.

test('a message encoded, signed, and sent arrives with a valid DKIM signature', async () => {
  // The key of RFC 8032 test 1. WebKit's generateKey('Ed25519') fails about once in 256 calls.
  const privateKey = await crypto.subtle.importKey(
    'jwk',
    {
      kty: 'OKP',
      crv: 'Ed25519',
      x: '11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo',
      d: 'nWGxne_9WmC6hEr0kuwsxERJxWl7MmkZcDusAxyuf2A',
    },
    'Ed25519',
    false,
    ['sign'],
  );
  const record = 'v=DKIM1; k=ed25519; p=11qYAYKxCrfVS/7TyWQHOg7hcvPapiMlrwIaaPcHURo=';
  const resolver = {
    async resolveTxt(name) {
      if (name !== 'mail._domainkey.example.com') {
        throw new Error(`unexpected lookup ${name}`);
      }
      return [[record]];
    },
  } satisfies Dkim.Resolver;

  const message = await Streams.toBytes(
    Mail.encodeStream({
      from: 'Mari <mari@example.com>',
      to: 'jaan@example.org',
      subject: 'Tere õhtust',
      text: 'Tere, Jaan!\n.A line that starts with a dot.\n',
      html: '<p>Tere, Jaan!</p>',
      attachments: [{ content: new Uint8Array(3000).fill(0x2e), filename: 'dots.bin' }],
    }),
  );
  const field = await Dkim.sign(message, {
    domain: 'example.com',
    selector: 'mail',
    privateKey,
  });
  const signed = new Uint8Array([...new TextEncoder().encode(field), ...message]);

  const server = fakeServer();
  const client = await plain(server);
  const result = await client.send({
    from: 'mari@example.com',
    to: 'jaan@example.org',
    message: signed,
  });
  expect(result.accepted).toEqual(['jaan@example.org']);
  await client.close();

  const [received] = server.messages;
  expect(received).toBeDefined();
  const results = await Dkim.verify(`${received}\r\n`, { resolver });
  expect(results.map((each) => [each.result, each.domain])).toEqual([['pass', 'example.com']]);
});
