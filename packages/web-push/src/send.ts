import { encrypt, type Subscription } from './encrypt.js';
import { InvalidInputError, ResponseError } from './errors.js';
import { authorization, parseUrl, type Vapid } from './vapid.js';

/** How soon the push service should deliver the message (RFC 8030 §5.3). */
export type Urgency = 'very-low' | 'low' | 'normal' | 'high';

export declare namespace toRequest {
  type Options = {
    /** The browser's push subscription, from `PushSubscription.toJSON()`. */
    subscription: Subscription;
    /** The message to encrypt. Leave it out to send a push with no data. */
    payload?: string | Uint8Array | undefined;
    /** The VAPID subject and key pair that sign the request. */
    vapid: Vapid;
    /**
     * How long the push service keeps the message for an offline browser, in seconds. `0` means
     * deliver now or drop it. Push services may cap it. @default 2419200 (four weeks)
     */
    ttl?: number | undefined;
    /**
     * Lets the push service hold back low-priority messages to save battery. `toRequest` adds no
     * `Urgency` header by default.
     */
    urgency?: Urgency | undefined;
    /**
     * Replaces an undelivered message with the same topic, so an offline browser gets only the
     * latest. Up to 32 base64url characters.
     */
    topic?: string | undefined;
    /** The time the VAPID token's expiry is counted from. @default new Date() */
    now?: Date | undefined;
    /** Cancels the encryption and, through the `Request`, the `fetch`. */
    signal?: AbortSignal | undefined;
  };
}

/**
 * Builds the push request for a subscription: a `POST` to its endpoint with the encrypted payload
 * and the `TTL`, `Content-Encoding`, `Authorization`, `Urgency` and `Topic` headers. Use it to send
 * with your own `fetch` or queue. `send` calls it for you.
 *
 * @example
 * ```ts
 * import * as WebPush from '@portable/web-push';
 *
 * const request = await WebPush.toRequest({ subscription, payload: 'hello', vapid });
 * const response = await fetch(request);
 * ```
 *
 * @throws {InvalidInputError} When the endpoint isn't an `https:` URL, or a payload is given and the
 * subscription's keys are missing or malformed or the payload is longer than `maxPayloadBytes`.
 * @throws {RangeError} When `vapid`, `urgency` or `topic` is malformed, or `ttl` isn't a
 * non-negative integer.
 */
export async function toRequest(options: toRequest.Options): Promise<Request> {
  const { subscription, payload, ttl = 2419200, urgency, topic, signal } = options;
  const endpoint = typeof subscription?.endpoint === 'string' && parseUrl(subscription.endpoint);
  if (!endpoint || endpoint.protocol !== 'https:') {
    throw new InvalidInputError('The subscription endpoint must be an https: URL');
  }
  if (!Number.isSafeInteger(ttl) || ttl < 0) {
    throw new RangeError('ttl must be a non-negative integer');
  }
  if (urgency !== undefined && !urgencies.has(urgency)) {
    throw new RangeError(`urgency must be 'very-low', 'low', 'normal' or 'high'`);
  }
  if (topic !== undefined && !/^[\w-]{1,32}$/.test(topic)) {
    throw new RangeError('topic must be 1 to 32 base64url characters');
  }

  const headers = new Headers({ ttl: String(ttl) });
  if (urgency) {
    headers.set('urgency', urgency);
  }
  if (topic) {
    headers.set('topic', topic);
  }
  let body: Uint8Array<ArrayBuffer> | undefined;
  if (payload !== undefined) {
    body = await encrypt({ subscription, payload, signal });
    headers.set('content-encoding', 'aes128gcm');
    headers.set('content-type', 'application/octet-stream');
  }
  headers.set(
    'authorization',
    await authorization(endpoint.origin, options.vapid, options.now ?? new Date()),
  );
  signal?.throwIfAborted();
  return new Request(endpoint, {
    method: 'POST',
    headers,
    body: body ?? null,
    signal: signal ?? null,
  });
}

export declare namespace send {
  type Options = toRequest.Options & {
    /** Sends the request. Pass one to add retries, logging or a proxy. @default globalThis.fetch */
    fetch?: ((request: Request) => Promise<Response>) | undefined;
  };

  /**
   * - `'sent'`: the push service accepted the message (2xx).
   * - `'gone'`: the subscription expired or the user unsubscribed (404 or 410). Delete it.
   */
  type ReturnType = { kind: 'sent'; status: number } | { kind: 'gone'; status: 404 | 410 };
}

/**
 * Encrypts a payload, signs the request with VAPID, and sends it to the subscription's push
 * service. Leave out `payload` to send a push with no data.
 *
 * @example
 * ```ts
 * import * as WebPush from '@portable/web-push';
 *
 * const result = await WebPush.send({
 *   subscription,
 *   payload: JSON.stringify({ title: 'New message' }),
 *   vapid: { subject: 'mailto:ops@example.com', publicKey, privateKey },
 *   ttl: 3600,
 *   urgency: 'high',
 * });
 * if (result.kind === 'gone') {
 *   await deleteSubscription(subscription.endpoint);
 * }
 * ```
 *
 * @throws {ResponseError} When the push service answers with a status other than 2xx, 404 or 410.
 * @throws {InvalidInputError} When the endpoint isn't an `https:` URL, or a payload is given and the
 * subscription's keys are missing or malformed or the payload is longer than `maxPayloadBytes`.
 * @throws {RangeError} When an option is malformed.
 * @throws {TypeError} When `fetch` rejects.
 */
export async function send(options: send.Options): Promise<send.ReturnType> {
  const request = await toRequest(options);
  const response = await (options.fetch ?? fetch)(request);
  const { status } = response;
  if (response.ok || status === 404 || status === 410) {
    await response.body?.cancel();
    return status === 404 || status === 410 ? { kind: 'gone', status } : { kind: 'sent', status };
  }
  throw new ResponseError({ response, body: await response.text() });
}

const urgencies = new Set<unknown>(['very-low', 'low', 'normal', 'high']);
