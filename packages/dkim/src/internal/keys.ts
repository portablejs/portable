import * as WebCrypto from '@portable/web-crypto';
import { pkcs1ToSpki } from '@portable/web-crypto/internal';

export type KeyType = 'rsa' | 'ed25519';

const rsa = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' } as const;
const ed25519 = { name: 'Ed25519' } as const;

/** The DKIM key type of a CryptoKey, or `undefined` for any other kind of key. */
export function keyType(key: CryptoKey): KeyType | undefined {
  const { name } = key.algorithm;
  if (name === 'Ed25519') {
    return 'ed25519';
  }
  if (
    name === 'RSASSA-PKCS1-v1_5' &&
    (key.algorithm as RsaHashedKeyAlgorithm).hash.name === 'SHA-256'
  ) {
    return 'rsa';
  }
  return undefined;
}

export async function importPrivateKey(input: CryptoKey | string | JsonWebKey): Promise<CryptoKey> {
  if (typeof input !== 'string' && (typeof input !== 'object' || input === null)) {
    throw new TypeError('privateKey must be a CryptoKey, a PEM string or a JWK.');
  }
  const key = await importKey(input).catch((error: unknown) => {
    throw new RangeError('privateKey is not a valid RSA or Ed25519 private key.', { cause: error });
  });
  if (key.type !== 'private' || !key.usages.includes('sign') || !keyType(key)) {
    throw new RangeError(
      'privateKey must be an RSA (RSASSA-PKCS1-v1_5 with SHA-256) or Ed25519 private key that can sign.',
    );
  }
  return key;
}

async function importKey(input: CryptoKey | string | JsonWebKey): Promise<CryptoKey> {
  if (input instanceof CryptoKey) {
    return input;
  }
  if (typeof input === 'string') {
    return WebCrypto.importPem(rsa, input).catch(() => WebCrypto.importPem(ed25519, input));
  }
  const algorithm = input.kty === 'OKP' && input.crv === 'Ed25519' ? ed25519 : rsa;
  return crypto.subtle.importKey('jwk', input, algorithm, false, ['sign']);
}

/**
 * Imports the `p=` key of a DNS key record. An RSA key is a SubjectPublicKeyInfo or a bare
 * RSAPublicKey (RFC 6376 section 3.6.1), and an Ed25519 key is the 32 raw bytes (RFC 8463
 * section 4.2).
 */
export function importPublicKey(type: KeyType, der: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  if (type === 'ed25519') {
    if (der.length !== 32) {
      return Promise.reject(new TypeError('An Ed25519 key is 32 bytes.'));
    }
    return crypto.subtle.importKey('raw', der, ed25519, false, ['verify']);
  }
  // The outer SEQUENCE of a SubjectPublicKeyInfo starts with a SEQUENCE, and that of an
  // RSAPublicKey with an INTEGER.
  const length = der[1] ?? 0;
  const first = der[length < 0x80 ? 2 : 2 + (length & 0x7f)];
  const spki = first === 0x02 ? pkcs1ToSpki(der) : der;
  return crypto.subtle.importKey('spki', spki, rsa, false, ['verify']);
}
