import { assertUint8Array, isUint8Array } from '@portable/bytes/internal';
import * as Base64 from '@portable/base64';
import * as Bytes from '@portable/bytes';
import { InvalidInputError, MaxBytesError } from './errors.js';

/**
 * A push subscription as `PushSubscription.toJSON()` returns it in the browser. Keys are base64url
 * or base64 strings, or their bytes.
 */
export type Subscription = {
  endpoint: string;
  expirationTime?: number | null | undefined;
  /** Needed to send a payload. A subscription without keys can only receive empty pushes. */
  keys?: Keys | undefined;
};

/** The browser's public key and authentication secret for payload encryption. */
export type Keys = {
  /** The user agent's ECDH P-256 public key, uncompressed (65 bytes). */
  p256dh: string | Uint8Array;
  /** The 16-byte authentication secret. */
  auth: string | Uint8Array;
};

/**
 * The largest payload in bytes. Push services must accept a 4096-byte encrypted body (RFC 8291 §4).
 *
 * @example
 * ```ts
 * import * as WebPush from '@portable/web-push';
 *
 * const payload = new TextEncoder().encode(JSON.stringify(notification));
 * if (payload.byteLength > WebPush.maxPayloadBytes) {
 *   throw new Error('notification too large');
 * }
 * ```
 */
export const maxPayloadBytes = 3993;

export declare namespace encrypt {
  type Options = {
    /** The subscription. The payload is encrypted with its `keys`. */
    subscription: Pick<Subscription, 'keys'>;
    /** The message. */
    payload: string | Uint8Array;
    /** The 16-byte salt. Use a fresh random salt for every message. @default 16 random bytes */
    salt?: Uint8Array | undefined;
    /**
     * The application server's ECDH P-256 key pair. Use a fresh pair for every message.
     * @default a new key pair from `crypto.subtle.generateKey`
     */
    keyPair?: CryptoKeyPair | undefined;
    /** Aborting it cancels the encryption, and the call rejects with `signal.reason`. */
    signal?: AbortSignal | undefined;
  };
}

/**
 * Encrypts a payload for a subscription with the aes128gcm content encoding (RFC 8188, RFC 8291),
 * and returns the request body: an 86-byte header holding the salt, record size and server public
 * key, then one AES-GCM record. Use it to send with your own transport. `toRequest` and `send`
 * call it for you.
 *
 * @example
 * ```ts
 * import * as WebPush from '@portable/web-push';
 *
 * const body = await WebPush.encrypt({ subscription, payload: JSON.stringify({ title: 'Hi' }) });
 * // send with the headers `Content-Encoding: aes128gcm`, `TTL` and a VAPID `Authorization`
 * ```
 *
 * @throws {InvalidInputError} When the subscription has no keys, `p256dh` isn't a P-256 public
 * key, or `auth` isn't 16 bytes.
 * @throws {MaxBytesError} When the payload is longer than `maxPayloadBytes`.
 * @throws {RangeError} When `salt` isn't 16 bytes.
 */
export async function encrypt(options: encrypt.Options): Promise<Uint8Array<ArrayBuffer>> {
  const { subscription, payload, signal } = options;
  signal?.throwIfAborted();
  const { userPublicKey, auth } = readKeys(subscription);
  const plaintext = toBytes(payload);
  if (plaintext.length > maxPayloadBytes) {
    throw new MaxBytesError({
      maxBytes: maxPayloadBytes,
      message: `Payload is ${plaintext.length} bytes, more than the ${maxPayloadBytes} bytes Web Push allows`,
    });
  }
  const salt = options.salt
    ? new Uint8Array(assertUint8Array(options.salt))
    : crypto.getRandomValues(new Uint8Array(16));
  if (salt.length !== 16) {
    throw new RangeError('salt must be 16 bytes');
  }

  const [userKey, keyPair] = await Promise.all([
    // WebKit imports a point that isn't on the curve, and ECDH with it then fails or returns
    // bits that depend on the server key, so the point is checked here first.
    (isOnCurve(userPublicKey)
      ? subtle.importKey('raw', userPublicKey, ecdh, false, [])
      : Promise.reject(new Error('The point is not on the curve'))
    ).catch((cause: unknown) => {
      throw new InvalidInputError('p256dh is not a point on the P-256 curve', { cause });
    }),
    options.keyPair ?? subtle.generateKey(ecdh, false, ['deriveBits']),
  ]);
  const [serverPublicKey, secret] = await Promise.all([
    subtle.exportKey('raw', keyPair.publicKey),
    subtle.deriveBits({ name: 'ECDH', public: userKey }, keyPair.privateKey, 256),
  ]);
  const asPublic = new Uint8Array(serverPublicKey);

  const ikm = await hkdf(
    await subtle.importKey('raw', secret, 'HKDF', false, ['deriveBits']),
    auth,
    Bytes.concat([keyInfo, userPublicKey, asPublic]),
    256,
  );
  const prk = await subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const [cek, nonce] = await Promise.all([
    hkdf(prk, salt, cekInfo, 128),
    hkdf(prk, salt, nonceInfo, 96),
  ]);
  const key = await subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);

  const record = new Uint8Array(plaintext.length + 1);
  record.set(plaintext);
  record[plaintext.length] = 2;
  const ciphertext = await subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, record);

  const body = new Uint8Array(headerLength + ciphertext.byteLength);
  body.set(salt);
  new DataView(body.buffer).setUint32(16, recordSize);
  body[20] = asPublic.length;
  body.set(asPublic, 21);
  body.set(new Uint8Array(ciphertext), headerLength);
  signal?.throwIfAborted();
  return body;
}

function readKeys(subscription: Pick<Subscription, 'keys'>) {
  const keys = subscription.keys;
  if (!keys || keys.p256dh == null || keys.auth == null) {
    throw new InvalidInputError('A payload needs a subscription with p256dh and auth keys');
  }
  const userPublicKey = readKey(keys.p256dh, 'p256dh');
  if (userPublicKey.length !== 65 || userPublicKey[0] !== 4) {
    throw new InvalidInputError('p256dh must be an uncompressed P-256 public key of 65 bytes');
  }
  const auth = readKey(keys.auth, 'auth');
  if (auth.length !== 16) {
    throw new InvalidInputError('auth must be 16 bytes');
  }
  return { userPublicKey, auth };
}

function readKey(key: unknown, name: string): Uint8Array<ArrayBuffer> {
  if (typeof key !== 'string' && !isUint8Array(key)) {
    throw new InvalidInputError(`${name} must be a base64url string or a Uint8Array`);
  }
  if (isUint8Array(key)) {
    return new Uint8Array(key);
  }
  try {
    return new Uint8Array(
      Base64.decode(key.replaceAll('+', '-').replaceAll('/', '_'), { alphabet: 'base64url' }),
    );
  } catch (cause) {
    throw new InvalidInputError(`${name} is not base64url`, { cause });
  }
}

function toBytes(payload: unknown): Uint8Array {
  if (typeof payload === 'string') {
    return utf8.encode(payload);
  }
  if (isUint8Array(payload)) {
    return payload;
  }
  throw new TypeError('payload must be a string or Uint8Array');
}

function hkdf(
  key: CryptoKey,
  salt: Uint8Array<ArrayBuffer>,
  info: Uint8Array<ArrayBuffer>,
  bits: number,
): Promise<ArrayBuffer> {
  return subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, bits);
}

const subtle = crypto.subtle;
const utf8 = new TextEncoder();
const ecdh = { name: 'ECDH', namedCurve: 'P-256' };
const recordSize = 4096;
const headerLength = 86;
const keyInfo = utf8.encode('WebPush: info\0');
const cekInfo = utf8.encode('Content-Encoding: aes128gcm\0');
const nonceInfo = utf8.encode('Content-Encoding: nonce\0');

const p256 = {
  p: 0xffffffff00000001000000000000000000000000ffffffffffffffffffffffffn,
  b: 0x5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604bn,
};

/** Whether `point`, an uncompressed P-256 point, satisfies y² = x³ - 3x + b (mod p). */
function isOnCurve(point: Uint8Array): boolean {
  if (point.length !== 65 || point[0] !== 4) {
    return false;
  }
  const x = toBigInt(point.subarray(1, 33));
  const y = toBigInt(point.subarray(33));
  const { p, b } = p256;
  if (x >= p || y >= p) {
    return false;
  }
  return (y * y - (x * x * x - 3n * x + b)) % p === 0n;
}

function toBigInt(bytes: Uint8Array): bigint {
  let n = 0n;
  for (const byte of bytes) {
    n = (n << 8n) | BigInt(byte);
  }
  return n;
}
