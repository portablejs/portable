import * as Smtp from '@portable/smtp';
import { fromIterable } from '@portable/streams';
import { afterEach, describe, expect, test } from 'vite-plus/test';
import { connect } from './node.js';
import { startServer, type TestServer } from './server.js';
import { chunked, encode, failure } from './utils.js';

const servers: TestServer[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

async function serve(options: Parameters<typeof startServer>[0] = {}): Promise<TestServer> {
  const server = await startServer(options);
  servers.push(server);
  return server;
}

const decoder = new TextDecoder();
const auth = { user: 'testuser', pass: 'testpass' };
const envelope = { from: 'test@valid.sender', to: 'test@valid.recipient' };
const text = 'teretere, vana kere\n'.repeat(1023);

function open(server: TestServer, options: Partial<Smtp.connect.Options> = {}) {
  return Smtp.connect({
    connect,
    host: 'localhost',
    port: server.port,
    secure: 'off',
    ...options,
  });
}

describe('plaintext', () => {
  test('sends a string, bytes, and a stream, received with CRLF line breaks', async () => {
    const server = await serve({ disabledCommands: ['STARTTLS', 'AUTH'] });
    const client = await open(server);
    expect(client.secure).toBe(false);
    await client.send({ ...envelope, message: text });
    await client.send({ ...envelope, message: encode(text) });
    await client.send({ ...envelope, message: fromIterable(chunked(encode(text), 1000)) });
    await client.close();
    const expected = text.replaceAll('\n', '\r\n');
    expect(server.received.map((r) => decoder.decode(r.data))).toEqual([
      expected,
      expected,
      expected,
    ]);
  });

  test('sends to the accepted recipients only, with and without PIPELINING', async () => {
    for (const hidePIPELINING of [false, true]) {
      const server = await serve({ disabledCommands: ['STARTTLS', 'AUTH'], hidePIPELINING });
      const client = await open(server);
      expect(client.extensions.includes('PIPELINING')).toBe(!hidePIPELINING);
      const result = await client.send({
        from: 'test@valid.sender',
        to: ['test1@valid.recipient', 'test2@invalid.recipient', 'test3@valid.recipient'],
        message: 'test',
      });
      expect(result.accepted).toEqual(['test1@valid.recipient', 'test3@valid.recipient']);
      expect(result.rejected.map((r) => [r.recipient, r.responseCode])).toEqual([
        ['test2@invalid.recipient', 550],
      ]);
      expect(result.response).toMatch(/^250 /);
      expect(server.received[0]!.to).toEqual(['test1@valid.recipient', 'test3@valid.recipient']);
      await client.close();
    }
  });

  test('fails when every recipient or the sender is refused', async () => {
    const server = await serve({ disabledCommands: ['STARTTLS', 'AUTH'] });
    const client = await open(server);
    const to = ['test1@invalid.recipient', 'test2@invalid.recipient'];
    const all = await failure(client.send({ from: 'test@valid.sender', to, message: 'test' }));
    expect(all.code).toBe('EENVELOPE');
    expect(all.rejected).toHaveLength(2);
    const sender = await failure(
      client.send({ ...envelope, from: 'test@invalid.sender', message: 'test' }),
    );
    expect(sender.command).toBe('MAIL FROM');
    expect((await client.send({ ...envelope, message: 'test' })).accepted).toHaveLength(1);
    await client.close();
  });

  test('declares 8BITMIME, so 8-bit content is accepted', async () => {
    const server = await serve({
      disabledCommands: ['STARTTLS', 'AUTH'],
      onData(stream, session, done) {
        stream.on('data', () => {});
        stream.on('end', () =>
          done(
            (session.envelope.mailFrom as { args: Record<string, unknown> }).args.BODY ===
              '8BITMIME'
              ? null
              : new Error('8 bit content not allowed'),
          ),
        );
      },
    });
    const client = await open(server);
    const result = await client.send({ ...envelope, message: 'Subject: õ\r\n\r\nõõõõ' });
    expect(result.accepted).toEqual([envelope.to]);
    await client.close();
  });

  test('sends SMTPUTF8 for internationalized addresses', async () => {
    const server = await serve({ disabledCommands: ['STARTTLS', 'AUTH'] });
    const client = await open(server);
    const result = await client.send({
      from: 'tõst@valid.sender',
      to: ['test1@valid.recipient', 'test3õ@valid.recipient'],
      message: 'test',
    });
    expect(result.accepted).toEqual(['test1@valid.recipient', 'test3õ@valid.recipient']);
    expect(server.received[0]!.from).toBe('tõst@valid.sender');
    await client.close();
  });

  test('declares SIZE and fails early for a message over the limit', async () => {
    let declared: unknown;
    const server = await serve({
      disabledCommands: ['STARTTLS', 'AUTH'],
      size: 100 * 1024,
      onMailFrom(address, _session, done) {
        declared = address.args.SIZE;
        if (Number(address.args.SIZE) > 50 * 1024) {
          return done(
            Object.assign(new Error('Insufficient channel storage'), { responseCode: 452 }),
          );
        }
        done();
      },
    });
    const client = await open(server);
    await client.send({ ...envelope, message: 'x'.repeat(10 * 1024) });
    expect(declared).toBe(String(10 * 1024 + 5));
    const tooLarge = await failure(client.send({ ...envelope, message: 'x'.repeat(200 * 1024) }));
    expect(tooLarge.code).toBe('EMESSAGE');
    const refused = await failure(client.send({ ...envelope, message: 'x'.repeat(70 * 1024) }));
    expect(refused.code).toBe('EENVELOPE');
    expect(refused.responseCode).toBe(452);
    await client.close();
  });

  test('sends DSN parameters', async () => {
    let notify: unknown;
    const server = await serve({
      disabledCommands: ['STARTTLS', 'AUTH'],
      hideDSN: false,
      onRcptTo(address, _session, done) {
        notify = address.dsn;
        done();
      },
    });
    const client = await open(server);
    await client.send({
      ...envelope,
      message: 'test',
      dsn: { ret: 'HDRS', envid: 'dsn-id-1', notify: ['FAILURE', 'DELAY'] },
    });
    expect(server.received[0]!.envelope.dsn).toEqual({ ret: 'HDRS', envid: 'dsn-id-1' });
    expect(notify).toEqual({ notify: ['FAILURE', 'DELAY'] });
    await client.close();
  });

  test('reports a server that drops the connection after the greeting', async () => {
    const server = await serve({
      disabledCommands: ['STARTTLS', 'AUTH'],
      onConnect(_session, done) {
        setTimeout(() => {
          for (const connection of server.server.connections) {
            connection._socket.write('454 4.3.0 Try again later\r\n');
            connection._socket.destroy();
          }
        }, 20);
        done();
      },
    });
    const client = await open(server);
    const error = await failure(
      new Promise((resolve) => setTimeout(resolve, 100)).then(() =>
        client.send({ ...envelope, message: 'test' }),
      ),
    );
    expect(error.code).toBe('ECONNECTION');
  });

  test('reports a server that closes the connection during DATA', async () => {
    const server = await serve({
      disabledCommands: ['STARTTLS', 'AUTH'],
      onData(stream) {
        stream.once('data', () => {
          for (const connection of server.server.connections) {
            connection._socket.destroy();
          }
        });
      },
    });
    const client = await open(server);
    const error = await failure(
      client.send({ ...envelope, message: `Subject: test\r\n\r\n${'x'.repeat(256 * 1024)}` }),
    );
    expect(['ECONNECTION', 'EMESSAGE']).toContain(error.code);
  });
});

describe('TLS and authentication', () => {
  test('upgrades with STARTTLS and logs in with PLAIN', async () => {
    const server = await serve({ disabledCommands: [] });
    const client = await open(server, { secure: 'starttls', auth });
    expect(client.secure).toBe(true);
    await client.send({ ...envelope, message: text });
    expect(server.received[0]!.secure).toBe(true);
    await client.close();
  });

  test('logs in over implicit TLS', async () => {
    const server = await serve({ secure: true });
    const client = await open(server, { secure: 'on', auth });
    expect(client.secure).toBe(true);
    await client.send({ ...envelope, message: 'test' });
    await client.close();
  });

  test('logs in with LOGIN when the server offers only LOGIN', async () => {
    const methods: string[] = [];
    const server = await serve({
      secure: true,
      authMethods: ['LOGIN'],
      onAuth(login, _session, done) {
        methods.push(login.method);
        done(null, { user: login.username });
      },
    });
    const client = await open(server, { secure: 'on', auth });
    await client.close();
    expect(methods).toEqual(['LOGIN']);
  });

  test('logs in with XOAUTH2', async () => {
    const seen: unknown[] = [];
    const server = await serve({
      secure: true,
      authMethods: ['XOAUTH2'],
      onAuth(login, _session, done) {
        seen.push([login.method, login.username, login.accessToken]);
        if (login.accessToken !== 'testtoken') {
          return done(null, { data: { status: '401', schemes: 'bearer mac', scope: 'smtp' } });
        }
        done(null, { user: login.username });
      },
    });
    await (
      await open(server, { secure: 'on', auth: { user: 'testuser', accessToken: 'testtoken' } })
    ).close();
    const error = await failure(
      open(server, { secure: 'on', auth: { user: 'testuser', accessToken: 'invalid' } }),
    );
    expect(error.code).toBe('EAUTH');
    expect(seen).toEqual([
      ['XOAUTH2', 'testuser', 'testtoken'],
      ['XOAUTH2', 'testuser', 'invalid'],
    ]);
  });

  test('reports a wrong password with code 535', async () => {
    const server = await serve({ secure: true });
    const error = await failure(open(server, { secure: 'on', auth: { ...auth, pass: 'invalid' } }));
    expect(error.code).toBe('EAUTH');
    expect(error.responseCode).toBe(535);
  });

  test('logs in over plaintext only with allowInsecureAuth', async () => {
    const server = await serve();
    expect((await failure(open(server, { auth }))).code).toBe('EAUTH');
    const client = await open(server, { auth, allowInsecureAuth: true });
    await client.send({ ...envelope, message: 'test' });
    await client.close();
  });

  test('fails when STARTTLS is required and the server does not offer it', async () => {
    const server = await serve({ disabledCommands: ['STARTTLS', 'AUTH'] });
    expect((await failure(open(server, { secure: 'starttls' }))).code).toBe('ETLS');
  });

  test('sends REQUIRETLS over TLS', async () => {
    const server = await serve({ secure: true, hideREQUIRETLS: false, authOptional: true });
    const client = await open(server, { secure: 'on' });
    await client.send({ ...envelope, message: 'test', requireTls: true });
    await client.send({ ...envelope, message: 'test' });
    expect(server.received.map((r) => r.envelope.requireTLS)).toEqual([true, false]);
    await client.close();
  });

  test('fails before MAIL FROM when the server does not offer REQUIRETLS', async () => {
    const server = await serve({ secure: true, hideREQUIRETLS: true, authOptional: true });
    const client = await open(server, { secure: 'on' });
    expect(
      (await failure(client.send({ ...envelope, message: 'test', requireTls: true }))).code,
    ).toBe('EENVELOPE');
    await client.close();
  });
});

describe('LMTP', () => {
  test('reports the per-recipient results of the message', async () => {
    const server = await serve({
      lmtp: true,
      disabledCommands: ['STARTTLS', 'AUTH'],
      onData(stream, session, done) {
        stream.on('data', () => {});
        stream.on('end', () =>
          done(
            null,
            session.envelope.rcptTo.map((rcpt, i) =>
              i % 2 ? `<${rcpt.address}> Accepted` : new Error(`<${rcpt.address}> Not accepted`),
            ),
          ),
        );
      },
    });
    const client = await open(server, { lmtp: true });
    const result = await client.send({
      from: 'test@valid.sender',
      to: [
        'test1@valid.recipient',
        'test2@invalid.recipient',
        'test3@valid.recipient',
        'test4@valid.recipient',
        'test5@valid.recipient',
        'test6@valid.recipient',
      ],
      message: 'test',
    });
    expect(result.accepted).toEqual(['test3@valid.recipient', 'test5@valid.recipient']);
    expect(result.rejected.map((r) => r.recipient)).toEqual([
      'test2@invalid.recipient',
      'test1@valid.recipient',
      'test4@valid.recipient',
      'test6@valid.recipient',
    ]);
    await client.close();
  });

  test('restarts the session with LHLO after STARTTLS', async () => {
    const server = await serve({ lmtp: true, disabledCommands: ['AUTH'] });
    const client = await open(server, { lmtp: true, secure: 'starttls' });
    expect(client.secure).toBe(true);
    expect(client.extensions).toContain('PIPELINING');
    await client.close();
  });
});
