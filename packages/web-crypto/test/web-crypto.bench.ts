import * as nodeCrypto from 'node:crypto';
import { ed25519 } from '@noble/curves/ed25519.js';
import { p256 } from '@noble/curves/nist.js';
import { hkdf as nobleHkdf } from '@noble/hashes/hkdf.js';
import { hmac as nobleHmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { derToJose, joseToDer } from 'ecdsa-sig-formatter';
import { expect, test } from 'vite-plus/test';
import * as WebCrypto from '@portable/web-crypto';

// node:crypto and @noble/hashes are synchronous and skip WebCrypto's per-call promise and copy,
// so on Node they beat any crypto.subtle call on small input. They are measured for reference.
// The 25% assertions compare each helper with the crypto.subtle calls it replaces.

const body = new Uint8Array(nodeCrypto.randomBytes(1024));
const large = new Uint8Array(nodeCrypto.randomBytes(1024 * 1024));
const secret = 'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw';
const encoder = new TextEncoder();

test('digest hashes 1 KB within 25% of crypto.subtle.digest', async ({ bench }) => {
  const result = await bench.compare(
    bench('@portable/web-crypto', async () => {
      await WebCrypto.digest('SHA-256', body);
    }),
    bench('crypto.subtle', async () => {
      new Uint8Array(await crypto.subtle.digest('SHA-256', body));
    }),
    bench('@noble/hashes', () => {
      sha256(body);
    }),
    bench('node:crypto', () => {
      nodeCrypto.createHash('sha256').update(body).digest();
    }),
  );
  expect(result.get('crypto.subtle')).not.toBeFasterThan(result.get('@portable/web-crypto'), {
    delta: 0.25,
  });
});

test('digest hashes 1 MB within 25% of crypto.subtle.digest', async ({ bench }) => {
  const result = await bench.compare(
    bench('@portable/web-crypto', async () => {
      await WebCrypto.digest('SHA-256', large);
    }),
    bench('crypto.subtle', async () => {
      new Uint8Array(await crypto.subtle.digest('SHA-256', large));
    }),
    bench('@noble/hashes', () => {
      sha256(large);
    }),
  );
  expect(result.get('crypto.subtle')).not.toBeFasterThan(result.get('@portable/web-crypto'), {
    delta: 0.25,
  });
});

test('hmac signs 1 KB with a string key within 25% of crypto.subtle', async ({ bench }) => {
  const result = await bench.compare(
    bench('@portable/web-crypto', async () => {
      await WebCrypto.hmac('SHA-256', secret, body);
    }),
    bench('crypto.subtle', async () => {
      const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
      );
      new Uint8Array(await crypto.subtle.sign('HMAC', key, body));
    }),
    bench('@noble/hashes', () => {
      nobleHmac(sha256, encoder.encode(secret), body);
    }),
    bench('node:crypto', () => {
      nodeCrypto.createHmac('sha256', secret).update(body).digest();
    }),
  );
  expect(result.get('crypto.subtle')).not.toBeFasterThan(result.get('@portable/web-crypto'), {
    delta: 0.25,
  });
});

test('hkdf derives 32 bytes within 25% of crypto.subtle', async ({ bench }) => {
  const ikm = body.subarray(0, 32);
  const salt = body.subarray(32, 64);
  const info = encoder.encode('portable bench');
  const result = await bench.compare(
    bench('@portable/web-crypto', async () => {
      await WebCrypto.hkdf('SHA-256', ikm, { info, salt });
    }),
    bench('crypto.subtle', async () => {
      const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
      new Uint8Array(
        await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', info, salt }, key, 256),
      );
    }),
    bench('@noble/hashes', () => {
      nobleHkdf(sha256, ikm, salt, info, 32);
    }),
    bench('node:crypto', () => {
      nodeCrypto.hkdfSync('sha256', ikm, salt, info, 32);
    }),
  );
  expect(result.get('crypto.subtle')).not.toBeFasterThan(result.get('@portable/web-crypto'), {
    delta: 0.25,
  });
});

const seed = body.subarray(0, 32);
const pkcs8Prefix = [
  0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20,
];

test('importSeed imports an Ed25519 seed within 25% of crypto.subtle', async ({ bench }) => {
  const result = await bench.compare(
    bench('@portable/web-crypto', async () => {
      await WebCrypto.importSeed('Ed25519', seed, { extractable: true });
    }),
    bench('@portable/web-crypto, not extractable', async () => {
      await WebCrypto.importSeed('Ed25519', seed);
    }),
    bench('crypto.subtle', async () => {
      const pkcs8 = new Uint8Array(48);
      pkcs8.set(pkcs8Prefix);
      pkcs8.set(seed, 16);
      const privateKey = await crypto.subtle.importKey('pkcs8', pkcs8, 'Ed25519', true, ['sign']);
      const { crv, kty, x } = await crypto.subtle.exportKey('jwk', privateKey);
      await crypto.subtle.importKey('jwk', { crv: crv!, kty: kty!, x: x! }, 'Ed25519', true, [
        'verify',
      ]);
    }),
    bench('@noble/curves', () => {
      ed25519.getPublicKey(seed);
    }),
  );
  expect(result.get('crypto.subtle')).not.toBeFasterThan(result.get('@portable/web-crypto'), {
    delta: 0.25,
  });
});

test('publicKeyOf reads a P-256 public key within 25% of crypto.subtle', async ({ bench }) => {
  const { privateKey } = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  );
  const nodeKey = nodeCrypto.KeyObject.from(privateKey);
  const result = await bench.compare(
    bench('@portable/web-crypto', async () => {
      await WebCrypto.publicKeyOf(privateKey);
    }),
    bench('crypto.subtle', async () => {
      const { crv, kty, x, y } = await crypto.subtle.exportKey('jwk', privateKey);
      await crypto.subtle.importKey(
        'jwk',
        { crv: crv!, kty: kty!, x: x!, y: y! },
        { name: 'ECDSA', namedCurve: 'P-256' },
        true,
        ['verify'],
      );
    }),
    bench('node:crypto', () => {
      nodeCrypto.createPublicKey(nodeKey);
    }),
  );
  expect(result.get('crypto.subtle')).not.toBeFasterThan(result.get('@portable/web-crypto'), {
    delta: 0.25,
  });
});

const ecKey = nodeCrypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).privateKey;
const der = nodeCrypto.sign('sha256', body, ecKey);
const derBytes = new Uint8Array(der);
const raw = nodeCrypto.sign('sha256', body, { key: ecKey, dsaEncoding: 'ieee-p1363' });
const rawBytes = new Uint8Array(raw);

test('derToRawEcdsa converts a P-256 signature within 25% of ecdsa-sig-formatter', async ({
  bench,
}) => {
  const result = await bench.compare(
    bench('@portable/web-crypto', () => {
      WebCrypto.derToRawEcdsa(derBytes);
    }),
    bench('ecdsa-sig-formatter', () => {
      derToJose(der, 'ES256');
    }),
    bench('@noble/curves', () => {
      p256.Signature.fromBytes(derBytes, 'der').toBytes('compact');
    }),
  );
  expect(result.get('ecdsa-sig-formatter')).not.toBeFasterThan(result.get('@portable/web-crypto'), {
    delta: 0.25,
  });
  expect(result.get('@noble/curves')).not.toBeFasterThan(result.get('@portable/web-crypto'), {
    delta: 0.25,
  });
});

// V8 allocates a typed array longer than 64 bytes outside the JavaScript heap, which costs about
// 1 µs, and every P-256 DER signature is longer. joseToDer skips that by slicing a Buffer from
// Node's shared 8 KB pool, so its result's `.buffer` holds other data. rawToDerEcdsa returns its
// own ArrayBuffer instead, so ecdsa-sig-formatter is measured for reference only here.
test('rawToDerEcdsa converts a P-256 signature within 25% of @noble/curves', async ({ bench }) => {
  const result = await bench.compare(
    bench('@portable/web-crypto', () => {
      WebCrypto.rawToDerEcdsa(rawBytes);
    }),
    bench('ecdsa-sig-formatter', () => {
      joseToDer(raw, 'ES256');
    }),
    bench('@noble/curves', () => {
      p256.Signature.fromBytes(rawBytes, 'compact').toBytes('der');
    }),
  );
  expect(result.get('@noble/curves')).not.toBeFasterThan(result.get('@portable/web-crypto'), {
    delta: 0.25,
  });
});
