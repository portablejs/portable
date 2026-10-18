import * as Smtp from '@portable/smtp'
import { describe, expect, test } from 'vite-plus/test'
import { chunked, encode, failure, fakeServer, plain } from './utils.js'

describe('connecting', () => {
  test('connects without TLS and introduces itself with EHLO', async () => {
    const server = fakeServer()
    const client = await plain(server, { name: 'client.example.com' })
    expect(client.secure).toBe(false)
    expect(server.commands).toEqual(['EHLO client.example.com'])
    expect(server.sockets).toEqual([
      { hostname: 'mx.example.com', port: 587, secureTransport: 'off', allowHalfOpen: false },
    ])
  })

  test('uses an address literal as the EHLO name by default', async () => {
    const server = fakeServer()
    await plain(server)
    expect(server.commands).toEqual(['EHLO [127.0.0.1]'])
  })

  test('uses implicit TLS on port 465 and STARTTLS on other ports by default', async () => {
    const server = fakeServer({
      EHLO: '250-test\r\n250 STARTTLS\r\n',
      STARTTLS: '220 Go ahead\r\n',
    })
    const implicit = await Smtp.connect({
      connect: server.connect,
      host: 'mx.example.com',
      port: 465,
    })
    expect(implicit.secure).toBe(true)
    const starttls = await Smtp.connect({ connect: server.connect, host: 'mx.example.com' })
    expect(starttls.secure).toBe(true)
    const tlsOn = await Smtp.connect({
      connect: server.connect,
      host: 'mx.example.com',
      secure: 'on',
    })
    expect(tlsOn.secure).toBe(true)
    expect(server.sockets.map(({ port, secureTransport }) => [port, secureTransport])).toEqual([
      [465, 'on'],
      [587, 'starttls'],
      [465, 'on'],
    ])
  })

  test('rejects a name with CR or LF before connecting', async () => {
    const server = fakeServer()
    const name = 'legit.host\r\nMAIL FROM:<attacker@evil.com>'
    await expect(plain(server, { name })).rejects.toThrow(TypeError)
    await expect(plain(server, { name: 'a\nb' })).rejects.toThrow(TypeError)
    await expect(plain(server, { name: 'a\rb' })).rejects.toThrow(TypeError)
    expect(server.sockets).toEqual([])
  })

  test('reports a socket that fails to open', async () => {
    const error = await failure(plain(fakeServer({}, { refuse: true })))
    expect(error.code).toBe('ECONNECTION')
    expect(error.command).toBe('CONNECT')
    expect(error.cause).toBeInstanceOf(Error)
  })

  test('reports a connect function that throws', async () => {
    const connect: Smtp.Connect = () => {
      throw new Error('Port out of range')
    }
    const error = await failure(Smtp.connect({ connect, host: 'mx.example.com', port: 999999999 }))
    expect(error.code).toBe('ECONNECTION')
    expect(error.message).toContain('999999999')
  })

  test('rejects a greeting other than 220', async () => {
    const server = fakeServer({ greeting: '554 5.3.2 No SMTP service here\r\n' })
    const error = await failure(plain(server))
    expect(error.code).toBe('EPROTOCOL')
    expect(error.command).toBe('CONNECT')
    expect(error.responseCode).toBe(554)
    expect(error.enhancedCode).toBe('5.3.2')
    expect(error.response).toBe('554 5.3.2 No SMTP service here')
    expect(server.commands).toEqual([])
    expect(server.closed).toBe(1)
  })

  test('reports an unterminated 421 line when the server hangs up before the greeting', async () => {
    const server = fakeServer({
      greeting: (_, connection) => connection.end('421 4.7.0 Too many connections'),
    })
    const error = await failure(plain(server))
    expect(error.code).toBe('ECONNECTION')
    expect(error.command).toBe('CONNECT')
    expect(error.responseCode).toBe(421)
    expect(error.response).toBe('421 4.7.0 Too many connections')
  })

  test('reports a server that drops the connection before the greeting', async () => {
    const server = fakeServer({ greeting: (_, connection) => connection.end() })
    const error = await failure(plain(server))
    expect(error.code).toBe('ECONNECTION')
    expect(error.command).toBe('CONNECT')
    expect(error.responseCode).toBeUndefined()
  })

  test('reports a reset connection', async () => {
    const server = fakeServer({ greeting: (_, connection) => connection.destroy() })
    const error = await failure(plain(server))
    expect(error.code).toBe('ECONNECTION')
  })

  test('rejects with the signal reason when the greeting never arrives', async () => {
    const server = fakeServer({ greeting: false })
    const controller = new AbortController()
    setTimeout(() => controller.abort(new Error('Greeting timeout')), 20)
    await expect(plain(server, { signal: controller.signal })).rejects.toThrow('Greeting timeout')
    expect(server.closed).toBe(1)
  })

  test('does not open a socket when the signal is already aborted', async () => {
    const server = fakeServer()
    const signal = AbortSignal.abort(new Error('Too late'))
    await expect(plain(server, { signal })).rejects.toThrow('Too late')
    expect(server.sockets).toEqual([])
  })
})

describe('EHLO and HELO', () => {
  test('falls back to HELO when EHLO is refused', async () => {
    const server = fakeServer({ EHLO: '502 5.5.1 Command not implemented\r\n' })
    const client = await plain(server, { name: 'client.example.com' })
    expect(client.extensions).toEqual([])
    expect(server.commands).toEqual(['EHLO client.example.com', 'HELO client.example.com'])
  })

  test('fails when both EHLO and HELO are refused', async () => {
    const server = fakeServer({
      EHLO: '502 5.5.1 Command not implemented\r\n',
      HELO: '501 5.5.4 Syntax error\r\n',
    })
    const error = await failure(plain(server))
    expect(error.code).toBe('EPROTOCOL')
    expect(error.command).toBe('HELO')
    expect(error.responseCode).toBe(501)
  })

  test('treats a 421 reply to EHLO as the server closing, without trying HELO', async () => {
    const server = fakeServer({ EHLO: '421 4.3.2 Service shutting down\r\n' })
    const error = await failure(plain(server))
    expect(error.code).toBe('ECONNECTION')
    expect(error.command).toBe('EHLO')
    expect(error.responseCode).toBe(421)
    expect(server.commands).toHaveLength(1)
  })

  test('does not fall back to HELO when STARTTLS is required', async () => {
    const server = fakeServer({ EHLO: '502 5.5.1 Command not implemented\r\n' })
    const error = await failure(
      Smtp.connect({ connect: server.connect, host: 'mx.example.com', secure: 'starttls' }),
    )
    expect(error.code).toBe('ETLS')
    expect(error.command).toBe('EHLO')
    expect(error.responseCode).toBe(502)
    expect(server.commands.some((line) => line.startsWith('HELO'))).toBe(false)
  })

  test('assembles a multi-line EHLO reply that arrives in several chunks', async () => {
    const server = fakeServer({
      EHLO: (_, connection) => {
        connection.write('250-test\r\n250-PIPELINING\r\n')
        setTimeout(() => connection.write('250 SIZE 1000\r\n'), 0)
      },
    })
    const client = await plain(server)
    expect(client.extensions).toEqual(['PIPELINING', 'SIZE 1000'])
  })

  test('assembles a reply sent one byte at a time', async () => {
    const server = fakeServer({
      EHLO: (_, connection) => {
        for (const chunk of chunked(encode('250-first\r\n250-second\r\n250 third\r\n'), 1)) {
          connection.write(chunk)
        }
      },
    })
    const client = await plain(server)
    expect(client.extensions).toEqual(['second', 'third'])
  })

  test('reads a UTF-8 EHLO reply and still finds the extensions', async () => {
    const server = fakeServer({
      EHLO: '250-mail.example.com Привет\r\n250-PIPELINING\r\n250 SIZE 10485760\r\n',
    })
    const client = await plain(server)
    expect(client.extensions).toEqual(['PIPELINING', 'SIZE 10485760'])
  })

  test('skips a stray empty line before the greeting and after the EHLO reply', async () => {
    const server = fakeServer({
      greeting: '\r\n220 test ESMTP\r\n',
      EHLO: '250-test\r\n250 PIPELINING\r\n\r\n',
    })
    const client = await plain(server)
    const result = await client.send({ from: 'a@example.com', to: 'b@example.com', message: 'hi' })
    expect(result.accepted).toEqual(['b@example.com'])
  })

  test('sends LHLO in LMTP mode and reports a refusal', async () => {
    const server = fakeServer({ LHLO: '500 5.5.1 Command unrecognized\r\n' })
    const error = await failure(plain(server, { lmtp: true }))
    expect(error.code).toBe('EPROTOCOL')
    expect(error.command).toBe('LHLO')
    expect(server.commands).toEqual(['LHLO [127.0.0.1]'])
  })
})

describe('reading replies', () => {
  test('reads a long multi-line reply in linear time', async () => {
    const lines = 30_000
    let reply = ''
    for (let i = 0; i < lines; i++) reply += `250-capability line ${i}\r\n`
    const server = fakeServer({ EHLO: `${reply}250 DONE\r\n` })
    const started = performance.now()
    const client = await plain(server)
    expect(client.extensions).toHaveLength(lines)
    expect(performance.now() - started).toBeLessThan(3000)
  })

  test('fails when a reply exceeds 1 MiB, however it is split', async () => {
    const reply = `${'250-capability line padded out to some length\r\n'.repeat(25_000)}250 DONE\r\n`
    for (const size of [reply.length, 500]) {
      const server = fakeServer({
        EHLO: (_, connection) => {
          for (const chunk of chunked(encode(reply), size)) connection.write(chunk)
        },
      })
      const error = await failure(plain(server))
      expect(error.code).toBe('EPROTOCOL')
    }
  })

  test('does not count separate replies toward the limit', async () => {
    const big = `${'250-capability line padded out to some length\r\n'.repeat(15_000)}250 DONE\r\n`
    const server = fakeServer({
      EHLO: big,
      MAIL: big,
      RCPT: big,
      DATA: `${'354-go\r\n'.repeat(80_000)}354 go\r\n`,
    })
    const client = await plain(server)
    const result = await client.send({ from: 'a@example.com', to: 'b@example.com', message: 'hi' })
    expect(result.accepted).toEqual(['b@example.com'])
  })

  test('fails on a line that never ends, in linear time', async () => {
    const server = fakeServer({
      greeting: (_, connection) => {
        const chunk = encode('x'.repeat(16))
        for (let i = 0; i < 65_600; i++) connection.write(chunk)
      },
    })
    const started = performance.now()
    const error = await failure(plain(server))
    expect(error.code).toBe('EPROTOCOL')
    expect(performance.now() - started).toBeLessThan(5000)
  })

  test('rejects a reply line without a status code', async () => {
    const server = fakeServer({ EHLO: 'no status code here\r\n' })
    const error = await failure(plain(server))
    expect(error.code).toBe('EPROTOCOL')
    expect(error.command).toBe('EHLO')
  })
})
