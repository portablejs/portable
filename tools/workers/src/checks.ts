// One check per package, run inside workerd by run.ts. Each check calls the package the way a
// Worker would and throws if the result is wrong. The conformance tests cover the behavior, so a
// check only needs to call each platform API that the package uses: streams, CompressionStream,
// crypto.subtle, getRandomValues, timers, TextDecoder labels and MessageChannel.
import * as Arc from '@portable/arc'
import * as Base64 from '@portable/base64'
import * as Bytes from '@portable/bytes'
import * as Charset from '@portable/charset'
import { shiftJis } from '@portable/charset/shift_jis'
import * as Compress from '@portable/compress'
import * as Csv from '@portable/csv'
import * as Dkim from '@portable/dkim'
import * as Dmarc from '@portable/dmarc'
import * as Dns from '@portable/dns'
import * as DnsPacket from '@portable/dns-packet'
import * as Exif from '@portable/exif'
import * as Idna from '@portable/idna'
import * as ImageSize from '@portable/image-size'
import * as Ip from '@portable/ip'
import * as JsonStream from '@portable/json-stream'
import * as Jsonl from '@portable/jsonl'
import * as Lines from '@portable/lines'
import * as Mail from '@portable/mail'
import * as MailAuth from '@portable/mail-auth'
import * as MimeHeaders from '@portable/mime-headers'
import * as MimeStream from '@portable/mime-stream'
import * as OAuth1 from '@portable/oauth1'
import * as Password from '@portable/password'
import * as Png from '@portable/png'
import * as Queue from '@portable/queue'
import * as QuotedPrintable from '@portable/quoted-printable'
import * as Random from '@portable/random'
import * as RateLimit from '@portable/rate-limit'
import * as Rdap from '@portable/rdap'
import * as Rpc from '@portable/rpc'
import * as Smtp from '@portable/smtp'
import * as Spf from '@portable/spf'
import * as Sse from '@portable/sse'
import * as Streams from '@portable/streams'
import * as Timers from '@portable/timers'
import * as WebCrypto from '@portable/web-crypto'
import * as WebPush from '@portable/web-push'
import * as Webhooks from '@portable/webhooks'
import * as WebSockets from '@portable/websockets'

const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes)

function equal(actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual)
  const b = JSON.stringify(expected)
  if (a !== b) throw new Error(`Expected ${b}, got ${a}`)
}

function through<T>(chunks: readonly T[], ...transforms: TransformStream[]): Promise<unknown[]> {
  let stream: ReadableStream = Streams.fromIterable(chunks)
  for (const transform of transforms) stream = stream.pipeThrough(transform)
  return Streams.toArray(stream)
}

const message = 'From: a@example.com\r\nTo: b@example.com\r\nSubject: tere\r\n\r\nHello.\r\n'

// Returns the DKIM key, the SPF record and the DMARC record that the mail checks look up.
async function mailResolver() {
  const { privateKey, publicKey } = (await crypto.subtle.generateKey('Ed25519', true, [
    'sign',
    'verify',
  ])) as CryptoKeyPair
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', publicKey))
  const records: Record<string, string> = {
    'mail._domainkey.example.com': `v=DKIM1; k=ed25519; p=${Base64.encode(raw)}`,
    'example.com': 'v=spf1 ip4:192.0.2.0/24 -all',
    '_dmarc.example.com': 'v=DMARC1; p=reject',
  }
  const resolveTxt = async (name: string) => {
    const record = records[name]
    if (record === undefined) throw Object.assign(new Error(name), { code: 'ENOTFOUND' })
    return [[record]]
  }
  const none = async (name: string): Promise<never> => {
    throw Object.assign(new Error(name), { code: 'ENOTFOUND' })
  }
  const resolver = {
    resolveTxt,
    resolve4: none,
    resolve6: none,
    resolveMx: none,
    resolvePtr: none,
    resolveCname: none,
  }
  return { privateKey, resolver }
}

export const checks: Record<string, () => Promise<void> | void> = {
  async arc() {
    const { privateKey, resolver } = await mailResolver()
    const sealed = await Arc.seal(message, {
      domain: 'example.com',
      selector: 'mail',
      privateKey,
      authResults: 'example.com; spf=pass',
    })
    const result = await Arc.verify(sealed + message, { resolver })
    equal(result.result, 'pass')
  },
  base64() {
    equal(Base64.encode('hello'), 'aGVsbG8=')
    equal(text(Base64.decode('aGVsbG8=')), 'hello')
  },
  bytes() {
    equal(Bytes.toHex(Bytes.fromHex('000fff')), '000fff')
  },
  charset() {
    equal(Array.from(Charset.encode('あ', shiftJis)), [0x82, 0xa0])
  },
  async compress() {
    equal(text(await Compress.decode(await Compress.encode('hello world'))), 'hello world')
  },
  csv() {
    equal(Csv.decode(Csv.encode([['a', 'b,c']])), [['a', 'b,c']])
  },
  async dkim() {
    const { privateKey, resolver } = await mailResolver()
    const field = await Dkim.sign(message, { domain: 'example.com', selector: 'mail', privateKey })
    const [result] = await Dkim.verify(field + message, { resolver })
    equal(result?.result, 'pass')
  },
  async dmarc() {
    const { resolver } = await mailResolver()
    const result = await Dmarc.check(
      { from: 'example.com', spf: { result: 'pass', domain: 'example.com' }, dkim: [] },
      { resolver },
    )
    equal(result.result, 'pass')
  },
  dns() {
    equal(Dns.isNotFound(Object.assign(new Error(), { code: 'ENOTFOUND' })), true)
  },
  dnsPacket() {
    const packet = DnsPacket.encode({ id: 1, questions: [{ name: 'example.com', type: 'A' }] })
    equal(DnsPacket.decode(packet).questions[0]?.name, 'example.com')
  },
  exif() {
    // A JPEG with no APP1 segment has no Exif data.
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9])
    let threw = false
    try {
      Exif.parse(jpeg)
    } catch {
      threw = true
    }
    if (!threw && Exif.strip(jpeg).length !== jpeg.length) throw new Error('strip changed a JPEG')
  },
  idna() {
    equal(Idna.toAscii('Bücher.example'), 'xn--bcher-kva.example')
    equal(Idna.toUnicode('xn--bcher-kva.example'), 'bücher.example')
  },
  async imageSize() {
    const png = await Png.encode({ width: 3, height: 2, data: new Uint8Array(24) })
    const { width, height } = ImageSize.parse(png)
    equal([width, height], [3, 2])
  },
  ip() {
    equal(Ip.contains('10.0.0.0/8', '10.1.2.3'), true)
    equal(Ip.range('127.0.0.1'), 'loopback')
  },
  async jsonStream() {
    const bytes = await Streams.toBytes(JsonStream.encodeStream({ rows: [1, 2] }))
    const values = await through([bytes], new JsonStream.DecoderStream({ paths: ['$.rows[*]'] }))
    equal(
      values.map((v) => (v as { value: unknown }).value),
      [1, 2],
    )
  },
  async jsonl() {
    const values = await through(
      [{ a: 1 }, 'b'],
      new Jsonl.EncoderStream(),
      new Jsonl.DecoderStream(),
    )
    equal(values, [{ a: 1 }, 'b'])
  },
  async lines() {
    equal(await through(['a\r', '\nb\nc'], new Lines.DecoderStream()), ['a', 'b', 'c'])
  },
  async mail() {
    const raw = await Streams.toText(
      Mail.encode({ from: 'a@example.com', to: 'b@example.com', subject: 'tere', text: 'Hello.' }),
    )
    if (!raw.includes('Subject: tere')) throw new Error(raw)
  },
  async mailAuth() {
    const { privateKey, resolver } = await mailResolver()
    const field = await Dkim.sign(message, { domain: 'example.com', selector: 'mail', privateKey })
    const result = await MailAuth.authenticate(field + message, {
      authservId: 'mx.example.net',
      ip: '192.0.2.1',
      sender: 'a@example.com',
      helo: 'mail.example.com',
      resolver,
    })
    equal(result.dmarc?.result, 'pass')
  },
  mimeHeaders() {
    equal(MimeHeaders.parseValue('text/plain; charset=utf-8'), {
      value: 'text/plain',
      params: { charset: 'utf-8' },
    })
  },
  async mimeStream() {
    const input = new TextEncoder().encode(message)
    const output = await Streams.toBytes(
      Streams.fromIterable([input])
        .pipeThrough(new MimeStream.DecoderStream())
        .pipeThrough(new MimeStream.EncoderStream()),
    )
    equal(text(output), message)
  },
  async oauth1() {
    const signed = await OAuth1.sign(new Request('https://api.example.com/'), {
      consumer: { key: 'key', secret: 'secret' },
    })
    if (!signed.headers.get('authorization')?.startsWith('OAuth ')) throw new Error('unsigned')
  },
  async password() {
    const stored = await Password.hash('hunter2', { iterations: 100_000 })
    equal(await Password.verify('hunter2', stored), true)
  },
  async png() {
    const data = new Uint8Array(16).fill(200)
    const decoded = await Png.decode(await Png.encode({ width: 2, height: 2, data }))
    equal(Array.from(decoded.data), Array.from(data))
  },
  async queue() {
    equal(await Queue.map([1, 2, 3], async (n) => n * 2, { concurrency: 2 }), [2, 4, 6])
  },
  quotedPrintable() {
    equal(text(QuotedPrintable.decode(QuotedPrintable.encode('tere jõgeva'))), 'tere jõgeva')
  },
  random() {
    const n = Random.int(1, 6)
    if (n < 1 || n > 6) throw new Error(String(n))
    equal(Random.string(21).length, 21)
  },
  async rateLimit() {
    const limiter = RateLimit.create({ limit: 1, period: 60_000 })
    equal((await limiter.take('a')).allowed, true)
    equal((await limiter.take('a')).allowed, false)
  },
  async rdap() {
    const json = { objectClassName: 'domain', ldhName: 'example.com' }
    const result = await Rdap.domain('example.com', {
      fetch: async (request) => {
        const url = new URL(request.url)
        if (url.hostname === 'data.iana.org')
          return Response.json({ services: [[['com'], ['https://rdap.example/']]] })
        return Response.json(json, { headers: { 'content-type': 'application/rdap+json' } })
      },
    })
    equal(result.name, 'example.com')
  },
  async rpc() {
    const { port1, port2 } = new MessageChannel()
    Rpc.provide(Rpc.port(port1), { add: (a: number, b: number) => a + b })
    const remote = Rpc.connect<{ add(a: number, b: number): number }>(Rpc.port(port2))
    equal(await remote.add(1, 2), 3)
    port1.close()
    port2.close()
  },
  smtp() {
    if (typeof Smtp.send !== 'function') throw new Error('Smtp.send is missing')
  },
  async spf() {
    const { resolver } = await mailResolver()
    const result = await Spf.check({ ip: '192.0.2.1', sender: 'a@example.com' }, { resolver })
    equal(result.result, 'pass')
  },
  async sse() {
    const events = await through(
      [{ data: 'a' }, { event: 'b', data: 'c\nd' }],
      new Sse.EncoderStream(),
      new Sse.DecoderStream(),
    )
    equal(
      events.map((e) => (e as Sse.Event).data),
      ['a', 'c\nd'],
    )
  },
  async streams() {
    const upper = Streams.map((chunk: string) => chunk.toUpperCase())
    equal(await Streams.toText(Streams.fromIterable(['a', 'b']).pipeThrough(upper)), 'AB')
    equal(await (await Streams.toBlob(['a', new Uint8Array([98])])).text(), 'ab')
  },
  async timers() {
    let calls = 0
    const value = await Timers.retry(
      () => {
        if (++calls < 3) throw new Error('again')
        return 'ok'
      },
      { delay: 1 },
    )
    equal([value, calls], ['ok', 3])
    await Timers.sleep(1)
  },
  async webCrypto() {
    equal(
      Bytes.toHex(await WebCrypto.digest('SHA-256', 'hello')),
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    )
    const { publicKey } = await WebCrypto.importSeed('Ed25519', new Uint8Array(32))
    equal(publicKey.algorithm.name, 'Ed25519')
  },
  async webPush() {
    const keys = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
      'deriveBits',
    ])) as CryptoKeyPair
    const p256dh = new Uint8Array(await crypto.subtle.exportKey('raw', keys.publicKey))
    const subscription = {
      endpoint: 'https://push.example/1',
      keys: {
        p256dh: Base64.encode(p256dh, { alphabet: 'base64url' }),
        auth: 'AAAAAAAAAAAAAAAAAAAAAA',
      },
    }
    const body = await WebPush.encrypt({ subscription, payload: 'hello' })
    if (body.length < 86) throw new Error(`body is ${body.length} bytes`)
    const vapid = await WebPush.generateVapidKeys()
    if (typeof vapid.publicKey !== 'string') throw new Error('no VAPID public key')
  },
  async webhooks() {
    const body = '{"id":1}'
    const headers = await Webhooks.sign(body, { scheme: Webhooks.stripe, secret: 'whsec_test' })
    const request = new Request('https://example.com/', { method: 'POST', body, headers })
    const verified = await Webhooks.verify(request, {
      scheme: Webhooks.stripe,
      secret: 'whsec_test',
    })
    equal(verified.body, body)
  },
  async websockets() {
    const pair = new (
      globalThis as unknown as { WebSocketPair: new () => WebSocket[] }
    ).WebSocketPair()
    const [client, server] = [pair[0]!, pair[1]!]
    ;(server as unknown as { accept(): void }).accept()
    server.addEventListener('message', (event) => server.send(`echo ${event.data}`))
    ;(client as unknown as { accept(): void }).accept()
    const duplex = WebSockets.fromSocket(client)
    const writer = duplex.writable.getWriter()
    await writer.write('hi')
    const reader = duplex.readable.getReader()
    const { value } = await reader.read()
    equal(value, 'echo hi')
    reader.releaseLock()
    writer.releaseLock()
    client.close()
  },
}
