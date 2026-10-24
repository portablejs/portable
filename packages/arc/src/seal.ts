import * as Base64 from '@portable/base64';
import type * as Dkim from '@portable/dkim';
import {
  appendValue,
  casedName,
  assertHeaders,
  normalizeName,
  defaultHeaders,
  type Field,
  canFitDns,
  fold,
  fromBinary,
  hashBody,
  importPrivateKey,
  isDomainName,
  isSelector,
  keyType,
  lowerAscii,
  type Message,
  overSigned,
  parseFields,
  seconds,
  selectForSigning,
  signData,
  signedData,
  splitMessage,
  toBinary,
} from '@portable/dkim/internal';
import { InvalidInputError } from './errors.js';
import { isArcField, maxInstance, newest, readChain } from './internal/chain.js';
import type { Result } from './verify.js';

export declare namespace seal {
  type Options = {
    /** The sealing domain (`d=` of both signatures). U-labels are converted to A-labels. */
    domain: string;
    /** The selector (`s=`): the public key is published at `<selector>._domainkey.<domain>`. */
    selector: string;
    /**
     * An RSA key of at least 1024 bits or an Ed25519 key, in any form `Dkim.sign` takes: a
     * `CryptoKey`, a PEM `PRIVATE KEY` or `RSA PRIVATE KEY`, or a JWK. The key type sets `a=`.
     */
    privateKey: CryptoKey | string | JsonWebKey;
    /**
     * The ARC-Authentication-Results payload: this server's authserv-id and the results it found,
     * such as `mx.example.com; spf=pass smtp.mailfrom=example.org`. It may be folded with CRLF
     * and whitespace.
     */
    authResults: string;
    /**
     * The `cv=` value: the `result` of `Arc.verify` for this message. Required when the message
     * already has ARC fields. @default 'none' for a message without them
     */
    chainValidation?: Result.Code | undefined;
    /**
     * The fields the ARC-Message-Signature signs, as in `Dkim.sign`. ARC fields and
     * Authentication-Results are never signed (RFC 8617 section 4.1.2).
     * @default DKIM-Signature, Delivered-To and the fields `Dkim.sign` signs
     */
    headers?: readonly string[] | undefined;
    /** The signature time (`t=`). @default new Date() */
    now?: Date | undefined;
    /** Creates the body hash, as in `Dkim.sign`. @default buffers the body for `crypto.subtle.digest` */
    hasher?: ((hash: Dkim.Hash) => Dkim.Hasher) | undefined;
    /** Stops reading the message, and rejects with `signal.reason`. */
    signal?: AbortSignal | undefined;
  };
}

const statuses = new Set<string>(['none', 'pass', 'fail']);
const unsigned = new Set([
  'arc-seal',
  'arc-message-signature',
  'arc-authentication-results',
  'authentication-results',
]);
const arcDefaultHeaders = ['DKIM-Signature', 'Delivered-To', ...defaultHeaders];

/**
 * Adds an ARC set to a message (RFC 8617 section 5.1) and resolves to its three fields, ending in
 * CRLF, to put above the message's other fields: ARC-Seal, ARC-Message-Signature and
 * ARC-Authentication-Results. The new set's instance is one above the highest instance on the
 * message. The ARC-Message-Signature uses relaxed/relaxed canonicalization, and with `cv=fail`
 * the seal covers only the new set (section 5.1.2).
 *
 * Throws a `TypeError` or `RangeError` for invalid options, such as an `authResults` with a line
 * break that isn't folding, and `Arc.InvalidInputError` for a message that must not be sealed.
 *
 * @example
 * ```ts
 * import * as Arc from '@portable/arc';
 *
 * const arc = await Arc.verify(message, { resolver });
 * const fields = await Arc.seal(message, {
 *   domain: 'lists.example.org',
 *   selector: 'arc',
 *   privateKey: env.ARC_PRIVATE_KEY,
 *   authResults: `lists.example.org; arc=${arc.result}; spf=pass smtp.mailfrom=example.com`,
 *   chainValidation: arc.result,
 * });
 * const forwarded = fields + message;
 * ```
 */
export async function seal(message: Message, options: seal.Options): Promise<string> {
  const { headers = arcDefaultHeaders, now = new Date(), hasher, signal } = options;
  const domain = normalizeName('domain', options.domain, isDomainName);
  const selector = normalizeName('selector', options.selector, isSelector);
  if (!canFitDns(`${selector}._domainkey.${domain}`)) {
    throw new RangeError('The key name <selector>._domainkey.<domain> is too long for DNS.');
  }
  const authResults = normalizeAuthResults(options.authResults);
  const { chainValidation } = options;
  if (chainValidation !== undefined && !statuses.has(chainValidation)) {
    throw new RangeError('options.chainValidation must be none, pass or fail.');
  }
  const names = assertHeaders(headers).filter((name) => !unsigned.has(lowerAscii(name)));
  const timestamp = seconds('now', now);
  const key = await importPrivateKey(options.privateKey);
  const type = keyType(key)!;
  if (type === 'rsa' && (key.algorithm as RsaHashedKeyAlgorithm).modulusLength < 1024) {
    throw new RangeError('RSA keys shorter than 1024 bits are not allowed (RFC 8301 section 3.2).');
  }
  signal?.throwIfAborted();

  const split = await splitMessage(message);
  const refuse = async (error: Error): Promise<never> => {
    await split.body.cancel();
    throw error;
  };
  const fields = parseFields(toBinary(split.header));
  const top = newest(fields);
  if (top.cv === 'fail') {
    return refuse(
      new InvalidInputError(
        `The newest ARC-Seal (i=${top.instance}) has cv=fail, so it can't be sealed again.`,
      ),
    );
  }
  if (top.instance >= maxInstance) {
    return refuse(
      new InvalidInputError(`The message has ${top.instance} ARC sets, the most RFC 8617 allows.`),
    );
  }
  const instance = top.instance + 1;
  const chained = fields.some(isArcField);
  const cv = chainValidation ?? (chained ? undefined : 'none');
  if (cv === undefined) {
    return refuse(
      new TypeError('options.chainValidation is required for a message that has ARC fields.'),
    );
  }
  if (chained === (cv === 'none') || (cv === 'pass' && instance === 1)) {
    return refuse(
      new RangeError(
        cv === 'none'
          ? `cv=none is only for a message without ARC fields (this set is i=${instance}).`
          : `cv=${cv} needs an ARC chain, and the message has ${chained ? 'no valid ARC set' : 'none'}.`,
      ),
    );
  }
  const covered: Field[] = [];
  if (cv === 'pass') {
    const chain = readChain(fields);
    if (typeof chain === 'string') {
      return refuse(new InvalidInputError(`cv=pass needs an intact ARC chain: ${chain}.`));
    }
    for (const set of chain) {
      covered.push(set.results, set.signature, set.seal);
    }
  }
  const selected = selectForSigning(
    fields.filter((field) => !isArcField(field) && field.name !== 'authentication-results'),
    names,
  );
  if (!selected.some((field) => field.name === 'from')) {
    return refuse(new InvalidInputError('The message has no From field to sign.'));
  }

  const cancel = () => void split.body.cancel().catch(() => {});
  signal?.addEventListener('abort', cancel, { once: true });
  const digests = await hashBody(split.body, [{ canonicalization: 'relaxed' }], hasher).finally(
    () => signal?.removeEventListener('abort', cancel),
  );
  signal?.throwIfAborted();
  const bodyHash = Base64.encode([...digests.values()][0]!.digest);

  const algorithm = `a=${type}-sha256;`;
  const signedNames = [...selected.map(casedName), ...overSigned(names, selected)];
  const signaturePrefix = fold('ARC-Message-Signature', [
    `i=${instance};`,
    algorithm,
    'c=relaxed/relaxed;',
    `d=${domain};`,
    `s=${selector};`,
    `t=${timestamp};`,
    ...signedNames.map(
      (name, i) => `${i === 0 ? 'h=' : ''}${name}${i === signedNames.length - 1 ? ';' : ':'}`,
    ),
    `bh=${bodyHash};`,
    'b=',
  ]);
  const signature = appendValue(
    signaturePrefix,
    Base64.encode(
      await signData(key, type, fromBinary(signedData(selected, signaturePrefix, 'relaxed'))),
    ),
  );
  const results = `ARC-Authentication-Results: i=${instance}; ${authResults}`;
  covered.push(field(results), field(signature));
  const sealPrefix = fold('ARC-Seal', [
    `i=${instance};`,
    algorithm,
    `t=${timestamp};`,
    `cv=${cv};`,
    `d=${domain};`,
    `s=${selector};`,
    'b=',
  ]);
  const sealed = appendValue(
    sealPrefix,
    Base64.encode(
      await signData(key, type, fromBinary(signedData(covered, sealPrefix, 'relaxed'))),
    ),
  );
  return `${sealed}\r\n${signature}\r\n${results}\r\n`;
}

const field = (text: string): Field => ({
  name: lowerAscii(text.slice(0, text.indexOf(':'))),
  raw: toBinary(new TextEncoder().encode(text)),
});

/**
 * The payload must not end the field early: a CR or LF is allowed only as folding, CRLF followed
 * by whitespace and more text.
 */
function normalizeAuthResults(value: unknown): string {
  if (typeof value !== 'string') {
    throw new TypeError('options.authResults must be a string.');
  }
  if (!/\S/.test(value)) {
    throw new RangeError('options.authResults is empty.');
  }
  if (/\r(?!\n[ \t]+[^ \t\r\n])|(?<!\r)\n/.test(value)) {
    throw new RangeError('options.authResults has a line break that is not folding.');
  }
  return value.trim();
}
