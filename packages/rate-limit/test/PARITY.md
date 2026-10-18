# Test parity

Upstream suites: [rate-limiter-flexible 11.2.3 `test/`](https://github.com/animir/node-rate-limiter-flexible/tree/master/test), [limiter 4.1.0 `src/*.test.ts`](https://github.com/jhurliman/node-rate-limiter/tree/main/src) and the rate-limit parts of [bottleneck 2.19.5 `test/general.js` and `test/cluster.js`](https://github.com/SGrondin/bottleneck/tree/master/test). No fixtures are copied.

`take.conformance.ts`, `store.conformance.ts` and `headers.conformance.ts` run in Node and Chromium. `take.oracle.test.ts` compares 24,000 random takes with limiter's `TokenBucket`, which is the same continuous model, in rates that are exact in binary. rate-limiter-flexible counts in fixed windows, so its output differs by design and there is no oracle against it.

## rate-limiter-flexible

The suite has one file per store (Redis, Mongo, Postgres, MySQL, SQLite, DynamoDB, Memcache, etcd, Prisma, Drizzle, Valkey, cluster). Each repeats the memory tests against a database client, which this package doesn't ship; the store contract is tested once in `store.conformance.ts`. The table maps `RateLimiterMemory.test.js` and the shared files.

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| consume 1 point | `take > counts remaining down to 0` | |
| can not consume more than maximum points | `cost > denies a cost larger than burst forever` | |
| execute evenly over duration (with minimum delay) | `burst > burst 1 spaces requests period / limit apart` | `burst: 1` is GCRA's even spacing. There is no delay inside `take`. |
| updates msBeforeNext after execEvenly delay | `take > allows the request once retryAfter has passed, and not a millisecond sooner` | |
| uses updated derived minimum delay after points is mutated | skipped | Options can't be changed after `create`. |
| keeps execEvenly immediate when points is mutated to zero | skipped | As above. |
| makes penalty | `cost > takes cost from the allowance` | `penalty` adds points without a check. Use `take` with a cost. |
| reward points | `cost > a negative cost gives allowance back, up to burst` | |
| use keyPrefix from options | skipped | No `keyPrefix`; prefix the key. |
| blocks key for block duration / do not block twice / block expires / block custom key | skipped | No `blockDuration`. The README shows a second limiter instead. |
| get by key | `cost > a cost of 0 reads the state without changing it` | |
| get resolves null if key is not set | `take > starts each key with a full allowance` | |
| delete resolves true / false | `cost > a negative cost gives allowance back, up to burst` | No `delete`; a cost of `-burst` restores the key. |
| consume / penalty / reward applies options.customDuration | skipped | No per-call duration. |
| does not expire key if duration set to 0 | `options > throws a RangeError for period 0` | A counter that never resets isn't a rate. |
| block key forever, set points by key, set points by key forever | skipped | No `block` or `set`. |
| consume should start new time window if previous already expired | `take > never holds more than burst after a long idle time`, `store > what take writes > a ttl after which the key holds a full allowance` | |
| does not allow to consume if points is zero | `options > throws a RangeError for limit 0` | We reject `limit: 0` instead of denying every request. |
| RateLimiterAbstract: accepts number / zero / negative points; throws for missing, null, string, object, boolean points | `options > throws a RangeError for limit %s` | Zero and negative are rejected. |
| RateLimiterAbstract: accepts positive / zero duration; throws for missing, negative, null, string, object duration | `options > throws a RangeError for period %s`, `options > accepts a fractional period` | |
| RateLimiterAbstract: execEvenlyMinDelayMs (8 tests) | skipped | No `execEvenly` option. |
| RateLimiterAbstract: parseKey (4 tests), do not prefix key if keyPrefix is empty | skipped | No key prefix. |
| RateLimiterRes (7 tests) | `take > returns the full result for an allowed request` | Results are plain objects, so `toJSON` and `toString` don't apply. |
| BurstyRateLimiter: consume from limiter, then bursty, then reject | `burst > allows burst requests at once, then limit per period` | One limiter with `burst` replaces two chained limiters. |
| BurstyRateLimiter: do not consume from burst limiter if the first rejects with an error; reject with burst limiter error | `store errors > reject take with the error from get`, `store errors > reject take with the error from set` | |
| BurstyRateLimiter: combined msBeforeNext, returns points, null if key does not exist, msBeforeNext=0 if not set | `take > resetAt is when the allowance is full again`, `take > starts each key with a full allowance` | |
| RateLimiterStoreAbstract: delete in-memory blocked keys | skipped | No in-memory block cache in front of the store. |
| RateLimiterQueue (21 tests) | skipped | No queue. A Worker can't hold a request across others to wait; callers wait `retryAfter`. |
| RateLimiterMemoryPersistence, RLWrapperBlackAndWhite, RLWrapperTimeouts, RateLimiterUnion, RateLimiterInsuredAbstract, ExpressBruteFlexible, RateLimiterCompatibleAbstract | skipped | Wrappers and integrations outside the limiter. An allow list is an `if` before `take`; a union is several `take` calls. |

## limiter

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| TokenBucket: is initialized empty | `take > starts each key with a full allowance` | We start full on purpose (see Known upstream issues). |
| TokenBucket: removing 10 tokens takes 1 second; removing another 10 takes 1 second; removing 1 token takes 100ms | `take > gives allowance back continuously, one request per period / limit`, `take > allows the request once retryAfter has passed, and not a millisecond sooner` | `take` doesn't wait; `retryAfter` says how long. |
| TokenBucket: waiting 2 seconds gives us only 10 tokens | `take > never holds more than burst after a long idle time` | |
| RateLimiter: invalid interval, valid intervals | `options > throws a RangeError for period %s` | `period` is milliseconds, not a unit name. |
| accounts for concurrent immediate calls before their promises resolve | `concurrent takes > allow exactly limit of 100 racing takes` | |
| rechecks interval limits after waking and resets the interval | `take > allows limit requests in every period over many periods` | |
| does not double-charge a parent when sibling requests compete | skipped | No parent buckets. Two `take` calls on two limiters do the same. |
| rejects invalid token count -1, NaN, Infinity without changing balances | `cost > throws a RangeError for cost %s` | `-1` is a refund here. |
| rejects invalid interval 0, -1, NaN, Infinity | `options > throws a RangeError for period %s` | |
| serves a large backlog in FIFO order with one active timer | skipped | No waiting, so no timers. |
| preserves zero-rate and unlimited bucket semantics | skipped | `limit` must be positive. |
| rejects impossible parent requests without poisoning the queue | `cost > denies a cost larger than burst forever` | |
| rejects cyclic hierarchies | skipped | No parent buckets. |
| supports fractional counts and intervals | `cost > accepts fractional costs`, `options > accepts a fractional period` | |
| does not corrupt balances when a finite interval produces an infinite rate; computes finite waits for very small inputs | skipped | Time comes from `Date.now()` in whole milliseconds; see `take > allows exactly limit requests in one millisecond when period / limit is not a whole number` for the float handling. |
| caps long delays instead of overflowing platform timers | skipped | No timers. |
| matches an integer reference model across competing hierarchical requests | `take.oracle.test.ts` | Compared with `TokenBucket` itself, without parents. |
| rechecks capacity consumed by synchronous callers while an async request waits | `concurrent takes > retry a take whose compare-and-set lost, and decide again on the new value` | |
| getWaitTime does not consume or reserve tokens | `cost > a cost of 0 reads the state without changing it` | |
| waits for the interval even when the bucket has refilled (#25, #61) | `take > gives allowance back continuously, one request per period / limit` | limiter's `RateLimiter` adds a fixed interval on top of the bucket. We have only the continuous refill. |
| includes refill time when an interval has expired | `take > returns the time until the next request fits for a denied request` | |
| rounds fractional waits up and validates impossible requests | `take > allows the request once retryAfter has passed, and not a millisecond sooner`, `cost > denies a cost larger than burst forever` | `retryAfter` is a whole number of milliseconds, `Infinity` for a cost that can't fit. |
| drains the reported 5,000-request backlog in FIFO order with one timer (#85) | skipped | No waiting. |

## bottleneck

Bottleneck is a job scheduler. Its concurrency, priority, batching, grouping, retries, events, job status and stop tests (`DLList.js`, `batcher.js`, `context.js`, `group.js`, `priority.js`, `promises.js`, `retries.js`, `states.js`, `stop.js` and most of `general.js` and `cluster.js`) belong to `@portable/queue`. These are the rate-limit tests:

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| Reservoir Refresh: should auto-refresh the reservoir; staggered X by Y usage | `take > allows limit requests in every period over many periods` | A refresh resets the count at fixed times. A limiter with the same `limit` and `period` gives the same average without the burst at each refresh. |
| Reservoir Increase: auto-increase; up to a maximum; staggered X by Y usage | `burst > allows burst requests at once, then limit per period` | `reservoirIncreaseMaximum` is `burst`. |
| Weight: should support custom job weights; should overflow at the correct rate | `cost > takes cost from the allowance`, `cost > denies a cost larger than what remains, and reports what remains` | |
| Weight: should not add jobs with a weight above the maxConcurrent | `cost > denies a cost larger than burst forever` | |
| cluster: should compute reservoir increased based on number of missed intervals | `take > gives allowance back continuously, one request per period / limit` | |
| cluster: should publish capacity changes on reservoir changes | skipped | No events. |
| Reservoir: should keep process alive until queue is empty | skipped | No timers or queue. |

## Our own tests

`store.conformance.ts` tests the store contract: races between 100 takes on a store with random delays, two limiters sharing a store, a lost compare-and-set, a store without compare-and-set (to show why the contract asks for it), store errors, what `take` writes, and `memoryStore` expiry and sweeping. `headers.conformance.ts` tests the header fields against the draft's syntax. `take.conformance.ts > signal` tests cancellation.

## Known upstream issues

| Issue | Our behavior | Test |
| --- | --- | --- |
| rate-limiter-flexible's fixed window lets a client make `2 × points` requests across a window boundary. | GCRA has no windows. | `take > allows no second burst across what would be a fixed-window boundary` |
| rate-limiter-flexible adds the points of a rejected `consume` to the counter, so retrying keeps a client blocked. | A denied request takes nothing. | `take > a denied request consumes nothing` |
| rate-limiter-flexible rejects a denied `consume` with a `RateLimiterRes`, which isn't an `Error`, so a denial and a store failure share a `catch`. | `take` resolves with `allowed: false` and rejects only for errors. | `store errors > reject take with the error from get` |
| rate-limiter-flexible's memory store sets a `setTimeout` per key. | `memoryStore` sweeps on write and sets no timers. | `memoryStore > keeps live keys while sweeping expired ones` |
| limiter's `TokenBucket` starts empty, so a fresh process makes its first callers wait. | Every key starts with `burst`. | `take > starts each key with a full allowance` |
| limiter's `RateLimiter` waits for a fixed interval to end even after the bucket refilled (#25, #61). | Allowance comes back continuously. | `take > gives allowance back continuously, one request per period / limit` |
