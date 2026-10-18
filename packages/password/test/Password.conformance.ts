import { describe, expect, test } from 'vite-plus/test'
import * as Password from '@portable/password'
import pbkdf2Fixtures from './fixtures/pbkdf2.json?raw'
import { type Digest, fromHex, parsePhc, phc, tamper, utf8 } from './utils.js'

const fast = { iterations: 1000 }

describe('hash', () => {
  test('writes PBKDF2-SHA256 with 600,000 iterations, a 16-byte salt and a 32-byte hash', async () => {
    const stored = await Password.hash('hunter2')
    expect(stored).toMatch(/^\$pbkdf2-sha256\$i=600000\$[A-Za-z0-9+/]{22}\$[A-Za-z0-9+/]{43}$/)
    expect(await Password.verify('hunter2', stored)).toBe(true)
  })

  test('uses the given iterations', async () => {
    const stored = await Password.hash('hunter2', { iterations: 100_000 })
    expect(parsePhc(stored).iterations).toBe(100_000)
    expect(await Password.verify('hunter2', stored)).toBe(true)
  })

  test('uses a new salt every time', async () => {
    const hashes = await Promise.all(Array.from({ length: 8 }, () => Password.hash('same', fast)))
    expect(new Set(hashes.map((stored) => parsePhc(stored).salt.join())).size).toBe(8)
  })

  test('hashes an empty password', async () => {
    const stored = await Password.hash('', fast)
    expect(await Password.verify('', stored)).toBe(true)
    expect(await Password.verify(' ', stored)).toBe(false)
  })

  test('rejects iterations outside 1 to 2^32 - 1', async () => {
    for (const iterations of [0, -1, 1.5, Number.NaN, 2 ** 32, Infinity])
      await expect(Password.hash('x', { iterations })).rejects.toThrow(RangeError)
  })
})

describe('verify', () => {
  test('returns false for a wrong password', async () => {
    const stored = await Password.hash('hunter2', fast)
    expect(await Password.verify('hunter3', stored)).toBe(false)
    expect(await Password.verify('', stored)).toBe(false)
  })

  test('is case sensitive', async () => {
    const stored = await Password.hash('test', fast)
    expect(await Password.verify('TEST', stored)).toBe(false)
  })

  test('returns false when one bit of the stored hash changes', async () => {
    const stored = await Password.hash('hunter2', fast)
    expect(await Password.verify('hunter2', tamper(stored))).toBe(false)
  })

  test('uses every byte of a long password', async () => {
    const long = 'a'.repeat(100)
    const stored = await Password.hash(`${long}1`, fast)
    expect(await Password.verify(`${long}2`, stored)).toBe(false)
    expect(await Password.verify(long, stored)).toBe(false)
  })

  test('accepts the bytes of a password', async () => {
    const stored = await Password.hash('pässword', fast)
    expect(await Password.verify(utf8('pässword'), stored)).toBe(true)
  })

  test('verifies a password longer than the HMAC block as its SHA-256 digest', async () => {
    const long = utf8('.'.repeat(4096))
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', long))
    const stored = await Password.hash(long, fast)
    expect(await Password.verify(digest, stored)).toBe(true)
  })
})

describe('NFC normalization', () => {
  const composed = 'café'
  const decomposed = 'café'

  test('a string password matches its other Unicode forms', async () => {
    const stored = await Password.hash(decomposed, fast)
    expect(await Password.verify(composed, stored)).toBe(true)
    expect(await Password.verify(utf8(composed), stored)).toBe(true)
  })

  test('bytes are hashed without normalization', async () => {
    const stored = await Password.hash(utf8(decomposed), fast)
    expect(await Password.verify(utf8(decomposed), stored)).toBe(true)
    expect(await Password.verify(decomposed, stored)).toBe(false)
  })
})

describe('maxBytes', () => {
  test('accepts 4096 bytes by default and rejects more', async () => {
    const stored = await Password.hash('.'.repeat(4096), fast)
    expect(await Password.verify('.'.repeat(4096), stored)).toBe(true)
    const error = await Password.hash('.'.repeat(4097), fast).catch((error: unknown) => error)
    expect(error).toBeInstanceOf(Password.MaxBytesError)
    expect(error).toMatchObject({ maxBytes: 4096 })
    await expect(Password.verify('.'.repeat(4097), stored)).rejects.toThrow(Password.MaxBytesError)
  })

  test('counts UTF-8 bytes after normalization', async () => {
    const twoBytes = 'é'.repeat(5)
    await expect(Password.hash(twoBytes, { ...fast, maxBytes: 9 })).rejects.toThrow(
      Password.MaxBytesError,
    )
    const stored = await Password.hash(twoBytes, { ...fast, maxBytes: 10 })
    expect(await Password.verify('é'.repeat(5), stored, { maxBytes: 10 })).toBe(true)
  })

  test('applies to bytes', async () => {
    await expect(Password.hash(new Uint8Array(11), { ...fast, maxBytes: 10 })).rejects.toThrow(
      Password.MaxBytesError,
    )
  })

  test('can be turned off', async () => {
    const huge = 'x'.repeat(100_000)
    const stored = await Password.hash(huge, { ...fast, maxBytes: Infinity })
    expect(await Password.verify(huge, stored, { maxBytes: Infinity })).toBe(true)
  })
})

describe('signal', () => {
  test('an aborted signal rejects hash and verify with its reason', async () => {
    const stored = await Password.hash('x', fast)
    const reason = new Error('stop')
    const signal = AbortSignal.abort(reason)
    await expect(Password.hash('x', { ...fast, signal })).rejects.toBe(reason)
    await expect(Password.verify('x', stored, { signal })).rejects.toBe(reason)
  })

  test('aborting while the hash is derived rejects before it finishes', async () => {
    const controller = new AbortController()
    const reason = new Error('stop')
    const pending = Password.hash('x', { iterations: 2_000_000, signal: controller.signal })
    controller.abort(reason)
    await expect(pending).rejects.toBe(reason)
  })

  test('a signal that is never aborted changes nothing', async () => {
    const { signal } = new AbortController()
    const stored = await Password.hash('x', { ...fast, signal })
    expect(await Password.verify('x', stored, { signal })).toBe(true)
  })
})

describe('needsRehash', () => {
  test('is false for a hash written with the defaults', async () => {
    expect(Password.needsRehash(await Password.hash('x'))).toBe(false)
  })

  test('compares iterations with the given minimum', async () => {
    const stored = await Password.hash('x', { iterations: 100_000 })
    expect(Password.needsRehash(stored)).toBe(true)
    expect(Password.needsRehash(stored, { iterations: 100_000 })).toBe(false)
    expect(Password.needsRehash(stored, { iterations: 99_999 })).toBe(false)
    expect(Password.needsRehash(stored, { iterations: 100_001 })).toBe(true)
  })

  test('is true for SHA-1 and SHA-512 hashes', () => {
    const salt = new Uint8Array(16)
    expect(Password.needsRehash(phc('sha1', 600_000, salt, new Uint8Array(32)))).toBe(true)
    expect(Password.needsRehash(phc('sha512', 600_000, salt, new Uint8Array(64)))).toBe(true)
  })

  test('is true for a short salt or hash', () => {
    expect(
      Password.needsRehash(phc('sha256', 600_000, new Uint8Array(8), new Uint8Array(32))),
    ).toBe(true)
    expect(
      Password.needsRehash(phc('sha256', 600_000, new Uint8Array(16), new Uint8Array(20))),
    ).toBe(true)
  })

  test('throws on a malformed hash', () => {
    expect(() => Password.needsRehash('$pbkdf2-sha256$i=0$c2FsdA$aGFzaA')).toThrow(
      Password.InvalidInputError,
    )
  })
})

describe('stored hash format', () => {
  const salt = 'c2FsdA'
  const hash = 'Eg+2z/z4syxD5yJSVsT4N6hlSMkszDVICAWYfLcL4Xs'

  test('reads the PHC format with an optional l= parameter', async () => {
    expect(await Password.verify('password', `$pbkdf2-sha256$i=1$${salt}$${hash}`)).toBe(true)
    expect(await Password.verify('password', `$pbkdf2-sha256$i=1,l=32$${salt}$${hash}`)).toBe(true)
  })

  test("reads passlib's format, with bare rounds and . for +", async () => {
    const passlib = `$pbkdf2-sha256$1$${salt}$${hash.replaceAll('+', '.')}`
    expect(await Password.verify('password', passlib)).toBe(true)
  })

  test('reads an empty salt', async () => {
    const stored = phc(
      'sha256',
      1,
      '',
      fromHex('c1232f10f62715fda06ae7c0a2037ca19b33cf103b727ba56d870c11f290a2ab'),
    )
    expect(await Password.verify('password', stored)).toBe(true)
  })

  const malformed = {
    'zero-padded rounds (passlib)': `$pbkdf2-sha256$01212$${salt}$${hash}`,
    'empty rounds (passlib)': `$pbkdf2-sha256$$${salt}$${hash}`,
    'too many fields (passlib)': `$pbkdf2-sha256$1212$${salt}$${hash}$`,
    'too few fields': `$pbkdf2-sha256$i=1$${hash}`,
    'zero iterations': `$pbkdf2-sha256$i=0$${salt}$${hash}`,
    'negative iterations': `$pbkdf2-sha256$i=-1$${salt}$${hash}`,
    'iterations above 2^32 - 1': `$pbkdf2-sha256$i=4294967296$${salt}$${hash}`,
    'non-numeric iterations': `$pbkdf2-sha256$i=NaN$${salt}$${hash}`,
    'unknown parameter': `$pbkdf2-sha256$i=1,x=2$${salt}$${hash}`,
    'l= different from the hash length': `$pbkdf2-sha256$i=1,l=16$${salt}$${hash}`,
    'empty hash': `$pbkdf2-sha256$i=1$${salt}$`,
    padding: `$pbkdf2-sha256$i=1$${salt}$${hash}=`,
    'a character outside base64': `$pbkdf2-sha256$i=1$${salt}$${hash.replace('E', '!')}`,
    whitespace: `$pbkdf2-sha256$i=1$${salt}$ ${hash}`,
    'base64 of impossible length': `$pbkdf2-sha256$i=1$${salt}$${hash}AA`,
    'no leading $': `pbkdf2-sha256$i=1$${salt}$${hash}`,
    'uppercase identifier': `$PBKDF2-SHA256$i=1$${salt}$${hash}`,
    'empty string': '',
    'plain text': 'password',
  }

  for (const [name, stored] of Object.entries(malformed)) {
    test(`throws InvalidInputError for ${name}`, async () => {
      await expect(Password.verify('password', stored)).rejects.toThrow(Password.InvalidInputError)
    })
  }

  const foreign = {
    bcrypt: '$2b$12$R9h/cIPz0gi.URNNX3kh2OPST9/PgBkqquzi.Ss7KIUgO2t0jWMUW',
    argon2id: '$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHQ$RdescudvJCsgt3ub+b+dWRWJTmaaJObG',
    scrypt:
      '$scrypt$ln=16,r=8,p=1$aM15713r3Xsvxbi31lqr1Q$nFNh2CVHVjNldFVKDHDlm4CbdRSCdEBsjjJxD+iCs5E',
    'SHA-384 PBKDF2': `$pbkdf2-sha384$i=1$${salt}$${hash}`,
    'SHA-512 crypt':
      '$6$saltsalt$qFmFH.bQmmtXzyBY0s9v7Oicd2z4XSIecDzlB5KiA2/jctKu9YterLp8wwnSq.qc.eoxqOmSuNp2xS0ktL3nh/',
  }

  for (const [name, stored] of Object.entries(foreign)) {
    test(`throws UnsupportedError for a ${name} hash`, async () => {
      await expect(Password.verify('password', stored)).rejects.toThrow(Password.UnsupportedError)
      expect(() => Password.needsRehash(stored)).toThrow(Password.UnsupportedError)
    })
  }
})

// RFC 6070 §2. The 16,777,216-iteration vector is in Password.test.ts, which runs only in Node.
describe('RFC 6070 (PBKDF2-HMAC-SHA1)', () => {
  const vectors: [string, string, number, string][] = [
    ['password', 'salt', 1, '0c60c80f961f0e71f3a9b524af6012062fe037a6'],
    ['password', 'salt', 2, 'ea6c014dc72d6f8ccd1ed92ace1d41f0d8de8957'],
    ['password', 'salt', 4096, '4b007901b765489abead49d926f721d065a429c1'],
    [
      'passwordPASSWORDpassword',
      'saltSALTsaltSALTsaltSALTsaltSALTsalt',
      4096,
      '3d2eec4fe41c849b80c8d83662c0e44a8b291a964cf2f07038',
    ],
    ['pass\0word', 'sa\0lt', 4096, '56fa6aa75548099dcc37d7f03425e0c3'],
  ]

  for (const [password, salt, iterations, expected] of vectors) {
    test(`${JSON.stringify(password)}, ${JSON.stringify(salt)}, c=${iterations}`, async () => {
      const stored = phc('sha1', iterations, salt, fromHex(expected))
      expect(await Password.verify(password, stored)).toBe(true)
      expect(await Password.verify(`${password}x`, stored)).toBe(false)
    })
  }
})

describe('RFC 7914 §11 (PBKDF2-HMAC-SHA256)', () => {
  const vectors: [string, string, number, string][] = [
    [
      'passwd',
      'salt',
      1,
      '55ac046e56e3089fec1691c22544b605f94185216dde0465e68b9d57c20dacbc49ca9cccf179b645991664b39d77ef317c71b845b1e30bd509112041d3a19783',
    ],
    [
      'Password',
      'NaCl',
      80000,
      '4ddcd8f60b98be21830cee5ef22701f9641a4418d04c0414aeff08876b34ab56a1d425a1225833549adb841b51c9b3176a272bdebba1d078478f62b397f33c8d',
    ],
  ]

  for (const [password, salt, iterations, expected] of vectors) {
    test(`${password}, ${salt}, c=${iterations}, dkLen=64`, async () => {
      const stored = phc('sha256', iterations, salt, fromHex(expected))
      expect(await Password.verify(password, stored)).toBe(true)
      expect(await Password.verify(password.toLowerCase() + '!', stored)).toBe(false)
    })
  }
})

// passlib 1.7.4, passlib/tests/test_handlers_pbkdf2.py (BSD licensed).
describe('passlib', () => {
  const wav = 'Ιωαννης'
  const known: [string, string, string][] = [
    ['pbkdf2_sha1', 'password', '$pbkdf2$1212$OB.dtnSEXZK8U5cgxU/GYQ$y5LKPOplRmok7CZp/aqVDVg8zGI'],
    ['pbkdf2_sha1', wav, '$pbkdf2$1212$THDqatpidANpadlLeTeOEg$HV3oi1k5C5LQCgG1BMOL.BX4YZc'],
    [
      'pbkdf2_sha256',
      'password',
      '$pbkdf2-sha256$1212$4vjV83LKPjQzk31VI4E0Vw$hsYF68OiOUPdDZ1Fg.fJPeq1h/gXXY7acBp9/6c.tmQ',
    ],
    [
      'pbkdf2_sha256',
      wav,
      '$pbkdf2-sha256$1212$3SABFJGDtyhrQMVt1uABPw$WyaUoqCLgvz97s523nF4iuOqZNbp5Nt8do/cuaa7AiI',
    ],
    [
      'pbkdf2_sha512',
      'password',
      '$pbkdf2-sha512$1212$RHY0Fr3IDMSVO/RSZyb5ow$eNLfBK.eVozomMr.1gYa17k9B7KIK25NOEshvhrSX.esqY3s.FvWZViXz4KoLlQI.BzY/YTNJOiKc5gBYFYGww',
    ],
    [
      'pbkdf2_sha512',
      wav,
      '$pbkdf2-sha512$1212$KkbvoKGsAIcF8IslDR6skQ$8be/PRmd88Ps8fmPowCJttH9G3vgxpG.Krjt3KT.NP6cKJ0V4Prarqf.HBwz0dCkJ6xgWnSj2ynXSV7MlvMa8Q',
    ],
  ]

  for (const [handler, password, stored] of known) {
    test(`${handler} known hash of ${JSON.stringify(password)}`, async () => {
      expect(await Password.verify(password, stored)).toBe(true)
      expect(await Password.verify(password.toUpperCase() + 'x', stored)).toBe(false)
    })
  }

  test('a passlib hash needs a rehash', () => {
    expect(Password.needsRehash(known[2]![2])).toBe(true)
  })
})

// pbkdf2 3.1.7, test/fixtures.json (MIT, Daniel Cousens), checked through verify.
describe('pbkdf2 fixtures', () => {
  type Fixture = {
    description?: string
    key?: string
    keyHex?: string
    keyUint8Array?: number[]
    keyInt32Array?: number[]
    keyFloat64Array?: number[]
    salt?: string
    saltHex?: string
    saltUint8Array?: number[]
    saltInt32Array?: number[]
    saltFloat64Array?: number[]
    iterations: number
    dkLen: number
    results: Record<string, string>
  }
  const { valid }: { valid: Fixture[] } = JSON.parse(pbkdf2Fixtures)

  const bytes = (
    text: string | undefined,
    hex: string | undefined,
    u8: number[] | undefined,
    i32: number[] | undefined,
    f64: number[] | undefined,
  ): Uint8Array => {
    if (hex !== undefined) return fromHex(hex)
    if (u8) return new Uint8Array(u8)
    if (i32) return new Uint8Array(new Int32Array(i32).buffer)
    if (f64) return new Uint8Array(new Float64Array(f64).buffer)
    return utf8(text!)
  }

  for (const [index, f] of valid.entries()) {
    const password = bytes(f.key, f.keyHex, f.keyUint8Array, f.keyInt32Array, f.keyFloat64Array)
    const salt = bytes(f.salt, f.saltHex, f.saltUint8Array, f.saltInt32Array, f.saltFloat64Array)
    for (const digest of ['sha1', 'sha256', 'sha512'] satisfies Digest[]) {
      test(`#${index} ${digest}, c=${f.iterations}, dkLen=${f.dkLen}`, async () => {
        const stored = phc(digest, f.iterations, salt, fromHex(f.results[digest]!))
        expect(await Password.verify(password, stored)).toBe(true)
      })
    }
  }
})

// pbkdf2-password 1.2.1, test.js (MIT, Matteo Collina): SHA-1, 10,000 iterations, 128 bytes.
describe('pbkdf2-password', () => {
  test('verifies a known hash once its salt and hash are in a PHC string', async () => {
    const salt =
      'PvZ+QeDTsLo8+Jqgwqre90rSpxDhvWvvE4uiOnzQ2a1HhjEQxoIDItMIJ3jk+MrQI+hVQlUI9lRSw4qNQxNCzA=='
    const hash =
      '2ukNWdhk271vZcyKl4/iKLaw6EZ8/gZrv56/b2MXHMJSN+9522FvfryTsJsAWlXRncYDiQMudckbsJ6BfSGi7FeUwcuseO4rzTwk3tnNjzxjmayqLyCzuwNF5uS7aAwAX4878CesxlZds7mSRbZ3fYqoJzGjL1pmB8RA9lLX+DQ='
    const stored = `$pbkdf2$i=10000$${salt.replace(/=+$/, '')}$${hash.replace(/=+$/, '')}`
    expect(await Password.verify('helloworld', stored)).toBe(true)
    expect(await Password.verify('helloworld!', stored)).toBe(false)
    expect(Password.needsRehash(stored)).toBe(true)
  })
})
