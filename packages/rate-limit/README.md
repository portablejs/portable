# @portable/rate-limit

Limits requests per key with the generic cell rate algorithm (GCRA), storing state in memory, Workers KV, a Durable Object, or Redis over HTTP. Runs in browsers, Cloudflare Workers, Node 24+, Bun, and Deno.

Replaces [rate-limiter-flexible](https://www.npmjs.com/package/rate-limiter-flexible), [limiter](https://www.npmjs.com/package/limiter), and the reservoir options of [bottleneck](https://www.npmjs.com/package/bottleneck).

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

A limiter allows `limit` requests per `period` for each key. The allowance refills one request every `period / limit` milliseconds, and an idle key can spend up to `burst` at once.

This works like a token bucket of size `burst`, but the store holds only one number per key: the time when its allowance is full again.

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
| `burst` | `limit` | Requests allowed at once after a time with no requests. `burst: 1` spaces requests `period / limit` apart. |
| `store` | `memoryStore()` | Where the limiter keeps its state. |

`create` throws a `RangeError` for a `limit` or `burst` that isn't a positive integer, or a `period` that isn't a positive finite number.

### `take` options

| Option | Default | Description |
| --- | --- | --- |
| `cost` | `1` | How much allowance the request uses, as a finite number, which can be fractional. `NaN` or `Infinity` rejects with a `RangeError`. `cost: 0` reads the state without changing it, and `allowed` is then always `true`. A negative cost gives allowance back, up to `burst`. |
| `now` | `new Date()` | The time of the request, as a `Date` or a `Temporal.Instant`. |
| `signal` | none | Aborting rejects `take` with `signal.reason` before the next store call. The signal is passed to the store. |

### `Result`

| Field | Description |
| --- | --- |
| `allowed` | Whether the request was allowed. |
| `limit`, `period` | The limiter's options, for `headers`. |
| `remaining` | How many more requests of cost 1 would be allowed right now. |
| `resetAt` | The `Date` at which `remaining` is back to `burst`. |
| `retryAfter` | Milliseconds until the same request would be allowed. `0` when allowed, and `Infinity` when `cost` is larger than `burst`. |

### `headers`

```ts
RateLimit.headers(result);
// { 'RateLimit-Policy': '"default";q=100;w=60', RateLimit: '"default";r=0;t=3', 'Retry-After': '3' }
```

`q` is `limit`, `w` is `period` in seconds, and `r` is `remaining`. `t` is the seconds until the allowance is full, or `retryAfter` for a denied request. Times are rounded up to whole seconds.

`Retry-After` is left out when `retryAfter` is `Infinity`.

Pass `{ name }` to change the policy name from `"default"`. It must be printable ASCII, or `headers` throws a `RangeError`. Pass `{ now }` to count `t` from another time.

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

`get` returns the stored number, or `undefined` for a missing or expired key. `set` is a compare-and-set: it writes `value` only if the key's value is still `expected`, and returns whether it wrote.

When `set` returns `false`, `take` reads the key and tries again, with no retry limit, so return `false` only when another write changed the key. Pass a `signal` to limit how long `take` can run.

`ttl` is a whole number of milliseconds, at least 1, after which the key may be deleted. `now` is the limiter's `now` option, for a store that expires keys itself.

Limiters that share a store also share the allowance for a key, so give each one its own key prefix, such as `login:${ip}`, unless they should share it.

### Memory

`memoryStore()` deletes expired keys without timers. Each isolate or process has its own map, so on Workers or behind a load balancer the limit applies per instance.

### Durable Object

A Durable Object handles one request at a time, and its SQLite-backed storage is synchronous, so the count is exact. Put the limiter inside the object, with one object per key:

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

A Lua script runs the compare-and-set on the server, so every Worker sees the same count. A `take` makes two requests, or more when it races another one.

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

The script compares strings, which works because `String(Number(text))` returns the text `String` wrote.

### Workers KV

KV has no compare-and-set, and a write can take 60 seconds or more to reach other locations, so the limit is approximate. KV also accepts at most one write per second to a key.

Use KV for coarse limits, such as a daily quota, and a Durable Object when the count must be exact.

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

## Why use this over rate-limiter-flexible, limiter, and bottleneck

rate-limiter-flexible has a store class for each Node database client, so it can't use KV, a Durable Object, or Redis over `fetch`. limiter and bottleneck keep their state in one process. Here a store has two methods, so any storage that can compare and set one number works.

- rate-limiter-flexible counts in fixed windows by default, so a client can make `2 × points` requests across a window boundary. GCRA allows at most `burst + t × limit / period` requests in any `t` milliseconds.
- `take` spends nothing on a denied request. rate-limiter-flexible counts rejected `consume` calls, so retrying keeps a client blocked until the window ends.
- `take` resolves with `allowed: false` for a denied request. rate-limiter-flexible rejects with a `RateLimiterRes`, which isn't an `Error`, so one `catch` gets both denials and Redis outages.
- rate-limiter-flexible's memory store sets a timer per key. `memoryStore()` sets none.
- limiter's `TokenBucket` starts empty, so the first requests after start wait. Every key here starts with a full `burst`.
- With the memory store, `take` was about 15% slower than `RateLimiterMemory.consume` on allowed requests and about 5× faster on denied ones. limiter's synchronous `tryRemoveTokens` was about 6× faster than an `await`ed `take`.
- `period` is in milliseconds. rate-limiter-flexible's `duration` is in seconds, so `duration: 1` becomes `period: 1000`. limiter's `interval` also takes names such as `'second'`.
- `limit: 0` throws a `RangeError`. rate-limiter-flexible accepts `points: 0` and denies everything.
- `period` must be above 0. rate-limiter-flexible's `duration: 0` means a counter that never resets.
- `retryAfter` is `0` for an allowed request, unlike rate-limiter-flexible's `msBeforeNext`. Use `resetAt` for the time until the allowance is full.
- Instead of rate-limiter-flexible's `reward`, `get`, and `delete`, call `take` with a negative `cost`, `cost: 0`, or `cost: -burst`.
- Instead of rate-limiter-flexible's `keyPrefix`, prefix the key yourself. Instead of `blockDuration`, call a second limiter with a long `period` when the first one denies a request.
- There is no queue like limiter's `removeTokens` or rate-limiter-flexible's `RateLimiterQueue`, because a Worker can't wait across requests. Use `retryAfter` instead.
- bottleneck's `reservoirRefreshAmount` resets the count at fixed intervals. A limiter with the same `limit` and `period` allows the same average rate without a burst at each refresh.

<!-- bench:start -->
<table>
<thead><tr><th align="left">Library</th><th align="right">Ops/s</th><th align="left">Relative</th><th></th></tr></thead>
<tbody>
<tr><th colspan="4" align="left">10 rounds of <code>take</code> on 1,000 keys</th></tr>
<tr><td>rate-limiter-flexible</td><td align="right">218</td><td>1.2× faster</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>@portable/rate-limit</td><td align="right">184</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="135" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left"><code>take</code> of a denied request</th></tr>
<tr><td>@portable/rate-limit</td><td align="right">4,210</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>rate-limiter-flexible</td><td align="right">891</td><td>4.7× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="34" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">1,000 × <code>take</code> on one key</th></tr>
<tr><td>limiter</td><td align="right">16,800</td><td>5.8× faster</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>@portable/rate-limit</td><td align="right">2,910</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="28" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Build the rate-limit headers</th></tr>
<tr><td>@portable/rate-limit</td><td align="right">1,440</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
</tbody>
</table>

Operations per second from `pnpm bench`, higher is better, in Node 24.22.0, on Intel(R) Xeon(R) Processor @ 2.10GHz (4 cores). Each benchmark lists only the libraries that can do the same work, fastest first. The relative speed compares each library with @portable/rate-limit, and the bars are scaled to the fastest library.

| Library | Version | Minified and gzipped | Runtime dependencies | Node built-ins | TypeScript types |
| --- | --- | ---: | ---: | --- | --- |
| @portable/rate-limit | – | 1.2 kB | 2 | none | included |
| rate-limiter-flexible | 11.2.3 | 17 kB | 0 | `Buffer`, `cluster`, `crypto` | included |
| limiter | 4.1.0 | 1.4 kB | 0 | none | included |

Sizes cover the imports in the usage example, or the equivalent imports of each library, bundled for the browser by `scripts/bundle-size.ts`. Runtime dependencies count every package installed with the published package. A library that uses Node built-ins needs polyfills in a browser and the `nodejs_compat` flag in Cloudflare Workers.
<!-- bench:end -->
