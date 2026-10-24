import * as Base64 from '@portable/base64';
import * as Dns from '@portable/dns';
import type { Resolver, Result } from '../verify.js';
import { binaryToText, fromBinary, toBinary } from './bytes.js';
import { type BodyHash, sha256 } from './digest.js';
import {
  type Canonicalization,
  type Field,
  lowerAscii,
  selectFields,
  signedData,
  stripFws,
} from './header.js';
import { importPublicKey, type KeyType } from './keys.js';
import {
  canFitDns,
  isDomainName,
  isLocalPart,
  isSameOrSubdomain,
  isSelector,
  toALabel,
} from './names.js';
import { parseTags } from './tags.js';

export type Outcome = { result: Result.Code; reason: string; cause?: unknown };

export type Signature = {
  field: Field;
  result: Result;
  outcome?: Outcome | undefined;
  algorithm: { key: KeyType; supported: boolean };
  header: Canonicalization;
  body: BodyHash;
  names: readonly string[];
  bodyHash: Uint8Array;
  value: Uint8Array<ArrayBuffer>;
  keyName: string;
  identityDomain: string | undefined;
};

export type KeyRecord =
  | {
      data: Uint8Array<ArrayBuffer>;
      type: KeyType;
      hashes: readonly string[] | undefined;
      flags: readonly string[];
    }
  | Outcome;

const required = ['a', 'b', 'bh', 'd', 'h', 's'];
const algorithms: Record<string, { key: KeyType; supported: boolean }> = {
  'rsa-sha256': { key: 'rsa', supported: true },
  'ed25519-sha256': { key: 'ed25519', supported: true },
  'rsa-sha1': { key: 'rsa', supported: false },
};
const canonicalizationAlgorithm = '[A-Za-z](?:[A-Za-z0-9-]*[A-Za-z0-9])?';
const canonicalizationSyntax = new RegExp(
  `^${canonicalizationAlgorithm}(?:/${canonicalizationAlgorithm})?$`,
);

/**
 * Reads a DKIM-Signature field, or with `kind` `'arc'` an ARC-Message-Signature (RFC 8617 section
 * 4.1.2), which has no `v=` and whose `i=` is the instance, and checks everything that needs no
 * key.
 */
export function prepare(field: Field, now: Date, kind: 'dkim' | 'arc' = 'dkim'): Signature {
  const { tags, valid } = parseTags(field.raw.slice(field.raw.indexOf(':') + 1));
  const domainText = binaryToText(tags.get('d') ?? '');
  const selectorText = binaryToText(tags.get('s') ?? '');
  const domain = toALabel(domainText);
  const selector = toALabel(selectorText);
  const identityTag = kind === 'dkim' ? tags.get('i') : undefined;
  const identity = identityTag === undefined ? undefined : parseIdentity(identityTag);
  const algorithmName = stripFws(tags.get('a') ?? '').toLowerCase();
  const algorithm = algorithms[algorithmName];
  const result: Result = {
    result: 'neutral',
    domain: domain ?? domainText.toLowerCase(),
    selector: selector ?? selectorText,
    algorithm: algorithmName,
    identity: identity?.text ?? `@${domain ?? domainText.toLowerCase()}`,
    signature: stripFws(tags.get('b') ?? ''),
    testing: false,
  };
  const keyName = `${selector}._domainkey.${domain}`;
  const names = (tags.get('h') ?? '')
    .split(':')
    .map((name) => lowerAscii(stripFws(name)))
    .filter((name) => name !== '');
  const canonicalization = stripFws(tags.get('c') ?? 'simple/simple');
  const [header = '', body = 'simple'] = canonicalization.toLowerCase().split('/');
  const timestamp = tags.get('t');
  const expiration = tags.get('x');
  const length = tags.get('l');
  const bodyHash = decodeBase64(tags.get('bh') ?? '');
  const value = decodeBase64(tags.get('b') ?? '');

  const outcome = ((): Outcome | undefined => {
    const neutral = (reason: string): Outcome => ({ result: 'neutral', reason });
    if (!valid) {
      return neutral('signature syntax error');
    }
    if (required.some((name) => !tags.has(name)) || (kind === 'dkim' && !tags.has('v'))) {
      return neutral('signature missing required tag');
    }
    if (kind === 'dkim' && tags.get('v') !== '1') {
      return neutral('incompatible version');
    }
    if (!algorithm) {
      return neutral('unknown algorithm');
    }
    if (!canonicalizationSyntax.test(canonicalization)) {
      return neutral('signature syntax error');
    }
    if (!isCanonicalization(header) || !isCanonicalization(body)) {
      return neutral('unknown canonicalization');
    }
    if (
      [timestamp, expiration].some((tag) => tag !== undefined && !/^\d{1,12}$/.test(tag)) ||
      (length !== undefined && !/^\d{1,76}$/.test(length))
    ) {
      return neutral('signature syntax error');
    }
    if (
      !domain ||
      !isDomainName(domain) ||
      !selector ||
      !isSelector(selector) ||
      !canFitDns(keyName)
    ) {
      return neutral('signature syntax error');
    }
    const query = tags.get('q');
    if (
      query !== undefined &&
      !query.split(':').some((method) => lowerAscii(stripFws(method)) === 'dns/txt')
    ) {
      return neutral('unsupported query method');
    }
    if (identity && !identity.valid) {
      return neutral('signature syntax error');
    }
    if (identity && !isSameOrSubdomain(identity.domain, domain)) {
      return neutral('domain mismatch');
    }
    if (
      timestamp !== undefined &&
      expiration !== undefined &&
      Number(expiration) <= Number(timestamp)
    ) {
      return neutral('invalid expiration');
    }
    if (names.length === 0) {
      return neutral('signature syntax error');
    }
    if (!names.includes('from')) {
      return neutral('From field not signed');
    }
    if (!bodyHash || !value) {
      return neutral('signature syntax error');
    }
    if (!algorithm.supported) {
      return { result: 'policy', reason: 'weak algorithm' };
    }
    if (expiration !== undefined && Number(expiration) * 1000 < now.getTime()) {
      return neutral('signature expired');
    }
    return undefined;
  })();
  if (outcome) {
    result.result = outcome.result;
    result.reason = outcome.reason;
  }
  return {
    field,
    result,
    outcome,
    algorithm: algorithm ?? { key: 'rsa', supported: false },
    header: header as Canonicalization,
    body: {
      canonicalization: body as Canonicalization,
      length: length === undefined ? undefined : Number(length),
    },
    names,
    bodyHash: bodyHash ?? new Uint8Array(),
    value: value ?? new Uint8Array(),
    keyName,
    identityDomain: identity?.domain,
  };
}

const isCanonicalization = (name: string): name is Canonicalization =>
  name === 'simple' || name === 'relaxed';

export function decodeBase64(text: string): Uint8Array<ArrayBuffer> | undefined {
  try {
    return new Uint8Array(Base64.decode(text));
  } catch {
    return undefined;
  }
}

/** Decodes dkim-quoted-printable (RFC 6376 section 2.11) and checks the `i=` syntax. */
function parseIdentity(tag: string): { text: string; domain: string; valid: boolean } {
  const decoded = binaryToText(
    stripFws(tag).replace(/=([0-9A-Fa-f]{2})/g, (_, hex: string) =>
      String.fromCharCode(Number.parseInt(hex, 16)),
    ),
  );
  const at = decoded.lastIndexOf('@');
  const local = decoded.slice(0, Math.max(at, 0));
  const domain = at < 0 ? undefined : toALabel(decoded.slice(at + 1));
  if (domain === undefined) {
    return { text: decoded, domain: '', valid: false };
  }
  return {
    text: `${local}@${domain}`,
    domain,
    valid: isLocalPart(local) && isDomainName(domain),
  };
}

export async function check(
  signature: Signature,
  fields: readonly Field[],
  record: KeyRecord,
  minKeyBits: number,
): Promise<Outcome> {
  if ('result' in record) {
    return record;
  }
  signature.result.testing = record.flags.includes('y');
  const selected = selectFields(fields, signature.names, signature.field);
  const data = fromBinary(signedData(selected, signature.field.raw, signature.header));
  const subdomain =
    signature.identityDomain !== undefined && signature.identityDomain !== signature.result.domain;
  return verifyData(record, signature.algorithm.key, signature.value, data, minKeyBits, subdomain);
}

/**
 * Checks that the key suits the algorithm and verifies `value` over `data` with it. `subdomain`
 * says the identity is in a subdomain of the signing domain, which a key with `t=s` forbids.
 */
export async function verifyData(
  record: KeyRecord,
  algorithm: KeyType,
  value: Uint8Array<ArrayBuffer>,
  data: Uint8Array<ArrayBuffer>,
  minKeyBits: number,
  subdomain = false,
): Promise<Outcome> {
  if ('result' in record) {
    return record;
  }
  const { data: keyData, type, hashes, flags } = record;
  if (type !== algorithm) {
    return { result: 'permerror', reason: 'inappropriate key algorithm' };
  }
  if (hashes && !hashes.includes('sha256')) {
    return { result: 'permerror', reason: 'inappropriate hash algorithm' };
  }
  if (subdomain && flags.includes('s')) {
    return { result: 'permerror', reason: 'domain mismatch' };
  }
  const key = await importPublicKey(type, keyData).catch(() => undefined);
  if (!key) {
    return { result: 'permerror', reason: 'invalid public key' };
  }
  if (type === 'rsa' && (key.algorithm as RsaHashedKeyAlgorithm).modulusLength < minKeyBits) {
    return { result: 'policy', reason: 'weak key' };
  }
  const verified = await (
    type === 'rsa'
      ? crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, value, data)
      : crypto.subtle.verify('Ed25519', key, value, await sha256(data))
  ).catch(() => false);
  return verified
    ? { result: 'pass', reason: '' }
    : { result: 'fail', reason: 'signature did not verify' };
}

export async function fetchKey(
  resolver: Resolver,
  name: string,
  signal: AbortSignal | undefined,
): Promise<KeyRecord> {
  let records: string[][];
  try {
    records = await abortable(resolver.resolveTxt(name), signal);
  } catch (error) {
    if (signal?.aborted) {
      throw signal.reason;
    }
    if (Dns.isNotFound(error)) {
      return { result: 'permerror', reason: 'no key' };
    }
    const code = (error as { code?: unknown } | null)?.code;
    return {
      result: 'temperror',
      reason: `key lookup failed${typeof code === 'string' ? `: ${code}` : ''}`,
      cause: error,
    };
  }
  const text = records[0]?.join('');
  if (text === undefined) {
    return { result: 'permerror', reason: 'no key' };
  }
  return parseKeyRecord(text);
}

function parseKeyRecord(text: string): KeyRecord {
  const permerror = (reason: string): Outcome => ({ result: 'permerror', reason });
  const { tags, valid } = parseTags(toBinary(new TextEncoder().encode(text)));
  if (!valid) {
    return permerror('key syntax error');
  }
  const version = tags.get('v');
  if (version !== undefined && (version !== 'DKIM1' || tags.keys().next().value !== 'v')) {
    return permerror('unknown key version');
  }
  const list = (name: string) => {
    const value = tags.get(name);
    return value === undefined
      ? undefined
      : value.split(':').map((item) => lowerAscii(stripFws(item)));
  };
  const services = list('s');
  if (services && !services.includes('email') && !services.includes('*')) {
    return permerror('key not for email');
  }
  const type = list('k')?.[0] ?? 'rsa';
  if (type !== 'rsa' && type !== 'ed25519') {
    return permerror('unknown key type');
  }
  const data = tags.get('p');
  if (data === undefined) {
    return permerror('key syntax error');
  }
  if (stripFws(data) === '') {
    return permerror('key revoked');
  }
  const der = decodeBase64(data);
  if (!der) {
    return permerror('invalid public key');
  }
  return { data: der, type, hashes: list('h'), flags: list('t') ?? [] };
}

export function abortable<value>(
  promise: Promise<value>,
  signal: AbortSignal | undefined,
): Promise<value> {
  if (!signal) {
    return promise;
  }
  if (signal.aborted) {
    return Promise.reject(signal.reason);
  }
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}
