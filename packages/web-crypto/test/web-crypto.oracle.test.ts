import * as nodeCrypto from 'node:crypto';
import { ed25519, x25519 } from '@noble/curves/ed25519.js';
import { p256, p384, p521 } from '@noble/curves/nist.js';
import { hkdf as nobleHkdf } from '@noble/hashes/hkdf.js';
import { hmac as nobleHmac } from '@noble/hashes/hmac.js';
import { sha1 } from '@noble/hashes/legacy.js';
import { sha256, sha384, sha512 } from '@noble/hashes/sha2.js';
import { derToJose, joseToDer } from 'ecdsa-sig-formatter';
import { describe, expect, test } from 'vite-plus/test';
import * as WebCrypto from '@portable/web-crypto';

const hashes = [
  ['SHA-1', 'sha1', sha1],
  ['SHA-256', 'sha256', sha256],
  ['SHA-384', 'sha384', sha384],
  ['SHA-512', 'sha512', sha512],
] as const;

const random = (length: number) => new Uint8Array(nodeCrypto.randomBytes(length));
const lengths = [0, 1, 31, 55, 56, 63, 64, 65, 127, 128, 129, 1000, 70_000];

describe('digest, hmac and hkdf match node:crypto and @noble/hashes', () => {
  for (const [hash, nodeName, noble] of hashes) {
    test(`digest with ${hash}`, async () => {
      for (const length of lengths) {
        const data = random(length);
        const ours = await WebCrypto.digest(hash, data);
        expect(ours).toEqual(new Uint8Array(nodeCrypto.createHash(nodeName).update(data).digest()));
        expect(ours).toEqual(noble(data));
      }
    });

    test(`hmac with ${hash}`, async () => {
      for (const keyLength of [0, 1, 20, 64, 65, 128, 129, 300]) {
        for (const length of lengths) {
          const key = random(keyLength);
          const data = random(length);
          const ours = await WebCrypto.hmac(hash, key, data);
          expect(ours).toEqual(
            new Uint8Array(nodeCrypto.createHmac(nodeName, key).update(data).digest()),
          );
          expect(ours).toEqual(nobleHmac(noble, key, data));
        }
      }
    });

    test(`hkdf with ${hash}`, async () => {
      for (const length of [1, 16, 32, 42, 100, 255 * noble.outputLen]) {
        const key = random(1 + (length % 80));
        const salt = random(length % 3 === 0 ? 0 : 16);
        const info = random(length % 50);
        const ours = await WebCrypto.hkdf(hash, key, { info, length, salt });
        expect(ours).toEqual(
          new Uint8Array(nodeCrypto.hkdfSync(nodeName, key, salt, info, length)),
        );
        expect(ours).toEqual(nobleHkdf(noble, key, salt, info, length));
      }
    });
  }
});

describe('importSeed matches @noble/curves and node:crypto', () => {
  test('Ed25519 public keys and signatures', async () => {
    for (let i = 0; i < 50; i++) {
      const seed = random(32);
      const message = random(i * 7);
      const { privateKey, publicKey } = await WebCrypto.importSeed('Ed25519', seed);
      const raw = new Uint8Array(await crypto.subtle.exportKey('raw', publicKey));
      expect(raw).toEqual(ed25519.getPublicKey(seed));
      const signature = new Uint8Array(await crypto.subtle.sign('Ed25519', privateKey, message));
      expect(signature).toEqual(ed25519.sign(message, seed));
    }
  });

  test('X25519 public keys and shared secrets', async () => {
    for (let i = 0; i < 50; i++) {
      const seed = random(32);
      const peer = x25519.utils.randomSecretKey();
      const { privateKey, publicKey } = await WebCrypto.importSeed('X25519', seed);
      expect(new Uint8Array(await crypto.subtle.exportKey('raw', publicKey))).toEqual(
        x25519.getPublicKey(seed),
      );
      const peerPublic = await crypto.subtle.importKey(
        'raw',
        x25519.getPublicKey(peer),
        'X25519',
        true,
        [],
      );
      const shared = await crypto.subtle.deriveBits(
        { name: 'X25519', public: peerPublic },
        privateKey,
        256,
      );
      expect(new Uint8Array(shared)).toEqual(
        x25519.getSharedSecret(peer, x25519.getPublicKey(seed)),
      );
    }
  });
});

describe('publicKeyOf matches node:crypto createPublicKey', () => {
  const algorithms = [
    { name: 'ECDSA', namedCurve: 'P-256' },
    { name: 'ECDSA', namedCurve: 'P-521' },
    { name: 'ECDH', namedCurve: 'P-384' },
    { name: 'Ed25519' },
    { name: 'X25519' },
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
    },
  ];

  test.each(algorithms)('$name $namedCurve', async (algorithm) => {
    const usages = (
      algorithm.name === 'ECDH' || algorithm.name === 'X25519' ? ['deriveBits'] : ['sign', 'verify']
    ) satisfies KeyUsage[];
    const pair = await crypto.subtle.generateKey(algorithm, true, usages);
    const keyPair = 'privateKey' in pair ? pair : undefined;
    if (!keyPair) {
      throw new Error('Expected a key pair');
    }
    const ours = await WebCrypto.publicKeyOf(keyPair.privateKey);
    const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', keyPair.privateKey));
    const node = nodeCrypto
      .createPublicKey(
        nodeCrypto.createPrivateKey({ key: Buffer.from(pkcs8), format: 'der', type: 'pkcs8' }),
      )
      .export({ format: 'der', type: 'spki' });
    expect(new Uint8Array(await crypto.subtle.exportKey('spki', ours))).toEqual(
      new Uint8Array(node),
    );
  });
});

describe('ECDSA conversion matches ecdsa-sig-formatter and @noble/curves', () => {
  const curves = [
    ['P-256', 'ES256', 'sha256', 'prime256v1', p256],
    ['P-384', 'ES384', 'sha384', 'secp384r1', p384],
    ['P-521', 'ES512', 'sha512', 'secp521r1', p521],
  ] as const;

  for (const [namedCurve, alg, nodeHash, nodeCurve, noble] of curves) {
    test(`${namedCurve} signatures from node:crypto in DER`, () => {
      const { privateKey } = nodeCrypto.generateKeyPairSync('ec', { namedCurve: nodeCurve });
      for (let i = 0; i < 500; i++) {
        const der = nodeCrypto.sign(nodeHash, random(1 + (i % 200)), privateKey);
        const raw = WebCrypto.derToRawEcdsa(der, { namedCurve });
        expect(raw).toEqual(new Uint8Array(Buffer.from(derToJose(der, alg), 'base64url')));
        expect(raw).toEqual(noble.Signature.fromBytes(der, 'der').toBytes('compact'));
        expect(WebCrypto.rawToDerEcdsa(raw)).toEqual(new Uint8Array(der));
      }
    });

    test(`${namedCurve} signatures from node:crypto in IEEE P1363`, () => {
      const { privateKey } = nodeCrypto.generateKeyPairSync('ec', { namedCurve: nodeCurve });
      for (let i = 0; i < 500; i++) {
        const raw = nodeCrypto.sign(nodeHash, random(1 + (i % 200)), {
          key: privateKey,
          dsaEncoding: 'ieee-p1363',
        });
        const der = WebCrypto.rawToDerEcdsa(raw);
        expect(der).toEqual(new Uint8Array(joseToDer(Buffer.from(raw), alg)));
        expect(der).toEqual(noble.Signature.fromBytes(raw, 'compact').toBytes('der'));
      }
    });
  }
});

describe('known ecdsa-sig-formatter issues', () => {
  test.each([
    ['a long-form SEQUENCE length under 128', '308106020101020101'],
    ['a negative r', '3006020181020101'],
    ['an r with a leading zero it does not need', '300702020001020101'],
    ['an empty r', '30050200020101'],
    ['a 33-byte r, whose top byte it drops', `3026022101${'11'.repeat(32)}020101`],
  ])('derToJose accepts %s, and derToRawEcdsa rejects it', (_, hex) => {
    const der = Buffer.from(hex, 'hex');
    expect(derToJose(der, 'ES256')).toBeTypeOf('string');
    expect(() => WebCrypto.derToRawEcdsa(der)).toThrow(WebCrypto.InvalidInputError);
  });
});
