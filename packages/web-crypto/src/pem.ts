import { assertUint8Array } from '@portable/bytes/internal';
import { InvalidInputError, UnsupportedError } from './errors.js';
import { run } from './internal.js';

export declare namespace importPem {
  /** The algorithm to import the key for, as `crypto.subtle.importKey` takes it. */
  type Algorithm = AlgorithmIdentifier | RsaHashedImportParams | EcKeyImportParams;
  type Options = {
    /** Whether the key can be exported. @default false */
    extractable?: boolean | undefined;
    /**
     * What the key may be used for. The default depends on the algorithm and on whether the key
     * is private or public, such as `['sign']` and `['verify']` for a signing algorithm.
     */
    usages?: readonly KeyUsage[] | undefined;
    /** Rejects with `signal.reason` once aborted. */
    signal?: AbortSignal | undefined;
  };
}

type Kind = 'private' | 'public';

const formats = {
  'PRIVATE KEY': { kind: 'private', wrap: undefined },
  'RSA PRIVATE KEY': { kind: 'private', wrap: pkcs1ToPkcs8 },
  'PUBLIC KEY': { kind: 'public', wrap: undefined },
  'RSA PUBLIC KEY': { kind: 'public', wrap: pkcs1ToSpki },
} as const satisfies Record<
  string,
  { kind: Kind; wrap: ((der: Uint8Array) => Uint8Array<ArrayBuffer>) | undefined }
>;

const signing = { private: ['sign'], public: ['verify'] } as const;
const agreement = { private: ['deriveBits', 'deriveKey'], public: [] } as const;
const defaultUsages: Record<string, { readonly [kind in Kind]: readonly KeyUsage[] }> = {
  'rsassa-pkcs1-v1_5': signing,
  'rsa-pss': signing,
  ecdsa: signing,
  ed25519: signing,
  'rsa-oaep': { private: ['decrypt', 'unwrapKey'], public: ['encrypt', 'wrapKey'] },
  ecdh: agreement,
  x25519: agreement,
};

const block = /-----BEGIN ([A-Z0-9 ]+)-----((?:[^-]|-(?!----))*)-----END \1-----/g;

/**
 * Imports a PEM private or public key. WebCrypto imports only DER, and only as PKCS #8 or
 * SubjectPublicKeyInfo, so `importPem` decodes the base64 and wraps a PKCS #1 `RSA PRIVATE KEY`
 * or `RSA PUBLIC KEY`, the form `openssl genrsa` writes, in the structure WebCrypto takes. It
 * reads the first `PRIVATE KEY`, `RSA PRIVATE KEY`, `PUBLIC KEY` or `RSA PUBLIC KEY` block and
 * skips other blocks, such as a certificate before the key.
 *
 * @example
 * ```ts
 * import * as WebCrypto from '@portable/web-crypto';
 *
 * const privateKey = await WebCrypto.importPem({ name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, pem);
 * const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, data);
 * ```
 */
export function importPem(
  algorithm: importPem.Algorithm,
  pem: string | Uint8Array,
  options: importPem.Options = {},
): Promise<CryptoKey> {
  const { extractable = false, signal } = options;
  return run(signal, async () => {
    const text = typeof pem === 'string' ? pem : new TextDecoder().decode(assertUint8Array(pem));
    const { label, body } = findBlock(text);
    const format = formats[label];
    const usages = options.usages ?? usagesFor(algorithm, format.kind);
    const decoded = decodeBase64(body);
    const der = format.wrap ? format.wrap(decoded) : decoded;
    try {
      return await crypto.subtle.importKey(
        format.kind === 'private' ? 'pkcs8' : 'spki',
        der,
        algorithm,
        extractable,
        [...usages],
      );
    } catch (cause) {
      throw new InvalidInputError(`The ${label} block is not a key for this algorithm`, { cause });
    }
  });
}

function findBlock(text: string): { label: keyof typeof formats; body: string } {
  let unsupported: string | undefined;
  for (const [, label = '', body = ''] of text.matchAll(block)) {
    if (!isFormat(label)) {
      unsupported ??= label;
      continue;
    }
    if (body.includes(':')) {
      throw new UnsupportedError(`An encrypted ${label} block is not supported`);
    }
    return { label, body };
  }
  if (unsupported !== undefined) {
    throw new UnsupportedError(
      `Expected a PRIVATE KEY, RSA PRIVATE KEY, PUBLIC KEY or RSA PUBLIC KEY block, got ${unsupported}`,
    );
  }
  throw new InvalidInputError('Expected a PEM block');
}

function isFormat(label: string): label is keyof typeof formats {
  return Object.hasOwn(formats, label);
}

function usagesFor(algorithm: importPem.Algorithm, kind: Kind): readonly KeyUsage[] {
  const name = typeof algorithm === 'string' ? algorithm : algorithm?.name;
  const usages = typeof name === 'string' ? defaultUsages[name.toLowerCase()] : undefined;
  if (!usages) {
    throw new RangeError(`Pass usages to import a key for ${String(name)}.`);
  }
  return usages[kind];
}

function decodeBase64(body: string): Uint8Array<ArrayBuffer> {
  let binary: string;
  try {
    binary = atob(body.replace(/\s+/g, ''));
  } catch (cause) {
    throw new InvalidInputError('The PEM block is not valid base64', { cause });
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

const rsaEncryption = [
  0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00,
];

/** Wraps a PKCS #1 RSAPrivateKey in a PKCS #8 PrivateKeyInfo. */
export function pkcs1ToPkcs8(pkcs1: Uint8Array): Uint8Array<ArrayBuffer> {
  return der(0x30, [0x02, 0x01, 0x00, ...rsaEncryption, ...header(0x04, pkcs1.length)], pkcs1);
}

/** Wraps a PKCS #1 RSAPublicKey in a SubjectPublicKeyInfo. */
export function pkcs1ToSpki(pkcs1: Uint8Array): Uint8Array<ArrayBuffer> {
  return der(0x30, [...rsaEncryption, ...header(0x03, pkcs1.length + 1), 0x00], pkcs1);
}

/** A DER element with tag `tag` whose content is `prefix` followed by `rest`. */
function der(tag: number, prefix: readonly number[], rest: Uint8Array): Uint8Array<ArrayBuffer> {
  const head = [...header(tag, prefix.length + rest.length), ...prefix];
  const out = new Uint8Array(head.length + rest.length);
  out.set(head);
  out.set(rest, head.length);
  return out;
}

function header(tag: number, length: number): number[] {
  if (length < 0x80) {
    return [tag, length];
  }
  const bytes: number[] = [];
  for (let n = length; n > 0; n >>>= 8) {
    bytes.unshift(n & 0xff);
  }
  return [tag, 0x80 | bytes.length, ...bytes];
}
