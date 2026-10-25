import * as Base64 from '@portable/base64';
import { VerificationError } from './errors.js';
import { fromHex, prefixed, required, seconds, toHex, unix } from './internal.js';

/**
 * How one sender signs webhooks, as plain functions. `verify` and `sign` do the rest the same way
 * for every scheme: HMAC-SHA256 with the `hmac` option, the length check and constant-time
 * compare, several secrets, and the timestamp tolerance.
 *
 * Use `standard` (the default), `stripe`, `github` or `slack`, or write one for another sender.
 * `stripe` is a complete example. See the README.
 */
export type Scheme = {
  /**
   * Reads the signatures from the headers, decoded to bytes, and the timestamp and delivery id if
   * the sender sends them. Throws a `VerificationError` for a missing or malformed header.
   */
  parse: (headers: Headers) => Scheme.Signed;
  /**
   * Returns what the sender signs: the body, often with the timestamp or id before it. `id` and
   * `timestamp` are what `parse` returned, or what `sign` will send.
   */
  payload: (signed: {
    id: string | undefined;
    timestamp: Date | undefined;
    body: Uint8Array;
  }) => Uint8Array | string;
  /** Returns the headers to send with a signed body, for `sign`. */
  headers: (signed: {
    signature: Uint8Array;
    id: string;
    timestamp: Date;
  }) => Record<string, string>;
  /** Turns a secret given as a string into the HMAC key. @default its UTF-8 bytes */
  key?: ((secret: string) => Uint8Array) | undefined;
};

export declare namespace Scheme {
  type Signed = {
    /** Every signature in the headers, decoded to bytes. One match is enough. */
    signatures: readonly Uint8Array[];
    /** The signed time. Leave it out if the sender signs none. */
    timestamp?: Date | undefined;
    /** The delivery id, which `verify` returns for dropping duplicates. */
    id?: string | undefined;
  };
}

/**
 * [Standard Webhooks](https://www.standardwebhooks.com), used by Svix, Resend, Clerk and others.
 * Reads `webhook-id`, `webhook-timestamp` and `webhook-signature`, or the `svix-` headers when
 * those are missing, and signs `{id}.{timestamp}.{body}`. The secret is base64, with or without
 * the `whsec_` prefix. `v1a` (ed25519) signatures are ignored. This is the default scheme.
 *
 * @example
 * ```ts
 * import * as Webhooks from '@portable/webhooks';
 *
 * const { body } = await Webhooks.verify(request, { secret: 'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw' });
 * ```
 */
export const standard: Scheme = {
  parse(headers) {
    const get = (name: string) => required(headers, `webhook-${name}`, `svix-${name}`);
    const signatures: Uint8Array[] = [];
    for (const entry of get('signature').split(' ')) {
      if (!entry.startsWith('v1,')) {
        continue;
      }
      try {
        signatures.push(Base64.decode(entry.slice(3)));
      } catch {}
    }
    return { signatures, id: get('id'), timestamp: seconds(get('timestamp'), 'webhook-timestamp') };
  },
  payload: ({ id, timestamp, body }) => prefixed(`${id}.${unix(timestamp!)}.`, body),
  headers: ({ signature, id, timestamp }) => ({
    'webhook-id': id,
    'webhook-timestamp': unix(timestamp),
    'webhook-signature': `v1,${Base64.encode(signature)}`,
  }),
  key(secret) {
    try {
      return Base64.decode(secret.startsWith('whsec_') ? secret.slice(6) : secret);
    } catch (error) {
      throw new RangeError('Secret is not base64', { cause: error });
    }
  },
};

/**
 * Stripe's `stripe-signature: t=<seconds>,v1=<hex>` header, signed over `{timestamp}.{body}`.
 * The secret is used as UTF-8 text, `whsec_` prefix included.
 *
 * @example
 * ```ts
 * import * as Webhooks from '@portable/webhooks';
 *
 * const { body } = await Webhooks.verify(request, { scheme: Webhooks.stripe, secret });
 * ```
 */
export const stripe: Scheme = {
  parse(headers) {
    let timestamp: Date | undefined;
    const signatures: Uint8Array[] = [];
    for (const item of required(headers, 'stripe-signature').split(',')) {
      const [key, value = ''] = item.split('=').map((part) => part.trim());
      if (key === 't') {
        if (timestamp) {
          throw new VerificationError({ code: 'malformed-header', message: 'Two timestamps' });
        }
        timestamp = seconds(value, 'stripe-signature');
      }
      const signature = key === 'v1' ? fromHex(value) : undefined;
      if (signature) {
        signatures.push(signature);
      }
    }
    if (!timestamp) {
      throw new VerificationError({ code: 'malformed-header', message: 'No timestamp' });
    }
    return { signatures, timestamp };
  },
  payload: ({ timestamp, body }) => prefixed(`${unix(timestamp!)}.`, body),
  headers: ({ signature, timestamp }) => ({
    'stripe-signature': `t=${unix(timestamp)},v1=${toHex(signature)}`,
  }),
};

/**
 * GitHub's `x-hub-signature-256: sha256=<hex>` header, signed over the body alone, with the
 * `x-github-delivery` id. The secret is UTF-8 text. GitHub signs no timestamp, and its SHA-1
 * `x-hub-signature` header is ignored.
 *
 * @example
 * ```ts
 * import * as Webhooks from '@portable/webhooks';
 *
 * const { body, id } = await Webhooks.verify(request, { scheme: Webhooks.github, secret });
 * ```
 */
export const github: Scheme = {
  parse(headers) {
    const header = required(headers, 'x-hub-signature-256');
    const signature = header.startsWith('sha256=') ? fromHex(header.slice(7)) : undefined;
    if (!signature) {
      throw new VerificationError({ code: 'malformed-header', message: 'Expected sha256=<hex>' });
    }
    return { signatures: [signature], id: headers.get('x-github-delivery') ?? undefined };
  },
  payload: ({ body }) => body,
  headers: ({ signature, id }) => ({
    'x-hub-signature-256': `sha256=${toHex(signature)}`,
    'x-github-delivery': id,
  }),
};

/**
 * Slack's `x-slack-signature: v0=<hex>` and `x-slack-request-timestamp` headers, signed over
 * `v0:{timestamp}:{body}`. The signing secret is UTF-8 text.
 *
 * @example
 * ```ts
 * import * as Webhooks from '@portable/webhooks';
 *
 * const { body } = await Webhooks.verify(request, { scheme: Webhooks.slack, secret });
 * const command = new URLSearchParams(body);
 * ```
 */
export const slack: Scheme = {
  parse(headers) {
    const header = required(headers, 'x-slack-signature');
    const timestamp = required(headers, 'x-slack-request-timestamp');
    const signature = header.startsWith('v0=') ? fromHex(header.slice(3)) : undefined;
    if (!signature) {
      throw new VerificationError({ code: 'malformed-header', message: 'Expected v0=<hex>' });
    }
    return { signatures: [signature], timestamp: seconds(timestamp, 'x-slack-request-timestamp') };
  },
  payload: ({ timestamp, body }) => prefixed(`v0:${unix(timestamp!)}:`, body),
  headers: ({ signature, timestamp }) => ({
    'x-slack-request-timestamp': unix(timestamp),
    'x-slack-signature': `v0=${toHex(signature)}`,
  }),
};
