import { assertUint8Array } from '@portable/bytes/internal';
import { InvalidInputError } from './errors.js';
import { run } from './internal.js';

/** A curve whose private key is a 32-byte seed. */
export type SeedAlgorithm = 'Ed25519' | 'X25519';

const pkcs8Prefix: Record<SeedAlgorithm, readonly number[]> = {
  Ed25519: [
    0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20,
  ],
  X25519: [
    0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x6e, 0x04, 0x22, 0x04, 0x20,
  ],
};

const privateUsages: Record<SeedAlgorithm, KeyUsage[]> = {
  Ed25519: ['sign'],
  X25519: ['deriveBits', 'deriveKey'],
};

export declare namespace importSeed {
  type Options = {
    /** Whether the private key can be exported. The public key always can. @default false */
    extractable?: boolean | undefined;
    /**
     * Rejects with `signal.reason` as soon as it aborts. A `crypto.subtle` call can't be
     * cancelled, so it runs to the end in the background.
     */
    signal?: AbortSignal | undefined;
  };
}

/**
 * Imports a 32-byte Ed25519 or X25519 private key, the form RFC 8032 and RFC 7748 use, and
 * returns it with its public key. WebCrypto imports these keys only as PKCS #8 or JWK. An Ed25519
 * private key gets the usage `['sign']`, and its public key `['verify']`. An X25519 private key gets
 * `['deriveBits', 'deriveKey']`, and its public key none. The public key is always extractable.
 *
 * @example
 * ```ts
 * import * as WebCrypto from '@portable/web-crypto';
 *
 * const seed = crypto.getRandomValues(new Uint8Array(32));
 * const { privateKey, publicKey } = await WebCrypto.importSeed('Ed25519', seed);
 * const signature = await crypto.subtle.sign('Ed25519', privateKey, data);
 * ```
 */
export function importSeed(
  algorithm: SeedAlgorithm,
  seed: Uint8Array,
  options: importSeed.Options = {},
): Promise<CryptoKeyPair> {
  const { extractable = false, signal } = options;
  return run(signal, async () => {
    if (assertUint8Array(seed).length !== 32) {
      throw new InvalidInputError(`An ${algorithm} seed is 32 bytes, not ${seed.length}`);
    }
    const pkcs8 = new Uint8Array(48);
    pkcs8.set(pkcs8Prefix[algorithm]);
    pkcs8.set(seed, 16);
    const usages = privateUsages[algorithm];
    const exportable = await crypto.subtle.importKey('pkcs8', pkcs8, algorithm, true, usages);
    const publicKey = await publicKeyOf(exportable);
    const privateKey = extractable
      ? exportable
      : await crypto.subtle.importKey('pkcs8', pkcs8, algorithm, false, usages);
    return { privateKey, publicKey };
  });
}

const publicUsage: Partial<Record<KeyUsage, KeyUsage>> = {
  decrypt: 'encrypt',
  sign: 'verify',
  unwrapKey: 'wrapKey',
};

const publicMembers = ['alg', 'crv', 'e', 'kty', 'n', 'x', 'y'] as const;

export declare namespace publicKeyOf {
  type Options = {
    /**
     * Rejects with `signal.reason` as soon as it aborts. A `crypto.subtle` call can't be
     * cancelled, so it runs to the end in the background.
     */
    signal?: AbortSignal | undefined;
  };
}

/**
 * Returns the public key of an extractable private key: Ed25519, X25519, ECDSA, ECDH, or RSA. The
 * public key can verify what the private key signs and encrypt what it decrypts. It is extractable
 * and has the same `algorithm`. Its usages are the public counterparts of the private key's usages:
 * `sign` becomes `verify`, `decrypt` becomes `encrypt`, and `unwrapKey` becomes `wrapKey`. Other
 * usages are dropped, so the public key of an ECDH private key has no usages.
 *
 * @example
 * ```ts
 * import * as WebCrypto from '@portable/web-crypto';
 *
 * const privateKey = await crypto.subtle.importKey('pkcs8', der, 'Ed25519', true, ['sign']);
 * const publicKey = await WebCrypto.publicKeyOf(privateKey);
 * ```
 */
export function publicKeyOf(
  privateKey: CryptoKey,
  options: publicKeyOf.Options = {},
): Promise<CryptoKey> {
  return run(options.signal, async () => {
    if (privateKey.type !== 'private') {
      throw new InvalidInputError(`A ${privateKey.type} key has no public key`);
    }
    if (!privateKey.extractable) {
      throw new InvalidInputError('The private key must be extractable to read its public key');
    }
    const jwk = await crypto.subtle.exportKey('jwk', privateKey);
    const publicJwk: JsonWebKey = {};
    for (const name of publicMembers) {
      if (jwk[name] !== undefined) {
        publicJwk[name] = jwk[name];
      }
    }
    const usages = privateKey.usages.flatMap((usage) => publicUsage[usage] ?? []);
    return crypto.subtle.importKey('jwk', publicJwk, privateKey.algorithm, true, usages);
  });
}
