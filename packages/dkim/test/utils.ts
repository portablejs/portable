import * as Dkim from '@portable/dkim';
import * as Streams from '@portable/streams';

// `?url&inline` turns each fixture into a data URL, which `fetch` reads in Node and in browsers.
const files = import.meta.glob<string>('./fixtures/*', { query: '?url&inline', import: 'default' });

export async function fixture(name: string): Promise<Uint8Array<ArrayBuffer>> {
  const load = files[`./fixtures/${name}`];
  if (!load) {
    throw new Error(`No fixture ${name}`);
  }
  return new Uint8Array(await (await fetch(await load())).arrayBuffer());
}

export const fixtureText = async (name: string): Promise<string> =>
  new TextDecoder().decode(await fixture(name));

export const encode = (text: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(text);

/** Text with one character per byte, as the reference signer below handles it. */
export const binary = (bytes: Uint8Array): string => {
  let text = '';
  for (const byte of bytes) {
    text += String.fromCharCode(byte);
  }
  return text;
};

export const fromBinary = (text: string): Uint8Array<ArrayBuffer> =>
  Uint8Array.from(text, (char) => char.charCodeAt(0));

/** Encodes text as UTF-8 and returns it as binary text. */
export const utf8 = (text: string): string => binary(encode(text));

export const base64 = (bytes: Uint8Array): string => btoa(binary(bytes));

export const sha256 = async (data: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> =>
  new Uint8Array(await crypto.subtle.digest('SHA-256', data));

export function chunked(bytes: Uint8Array, size: number): Uint8Array[] {
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < bytes.length; i += size) {
    chunks.push(bytes.subarray(i, i + size));
  }
  return chunks;
}

export function randomChunks(bytes: Uint8Array, seed: number, max = 64): Uint8Array[] {
  const random = prng(seed);
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < bytes.length;) {
    const size = 1 + Math.floor(random() * max);
    chunks.push(bytes.subarray(i, i + size));
    i += size;
  }
  return chunks;
}

export const stream = (chunks: readonly Uint8Array[]): ReadableStream<Uint8Array> =>
  Streams.fromIterable(chunks);

/** Park-Miller, so that a failure is reproducible. */
export function prng(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 48271) % 2147483647;
    return state / 2147483647;
  };
}

/** The PEM fixtures of mailauth's tests: 2048-bit RSA, 512-bit RSA and Ed25519. */
export const keys = {
  rsa: 'rsa',
  small: 'small',
  ed25519: 'ed25519',
} as const;

export const privatePem = (name: keyof typeof keys): Promise<string> =>
  fixtureText(`private-${name}.pem.txt`);

const pemBody = (pem: string): string => pem.replace(/-----[^-]+-----|\s/g, '');

/** The SubjectPublicKeyInfo of a public key fixture, in base64. */
export const spki = async (name: keyof typeof keys): Promise<string> =>
  pemBody(await fixtureText(`public-${name}.pem.txt`));

/** The bare RSAPublicKey (PKCS #1) inside the SubjectPublicKeyInfo of a 2048-bit key. */
export const pkcs1 = async (name: 'rsa'): Promise<string> =>
  base64(fromBinary(atob(await spki(name))).subarray(24));

/** The 32 bytes of an Ed25519 public key, as RFC 8463 section 4.2 publishes them. */
export const ed25519Raw = async (): Promise<string> =>
  base64(fromBinary(atob(await spki('ed25519'))).subarray(12));

export const rsaRecord = async (name: 'rsa' | 'small' = 'rsa'): Promise<string> =>
  `v=DKIM1; k=rsa; p=${await spki(name)}`;

export const ed25519Record = async (): Promise<string> =>
  `v=DKIM1; k=ed25519; p=${await ed25519Raw()}`;

export function dnsError(code: string, name: string): Error {
  return Object.assign(new Error(`queryTxt ${code} ${name}`), { code });
}

/**
 * A resolver for `{ name: records | Error }`. A record is a string or the strings of one TXT
 * record. A name that isn't listed gives ENOTFOUND. Each query is added to `log`.
 */
export function resolverFrom(
  records: Record<string, readonly (string | readonly string[])[] | Error>,
  log: string[] = [],
): Dkim.Resolver {
  return {
    async resolveTxt(name) {
      log.push(name);
      const value = Object.hasOwn(records, name) ? records[name] : undefined;
      if (value === undefined) {
        throw dnsError('ENOTFOUND', name);
      }
      if (value instanceof Error) {
        throw value;
      }
      return value.map((record) => (typeof record === 'string' ? [record] : [...record]));
    },
  };
}

/** Imports a PKCS #8 PEM fixture for the reference signer. */
export async function importPrivate(
  pem: string,
  hash: 'SHA-256' | 'SHA-1' = 'SHA-256',
): Promise<CryptoKey> {
  const der = fromBinary(atob(pemBody(pem)));
  const ed25519 = der.length < 64;
  return crypto.subtle.importKey(
    'pkcs8',
    der,
    ed25519 ? { name: 'Ed25519' } : { name: 'RSASSA-PKCS1-v1_5', hash },
    true,
    ['sign'],
  );
}

// A DKIM signer written from RFC 6376 sections 3.4, 3.5 and 3.7 and RFC 8463 alone, ported from
// mailauth's test/helpers/dkim-reference.js. It shares no code with the package, so a bug there
// can't be cancelled out by the same bug here, and it builds the signature field from a literal
// tag list, so a test can use any tag layout, including invalid ones. Text is binary text.

export function canonicalBodyRelaxed(body: string): string {
  if (!body.length) {
    return '';
  }
  const lines = body.split('\r\n');
  if (lines.at(-1) === '') {
    lines.pop();
  }
  const canonical = lines.map((line) => line.replace(/[ \t]+/g, ' ').replace(/ $/, ''));
  while (canonical.length && canonical.at(-1) === '') {
    canonical.pop();
  }
  return canonical.map((line) => line + '\r\n').join('');
}

export const canonicalBodySimple = (body: string): string => body.replace(/(\r\n)*$/, '') + '\r\n';

function canonicalHeaderRelaxed(line: string): string {
  const colon = line.indexOf(':');
  const name = line
    .slice(0, colon)
    .replace(/[ \t]+$/, '')
    .toLowerCase();
  const value = line
    .slice(colon + 1)
    .replace(/\r\n/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/^ /, '')
    .replace(/ $/, '');
  return name + ':' + value;
}

function selectHeaders(headers: readonly string[], names: readonly string[]): string[] {
  const used = new Set<number>();
  const out: string[] = [];
  for (const name of names) {
    for (let i = headers.length - 1; i >= 0; i--) {
      if (used.has(i)) {
        continue;
      }
      const own = headers[i]!.slice(0, headers[i]!.indexOf(':')).trim().toLowerCase();
      if (own !== name.trim().toLowerCase()) {
        continue;
      }
      used.add(i);
      out.push(headers[i]!);
      break;
    }
  }
  return out;
}

export type ReferenceOptions = {
  /** Header fields without their final CRLF. */
  headers: readonly string[];
  body: string;
  /** `header/body`, how the reference canonicalizes, whatever `c=` says. */
  c: string;
  algorithm: string;
  key: CryptoKey;
  /** The signature field up to the `b=` value, with `%BH%` where the body hash goes. */
  prefix: string;
  /** Text after the `b=` value. */
  suffix?: string | undefined;
  /** The fields to sign. */
  names: readonly string[];
  /** Hash only this many bytes of the canonicalized body. */
  length?: number | undefined;
};

export async function referenceSign(options: ReferenceOptions): Promise<string> {
  const [header = 'simple', body = 'simple'] = options.c.split('/');
  let canonical =
    body === 'relaxed' ? canonicalBodyRelaxed(options.body) : canonicalBodySimple(options.body);
  if (options.length !== undefined) {
    canonical = canonical.slice(0, options.length);
  }
  const sha1 = options.algorithm.endsWith('-sha1');
  const bodyHash = base64(
    new Uint8Array(await crypto.subtle.digest(sha1 ? 'SHA-1' : 'SHA-256', fromBinary(canonical))),
  );
  const prefix = options.prefix.replace('%BH%', bodyHash);
  const suffix = options.suffix ?? '';
  let data = '';
  for (const field of selectHeaders(options.headers, options.names)) {
    data += (header === 'relaxed' ? canonicalHeaderRelaxed(field) : field) + '\r\n';
  }
  data += header === 'relaxed' ? canonicalHeaderRelaxed(prefix + suffix) : prefix + suffix;
  const bytes = fromBinary(data);
  const signature = options.algorithm.startsWith('ed25519')
    ? await crypto.subtle.sign(options.key.algorithm, options.key, await sha256(bytes))
    : await crypto.subtle.sign(options.key.algorithm, options.key, bytes);
  return `${prefix}${base64(new Uint8Array(signature))}${suffix}\r\n${options.headers.join('\r\n')}\r\n\r\n${options.body}`;
}

/** Parses a tag list into a map, for reading what `sign` wrote. */
export function tagsOf(field: string): Record<string, string> {
  const value = field.slice(field.indexOf(':') + 1).replace(/\r\n$/, '');
  const tags: Record<string, string> = {};
  for (const spec of value.split(';')) {
    const equals = spec.indexOf('=');
    if (equals < 0) {
      continue;
    }
    const name = spec.slice(0, equals).replace(/[ \t\r\n]+/g, '');
    tags[name] = spec
      .slice(equals + 1)
      .replace(/\r\n[ \t]+/g, ' ')
      .trim();
  }
  return tags;
}

/**
 * A verifier written from RFC 6376 section 6 alone, also ported from mailauth's reference: it
 * checks the first DKIM-Signature of a message against a public key, for testing `sign`.
 */
export async function referenceVerify(message: string, publicKey: CryptoKey): Promise<boolean> {
  const end = message.indexOf('\r\n\r\n');
  const header = end < 0 ? message : message.slice(0, end + 2);
  const body = end < 0 ? '' : message.slice(end + 4);
  const fields: string[] = [];
  for (const line of header.split('\r\n').filter((line, i, all) => i < all.length - 1 || line)) {
    if (/^[ \t]/.test(line) && fields.length) {
      fields[fields.length - 1] += '\r\n' + line;
    } else {
      fields.push(line);
    }
  }
  const signature = fields.find((field) => /^dkim-signature[ \t]*:/i.test(field));
  if (!signature) {
    return false;
  }
  const tags = tagsOf(signature);
  const [hc = 'simple', bc = 'simple'] = (tags.c ?? 'simple/simple').split('/');
  let canonical = bc === 'relaxed' ? canonicalBodyRelaxed(body) : canonicalBodySimple(body);
  if (tags.l !== undefined) {
    canonical = canonical.slice(0, Number(tags.l));
  }
  if (base64(await sha256(fromBinary(canonical))) !== tags.bh?.replace(/\s+/g, '')) {
    return false;
  }
  const others = fields.filter((field) => field !== signature);
  const names = (tags.h ?? '').split(':').map((name) => name.trim());
  let data = '';
  for (const field of selectHeaders(others, names)) {
    data += (hc === 'relaxed' ? canonicalHeaderRelaxed(field) : field) + '\r\n';
  }
  const emptied = signature.replace(/(;[ \t\r\n]*b[ \t\r\n]*=)[^;]*$/, '$1');
  data += hc === 'relaxed' ? canonicalHeaderRelaxed(emptied) : emptied;
  const value = fromBinary(atob((tags.b ?? '').replace(/\s+/g, '')));
  const bytes = fromBinary(data);
  return publicKey.algorithm.name === 'Ed25519'
    ? crypto.subtle.verify('Ed25519', publicKey, value, await sha256(bytes))
    : crypto.subtle.verify('RSASSA-PKCS1-v1_5', publicKey, value, bytes);
}

export async function importPublic(name: keyof typeof keys): Promise<CryptoKey> {
  const der = fromBinary(atob(await spki(name)));
  return crypto.subtle.importKey(
    'spki',
    der,
    name === 'ed25519' ? { name: 'Ed25519' } : { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    true,
    ['verify'],
  );
}
