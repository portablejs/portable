import * as Dkim from '@portable/dkim'
import { beforeAll, describe, expect, test } from 'vite-plus/test'
import {
  base64,
  chunked,
  ed25519Record,
  fixture,
  fromBinary,
  importPrivate,
  privatePem,
  prng,
  referenceSign,
  resolverFrom,
  sha256,
  stream,
  tagsOf,
} from './utils.js'

let edPem: string
let ed: CryptoKey
let resolver: Dkim.Resolver

beforeAll(async () => {
  edPem = await privatePem('ed25519')
  ed = await importPrivate(edPem)
  resolver = resolverFrom({ 's._domainkey.example.com': [await ed25519Record()] })
})

const hashOf = async (text: string) => base64(await sha256(fromBinary(text)))

/** The `bh=` that `sign` writes for a body given as binary text, in the given chunks. */
async function bodyHash(
  body: string,
  c: 'relaxed' | 'simple',
  chunkSize?: number,
): Promise<string> {
  const message = fromBinary(`From: a@example.com\r\n\r\n${body}`)
  const input = chunkSize ? stream(chunked(message, chunkSize)) : message
  const field = await Dkim.sign(input, {
    domain: 'example.com',
    selector: 's',
    privateKey: edPem,
    canonicalization: `relaxed/${c}`,
  })
  return tagsOf(field).bh!
}

// RFC 6376 section 3.4.4 line by line, as mailauth's tests write it: a CR of a terminated line is
// part of the line ending, and any other CR is content.
function relaxedReference(body: string): string {
  const lines = body.split('\n')
  const last = lines.pop()!
  const canonical = (line: string) => line.replace(/[ \t]+/g, ' ').replace(/ $/, '')
  const out = lines.map((line) => canonical(line.replace(/\r$/, '')))
  out.push(canonical(last))
  while (out.length && out.at(-1) === '') out.pop()
  return out.length ? out.join('\r\n') + '\r\n' : ''
}

// RFC 6376 section 3.4.3 after every bare LF became CRLF.
function simpleReference(body: string): string {
  const crlf = body.replace(/(^|[^\r])\n/g, '$1\r\n').replace(/(^|[^\r])\n/g, '$1\r\n')
  return crlf.replace(/(\r\n)*$/, '') + '\r\n'
}

describe('relaxed body canonicalization (RFC 6376 section 3.4.4)', () => {
  test('hashes a body of empty lines as an empty body', async () => {
    expect(await bodyHash('\r\n\r\n\n\r\n\r\n', 'relaxed')).toBe(
      '47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=',
    )
  })

  test('hashes mailauth message1.eml as mailauth does, whole and byte by byte', async () => {
    const message = await fixture('message1.eml')
    for (const chunkSize of [undefined, 1, 7]) {
      const field = await Dkim.sign(chunkSize ? stream(chunked(message, chunkSize)) : message, {
        domain: 'example.com',
        selector: 's',
        privateKey: edPem,
      })
      expect(tagsOf(field).bh).toBe('D2H5TEwtUgM2u8Ew0gG6vnt/Na6L+Zep7apmSmfy8IQ=')
    }
  })

  test("hashes nodemailer's sample message with LF line endings as nodemailer does", async () => {
    const message =
      'From: saatja aadress\nTo: Saaja aadress\nSubject: pealkiri\n  mitmel\n  real\nMessage-Id: test\n\ntere tere\nteine rida\n'
    const field = await Dkim.sign(message, {
      domain: 'node.ee',
      selector: 'dkim',
      privateKey: edPem,
    })
    expect(tagsOf(field).bh).toBe('h2JdEKA6yVYSGuI3DQCDlg2KL+96GxA7Yw7owvsYDUM=')
  })

  for (const [name, body, expected] of [
    ['a trailing space on an unterminated last line', 'abc ', 'abc\r\n'],
    ['a space only unterminated last line', 'abc\r\n ', 'abc\r\n'],
    ['a CR at the end of the body as content', 'abc\r', 'abc\r\r\n'],
    ['a CR before the line ending CR as content', 'abc\r\r\n', 'abc\r\r\n'],
    ['whitespace before a content CR as a space', ' \r', ' \r\r\n'],
    ['whitespace between a content CR and the line ending as trailing', 'a\r \r\n', 'a\r\r\n'],
    ['a body of a single CR', '\r', '\r\r\n'],
    ['a lone CR after a line break as content, not an empty line', 'a\r\n\r', 'a\r\n\r\r\n'],
    [
      'leading whitespace as one space',
      '\r\n Hello\r\nWorld\r\nContent\there\r\nEnd\r\n',
      '\r\n Hello\r\nWorld\r\nContent here\r\nEnd\r\n',
    ],
    ['only SP and HTAB as whitespace', 'a\xa0 b\x0b\r\n', 'a\xa0 b\x0b\r\n'],
    ['a body without a final line break', 'abc', 'abc\r\n'],
  ]) {
    test(`handles ${name}`, async () => {
      expect(await bodyHash(body!, 'relaxed')).toBe(await hashOf(expected!))
    })
  }

  test('gives the same hash for every split into two and three chunks (mailauth #115)', async () => {
    const body = '\r\n Hello\r\nWorld\r\nContent\there\r\nEnd\r\n'
    const expected = await bodyHash(body, 'relaxed')
    const message = fromBinary(`From: a@example.com\r\n\r\n${body}`)
    const start = message.length - body.length
    const sign = (chunks: Uint8Array[]) =>
      Dkim.sign(stream(chunks), { domain: 'example.com', selector: 's', privateKey: edPem })
    for (let i = start + 1; i < message.length - 1; i++) {
      for (let j = i + 1; j < message.length; j++) {
        const field = await sign([
          message.subarray(0, i),
          message.subarray(i, j),
          message.subarray(j),
        ])
        expect(tagsOf(field).bh).toBe(expected)
      }
    }
  })

  test('matches the line based reference for generated bodies in random chunks', async () => {
    const random = prng(20260902)
    const pick = (n: number) => Math.floor(random() * n)
    const alphabet = ['a', 'b', ' ', ' ', '\t', '\r\n', '\r\n', '\n', '\r']
    for (let i = 0; i < 300; i++) {
      let body = ''
      for (let j = pick(24); j > 0; j--) body += alphabet[pick(alphabet.length)]
      const expected = await hashOf(relaxedReference(body))
      expect({ body, hash: await bodyHash(body, 'relaxed', 1 + pick(5)) }).toEqual({
        body,
        hash: expected,
      })
    }
  })
})

describe('simple body canonicalization (RFC 6376 section 3.4.3)', () => {
  test('hashes a body of empty lines as one CRLF', async () => {
    expect(await bodyHash('\r\n\r\n\n\r\n\r\n', 'simple')).toBe(
      'frcCV1k9oG9oKj3dpUqdJg1PxRT2RSN/XKdLCPjaYaY=',
    )
  })

  test('hashes mailauth message1.eml as mailauth does', async () => {
    const field = await Dkim.sign(await fixture('message1.eml'), {
      domain: 'example.com',
      selector: 's',
      privateKey: edPem,
      canonicalization: 'relaxed/simple',
    })
    expect(tagsOf(field).bh).toBe('GjyEkbey2OupCW5AKJv4dzTPsPHSaZjRDMqUSmhpTyQ=')
  })

  for (const body of [
    '',
    'abc',
    'abc\r\n',
    'abc\r\n\r\n\r\n',
    'abc\r',
    'abc\r\r\n',
    'abc\r\r',
    'a\r\n\r',
    '\r',
    '\r\r\n',
    'x\r\ny\r',
    'a\rb\r\n',
    'a\r\n\rb',
  ]) {
    test(`canonicalizes ${JSON.stringify(body)}`, async () => {
      const expected = await hashOf(simpleReference(body))
      expect(await bodyHash(body, 'simple')).toBe(expected)
      expect(await bodyHash(body, 'simple', 1)).toBe(expected)
    })
  }

  test('gives the same hash whatever the chunk boundaries are', async () => {
    for (const body of ['abc\r', 'a\r\n\r', 'abc\r\r\n', 'x\r\ny\r\r\n\r\n', 'a\rb\r\nc']) {
      const expected = await hashOf(simpleReference(body))
      for (const size of [1, 2, 3]) expect(await bodyHash(body, 'simple', size)).toBe(expected)
    }
  })
})

describe('line endings', () => {
  // mailauth's MessageParser cases: every bare LF is a line break of its own and becomes CRLF.
  for (const [body, expected] of [
    ['a\nb\n', 'a\r\nb\r\n'],
    ['a\n\nb', 'a\r\n\r\nb'],
    ['\nb', '\r\nb'],
    ['x\r\n\nb', 'x\r\n\r\nb'],
    ['x\r\n\n\nb', 'x\r\n\r\n\r\nb'],
    ['a\r\nb\n', 'a\r\nb\r\n'],
    ['a\r\n\r\nb', 'a\r\n\r\nb'],
    ['ab\n\n', 'ab\r\n\r\n'],
  ]) {
    test(`reads ${JSON.stringify(body)} as ${JSON.stringify(expected)}`, async () => {
      const hash = await hashOf(expected!.replace(/(\r\n)*$/, '') + '\r\n')
      for (const size of [undefined, 1, 2]) expect(await bodyHash(body!, 'simple', size)).toBe(hash)
    })
  }

  test('finds the end of the header section across chunk boundaries', async () => {
    const message = fromBinary('From: a@example.com\r\nSubject: x\r\n\r\nbody\r\n')
    const expected = await Dkim.sign(message, {
      domain: 'example.com',
      selector: 's',
      privateKey: edPem,
      signedAt: new Date(0),
    })
    for (const size of [1, 2, 3, 5])
      expect(
        await Dkim.sign(stream(chunked(message, size)), {
          domain: 'example.com',
          selector: 's',
          privateKey: edPem,
          signedAt: new Date(0),
        }),
      ).toBe(expected)
  })
})

describe('header canonicalization (RFC 6376 sections 3.4.1 and 3.4.2)', () => {
  const headers = ['From: Joe <joe@example.com>', 'Subject: a b']
  const sign = (c: string) =>
    referenceSign({
      headers,
      body: 'x\r\n',
      c,
      algorithm: 'ed25519-sha256',
      key: ed,
      prefix: `DKIM-Signature: v=1; a=ed25519-sha256; c=${c}; d=example.com; s=s; h=from:subject; bh=%BH%; b=`,
      names: ['from', 'subject'],
    })
  const verify = async (message: string) =>
    (await Dkim.verify(fromBinary(message), { resolver })).map((r) => r.result)

  for (const [name, changed] of [
    ['upper case name', 'SUBJECT: a b'],
    ['whitespace before the colon', 'Subject \t: a b'],
    ['whitespace after the colon', 'Subject:   a b'],
    ['a run of whitespace in the value', 'Subject: a \t  b'],
    ['trailing whitespace', 'Subject: a b \t'],
    ['a fold', 'Subject: a\r\n b'],
    ['a fold with a tab', 'Subject: a\r\n\t b \r\n '],
  ]) {
    test(`relaxed accepts ${name}, simple does not`, async () => {
      for (const [c, expected] of [
        ['relaxed/relaxed', 'pass'],
        ['simple/simple', 'fail'],
      ]) {
        const message = await sign(c!)
        expect(await verify(message.replace('Subject: a b', changed!))).toEqual([expected])
      }
    })
  }

  for (const [name, changed] of [
    ['a no-break space', 'Subject: a\xc2\xa0b'],
    ['a vertical tab', 'Subject: a\x0bb'],
    ['a value change', 'Subject: a c'],
    ['a removed space', 'Subject: ab'],
  ]) {
    test(`relaxed does not accept ${name}`, async () => {
      expect(
        await verify((await sign('relaxed/relaxed')).replace('Subject: a b', changed!)),
      ).toEqual(['fail'])
    })
  }

  test('hashes 8-bit header bytes as they are', async () => {
    const message = await referenceSign({
      headers: ['From: a@example.com', 'Subject: j\xf5geva \xe6\x97\xa5'],
      body: '',
      c: 'relaxed/relaxed',
      algorithm: 'ed25519-sha256',
      key: ed,
      prefix:
        'DKIM-Signature: v=1; a=ed25519-sha256; c=relaxed/relaxed; d=example.com; s=s; h=from:subject; bh=%BH%; b=',
      names: ['from', 'subject'],
    })
    expect(await verify(message)).toEqual(['pass'])
  })
})

describe('linear time', () => {
  const sign = (message: string) =>
    Dkim.sign(message, { domain: 'example.com', selector: 's', privateKey: edPem })

  // After mailauth's assert-linear helper: four times the input costs a linear implementation about
  // 4x and a quadratic one about 16x, so 8x separates them without a fixed time limit. The
  // fastest of five runs counts, which filters out GC pauses and other load.
  async function expectLinear(run: (size: number) => Promise<unknown>, small: number) {
    const time = async (size: number) => {
      let best = Infinity
      for (let i = 0; i < 5; i++) {
        const started = performance.now()
        await run(size)
        best = Math.min(best, performance.now() - started)
      }
      return best
    }
    await run(Math.ceil(small / 10))
    const smallMs = await time(small)
    const largeMs = await time(small * 4)
    expect(largeMs).toBeLessThan(smallMs * 8 + 100)
  }

  // nodemailer GHSA-39m8-27wv-hr27: unfolding was quadratic in the number of continuation lines.
  test('signs and verifies a header folded into many lines', { timeout: 60_000 }, async () => {
    const folded = (lines: number) =>
      `From: a@example.com\r\nTo: x@example.com,\r\n${' cont@example.com,\r\n'.repeat(lines)}Subject: x\r\n\r\nbody`
    const message = folded(10_000)
    const field = await sign(message)
    expect(tagsOf(field).h).toBe('Subject: To: From')
    expect((await Dkim.verify(field + message, { resolver }))[0]!.result).toBe('pass')
    await expectLinear(async (lines) => {
      const text = folded(lines)
      await Dkim.verify((await sign(text)) + text, { resolver })
    }, 10_000)
  })

  test('reads a field name with a long blank run', { timeout: 60_000 }, async () => {
    const blank = (size: number) =>
      `From: a@example.com\r\nA${' '.repeat(size)}B: value\r\n\r\nbody`
    const message = blank(256 * 1024)
    expect((await Dkim.verify((await sign(message)) + message, { resolver }))[0]!.result).toBe(
      'pass',
    )
    await expectLinear(async (size) => {
      const text = blank(size)
      await Dkim.verify((await sign(text)) + text, { resolver })
    }, 256 * 1024)
  })

  test('hashes a 10 MB line', async () => {
    const line = new Uint8Array(10 * 1024 * 1024).fill(0x61)
    for (let i = 0; i < line.length; i += 7) line[i] = 0x20
    const head = fromBinary('From: a@example.com\r\n\r\n')
    const field = await Dkim.sign(stream([head, line]), {
      domain: 'example.com',
      selector: 's',
      privateKey: edPem,
    })
    const canonical = new Uint8Array(line.length + 2)
    canonical.set(line)
    canonical.set([13, 10], line.length)
    expect(tagsOf(field).bh).toBe(base64(await sha256(canonical)))
  })
})
