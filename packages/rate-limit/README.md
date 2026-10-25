# @portable/rate-limit

Rate limiting per key with the generic cell rate algorithm (GCRA) and a store you choose: memory, Workers KV, a Durable Object or Redis over HTTP. Runs in browsers, Cloudflare Workers, Deno, Bun and Node 24+.

Replaces [rate-limiter-flexible](https://www.npmjs.com/package/rate-limiter-flexible), [limiter](https://www.npmjs.com/package/limiter) and the reservoir options of [bottleneck](https://www.npmjs.com/package/bottleneck).

```sh
npm install @portable/rate-limit
```

```ts
import * as RateLimit from '@portable/rate-limit';

const limiter = RateLimit.create({ limit: 100, period: 60_000 });

export default {
  async fetch(request: Request) {
    const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
    const result = await limiter.take(ip, { signal: request.signal });
    if (!result.allowed) {
      return new Response(null, { status: 429, headers: RateLimit.headers(result) });
    }
    return new Response('ok', { headers: RateLimit.headers(result) });
  },
};
```

A limiter allows `limit` requests per `period` for each key. Allowance comes back continuously, one request every `period / limit` milliseconds, and a key that has been quiet can spend up to `burst` at once. This is the same model as a token bucket of size `burst` that refills at `limit` per `period`, but the store holds one number per key: the time at which the key's allowance would be full again.

## API

| Export | Does |
| --- | --- |
| `create(options)` | Returns a limiter with one method, `take(key, options)`. |
| `limiter.take(key, options)` | Takes `cost` from the key's allowance if that much is left, and resolves to a `Result`. A denied request takes nothing. |
| `headers(result, options)` | Returns `RateLimit` and `RateLimit-Policy` ([draft-ietf-httpapi-ratelimit-headers-11](https://datatracker.ietf.org/doc/draft-ietf-httpapi-ratelimit-headers/)) as a plain object, plus `Retry-After` for a denied request. |
| `memoryStore()` | A store that keeps keys in a `Map` in this isolate or process. It is the default. |
| `Store` | The type a store implements. |

### `create` options

| Option | Default | Description |
| --- | --- | --- |
| `limit` | required | Requests allowed per `period`, on average. A positive integer. |
| `period` | required | Length of the period, in milliseconds. |
| `burst` | `limit` | Requests allowed at once after a quiet spell. `burst: 1` spaces requests `period / limit` apart. |
| `store` | `memoryStore()` | Where the limiter keeps its state. |

`create` throws a `RangeError` for a `limit` or `burst` that isn't a positive integer, or a `period` that isn't a positive finite number.

### `take` options

| Option | Default | Description |
| --- | --- | --- |
| `cost` | `1` | How much of the allowance the request uses, such as its size. `0` reads the state without changing it. A negative cost gives allowance back, up to `burst`. |
| `now` | `new Date()` | The time of the request, for tests or for a clock other than the system's. A `Date` or a `Temporal.Instant`. |
| `signal` | none | Aborting rejects `take` with `signal.reason` before the next store call. The signal is passed to the store. |

### `Result`

| Field | Description |
| --- | --- |
| `allowed` | Whether the request fits. |
| `limit`, `period` | The limiter's options, for `headers`. |
| `remaining` | How many more requests of cost 1 fit right now. |
| `resetAt` | The `Date` at which `remaining` is back to `burst`. |
| `retryAfter` | Milliseconds until the same request would fit. `0` when allowed, and `Infinity` when `cost` is larger than `burst`. |

### `headers`

```ts
RateLimit.headers(result);
// { 'RateLimit-Policy': '"default";q=100;w=60', RateLimit: '"default";r=0;t=3', 'Retry-After': '3' }
```

`q` is `limit` and `w` is `period` in seconds. `r` is `remaining`. For an allowed request, `t` is the number of seconds until the allowance is full again. For a denied request, `t` is `retryAfter`, so `Retry-After` never ends before `t`, as the IETF RateLimit header draft requires. All times round up to whole seconds. Pass `{ name }` to change the policy name from `"default"`, and `{ now }` to count `t` from a time other than the current one. `Retry-After` is left out when `retryAfter` is `Infinity`.

## Stores

```ts
type Store = {
  get(
    key: string,
    options: { now?: Date; signal?: AbortSignal },
  ): number | undefined | Promise<number | undefined>;
  set(
    key: string,
    value: number,
    options: { expected: number | undefined; ttl: number; now?: Date; signal?: AbortSignal },
  ): boolean | Promise<boolean>;
};
```

`get` returns the stored number, or `undefined` for a missing or expired key. `set` is a compare-and-set: it writes `value` only if the key still holds `expected`, and returns whether it wrote. `ttl` is a whole number of milliseconds, at least 1, after which the key may be deleted. `now` is the limiter's `now` option as a `Date`, or the current time, so if your store expires keys itself, it can use the same clock as the limiter. When `set` returns `false`, `take` reads the key again and decides again, so two requests that race on one key can't both spend the last allowance.

Several limiters can share a store. Give each one its own key prefix, such as `login:${ip}`, unless they should share the allowance.

### Memory

`memoryStore()` deletes an expired key when it reads it, and sweeps all expired keys whenever the map has doubled in size since the last sweep. It uses no timers. Each isolate or process has its own map, so on Workers or behind a load balancer the limit applies per instance.

### Durable Object

A Durable Object runs one request at a time, and SQLite-backed storage is synchronous, so a read and a write in one `take` can't interleave with another request. Put the limiter inside the object and address one object per key:

```ts
import { DurableObject } from 'cloudflare:workers';
import * as RateLimit from '@portable/rate-limit';

export class Limiter extends DurableObject {
  limiter = RateLimit.create({
    limit: 100,
    period: 60_000,
    store: {
      get: (key) => this.ctx.storage.kv.get<number>(key),
      set: (key, value) => (this.ctx.storage.kv.put(key, value), true),
    },
  });

  take(key: string, cost?: number) {
    return this.limiter.take(key, { cost });
  }
}

// In the Worker:
const stub = env.LIMITER.get(env.LIMITER.idFromName(ip));
const result = await stub.take(ip);
```

The object stores one number and ignores `ttl`.

### Upstash Redis over HTTP

A Lua script runs the compare-and-set on the server, so every Worker sees the same count. A `take` makes two requests, or more when it loses a race.

```ts
import * as RateLimit from '@portable/rate-limit';

const compareAndSet = `
if (redis.call('GET', KEYS[1]) or '') ~= ARGV[1] then return 0 end
redis.call('SET', KEYS[1], ARGV[2], 'PX', ARGV[3])
return 1`;

function upstash(url: string, token: string): RateLimit.Store {
  async function command(args: (string | number)[], signal?: AbortSignal) {
    const response = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(args),
      signal: signal ?? null,
    });
    const { result, error } = (await response.json()) as { result: unknown; error?: string };
    if (error) {
      throw new Error(error);
    }
    return result;
  }
  return {
    async get(key, { signal }) {
      const value = await command(['GET', key], signal);
      return value === null ? undefined : Number(value);
    },
    async set(key, value, { expected, ttl, signal }) {
      const args = ['EVAL', compareAndSet, 1, key, expected === undefined ? '' : String(expected), String(value), ttl];
      return (await command(args, signal)) === 1;
    },
  };
}

const limiter = RateLimit.create({
  limit: 100,
  period: 60_000,
  store: upstash(env.UPSTASH_REDIS_REST_URL, env.UPSTASH_REDIS_REST_TOKEN),
});
```

`String(Number(text))` returns the same text for any number `String` wrote, so the script's string comparison matches the value `get` returned.

### Workers KV

KV is eventually consistent and has no compare-and-set, so this store always writes. Two locations can each read an old value and allow a request, and a write can take 60 seconds or more to reach other locations, so the limit is approximate. KV also accepts at most one write per second to a key. Use it for coarse limits, such as a daily quota, where letting some extra requests through is acceptable, and use a Durable Object when the count must be exact.

```ts
const store: RateLimit.Store = {
  async get(key) {
    const value = await env.RATE_LIMIT.get(key);
    return value === null ? undefined : Number(value);
  },
  async set(key, value, { ttl }) {
    await env.RATE_LIMIT.put(key, String(value), { expirationTtl: Math.max(60, Math.ceil(ttl / 1000)) });
    return true;
  },
};
```

## Types

| Type | Description |
| --- | --- |
| `RateLimit.Limiter` | What `create` returns, with `take`. |
| `RateLimit.Result` | What `take` resolves to. Durations are milliseconds. |
| `RateLimit.Store` | Where a limiter keeps one number per key. See [Stores](#stores). |

## Why use this over rate-limiter-flexible, limiter and bottleneck

rate-limiter-flexible ships a store class per database client, all of them Node clients, so it can't use KV, a Durable Object or a `fetch`-based Redis. limiter and bottleneck keep their state in one process. This package defines a store with two methods, so you can use any storage that can compare and set one number, and it has no dependencies outside `@portable/*`.

- rate-limiter-flexible counts in fixed windows by default, so a client can make `2 × points` requests across a window boundary. GCRA has no windows: in any span of `t` milliseconds a key gets at most `burst + t × limit / period` requests.
- `take` spends nothing on a denied request. rate-limiter-flexible adds the points of a rejected `consume` to the counter, so a client that keeps retrying stays blocked until the window ends.
- `take` resolves with `allowed: false` for a denied request. rate-limiter-flexible rejects the promise with a `RateLimiterRes`, which is not an `Error`, so a denial and a Redis outage arrive in the same `catch`.
- rate-limiter-flexible's memory store sets one timer per key to delete it. `memoryStore()` sets none, so a limiter with many keys doesn't hold a timer for each.
- limiter's `TokenBucket` starts empty, so the first requests after start wait. Every key here starts with a full `burst`.
- On Node, `take` with the memory store runs about 15% slower than `RateLimiterMemory.consume` on allowed requests over 1,000 keys, and about 5× faster on denied requests, because rate-limiter-flexible builds and rejects with an object for each denial. limiter's synchronous `tryRemoveTokens` on one bucket is about 6× faster than an `await`ed `take`. The benchmark table below has the numbers.
- rate-limiter-flexible's `duration` is in seconds, and limiter's `interval` also takes names such as `'second'`. `period` is always in milliseconds, so `duration: 1` becomes `period: 1000`.
- `limit: 0` throws a `RangeError`. rate-limiter-flexible accepts `points: 0` and denies everything.
- `period` must be above 0. rate-limiter-flexible's `duration: 0` means a counter that never resets, which a rate doesn't express.
- rate-limiter-flexible's `msBeforeNext` is set for allowed and denied requests. `retryAfter` is `0` for an allowed request, so compute the time until the allowance is full from `resetAt`.
- rate-limiter-flexible's `reward`, `get` and `delete` have no equivalent methods. Call `take` with a negative `cost`, with `cost: 0` or with `cost: -burst`.
- rate-limiter-flexible's `keyPrefix` and `blockDuration` options have no equivalent. Prefix the key yourself, and for a block, use a second limiter with a long `period` that you call only when the first denies.
- The package has no queue. limiter's `removeTokens` and rate-limiter-flexible's `RateLimiterQueue` wait for allowance in memory, which a Worker can't do across requests. Use `retryAfter` instead.
- Bottleneck's `reservoirRefreshAmount` resets the count at fixed intervals, which is a fixed window. A limiter with the same `limit` and `period` allows the same average rate without the burst at each refresh.

<!-- bench:start -->
| | @portable/rate-limit | rate-limiter-flexible | limiter |
| --- | ---: | ---: | ---: |
| 10 rounds of `take` on 1,000 keys | 184 | 218 | – |
| `take` of a denied request | 4,210 | 891 | – |
| 1,000 × `take` on one key | 2,910 | – | 16,800 |
| Build the rate-limit headers | 1,440 | – | – |

Operations per second from `pnpm bench`, higher is better, in Node 24.22.0, on Intel(R) Xeon(R) Processor @ 2.10GHz (4 cores). A dash means the library has no equivalent.

| | @portable/rate-limit | rate-limiter-flexible | limiter |
| --- | --- | --- | --- |
| Minified and gzipped | 1.2 kB | 17 kB | 1.4 kB |
| Runtime dependencies | 2 | 0 | 0 |
| Node built-ins used | none | `Buffer`, `cluster`, `crypto` | none |
| TypeScript types | included | included | included |
| Version compared | – | 11.2.3 | 4.1.0 |

Sizes cover the imports in the usage example, or the equivalent imports of each library, bundled for the browser by `scripts/bundle-size.ts`. Runtime dependencies count every package installed with the published package. A library that uses Node built-ins needs polyfills in a browser and the `nodejs_compat` flag in Cloudflare Workers.
<!-- bench:end -->
